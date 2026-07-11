// -----------------------------------------------------------------------------
//  LevelImporterWindow.cs — редакторное окно импорта уровней (JSON/CSV).
//
//  Инструмент контент-команды: выбираешь файл уровней, а окно создаёт
//  LevelData-ассеты в Assets/Levels/Generated/ и автоматически заводит
//  недостающие HiddenItemData для всех упомянутых предметов. Опционально —
//  прописывает новые уровни и предметы в выбранный GameCatalog.
//
//  Использует рантайм-парсеры (CsvLevelParser/RuntimeLevelLoader) и конвертер
//  (LevelDtoConverter), не дублируя логику. Никогда не бросает исключения
//  наружу — все ошибки показываются через EditorUtility.DisplayDialog.
// -----------------------------------------------------------------------------
#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using Findoria.Core;
using Findoria.Data;

namespace Findoria.Admin.EditorTools
{
    /// <summary>Окно импорта уровней из JSON/CSV в ScriptableObject-ассеты.</summary>
    public sealed class LevelImporterWindow : EditorWindow
    {
        // Каталоги генерации ассетов.
        private const string GeneratedFolder = "Assets/Levels/Generated";
        private const string ItemsFolder = "Assets/Levels/Generated/Items";

        // Ссылка на каталог для (необязательного) добавления контента.
        private GameCatalog _catalog;
        // Добавлять ли импортированный контент в каталог.
        private bool _addToCatalog;
        // Прокрутка лог-области.
        private Vector2 _scroll;
        // Последний отчёт об импорте (для показа в окне).
        private string _lastReport = string.Empty;

        [MenuItem("Findoria/Level Importer")]
        public static void Open()
        {
            var window = GetWindow<LevelImporterWindow>("Level Importer");
            window.minSize = new Vector2(420, 320);
            window.Show();
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("Импорт уровней Findoria", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Импортирует уровни из JSON (LevelPackDto) или CSV. Создаёт ассеты в\n" +
                GeneratedFolder + " и заводит недостающие предметы в " + ItemsFolder + ".",
                MessageType.Info);

            EditorGUILayout.Space();

            // --- Необязательная привязка к каталогу ---
            _addToCatalog = EditorGUILayout.ToggleLeft(
                "Добавлять импортированный контент в GameCatalog", _addToCatalog);
            using (new EditorGUI.DisabledScope(!_addToCatalog))
            {
                _catalog = (GameCatalog)EditorGUILayout.ObjectField(
                    "GameCatalog", _catalog, typeof(GameCatalog), false);
            }

            EditorGUILayout.Space();

            // --- Кнопки импорта ---
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Импорт JSON…", GUILayout.Height(32)))
                {
                    ImportJson();
                }
                if (GUILayout.Button("Импорт CSV…", GUILayout.Height(32)))
                {
                    ImportCsv();
                }
            }

            EditorGUILayout.Space();

            // --- Отчёт ---
            if (!string.IsNullOrEmpty(_lastReport))
            {
                EditorGUILayout.LabelField("Отчёт об импорте:", EditorStyles.boldLabel);
                _scroll = EditorGUILayout.BeginScrollView(_scroll, GUILayout.ExpandHeight(true));
                EditorGUILayout.TextArea(_lastReport, GUILayout.ExpandHeight(true));
                EditorGUILayout.EndScrollView();
            }
        }

        // ------------------------------------------------------------- Импорт ---

        private void ImportJson()
        {
            string path = EditorUtility.OpenFilePanel("Выберите JSON с уровнями", Application.dataPath, "json");
            if (string.IsNullOrEmpty(path)) return;

            try
            {
                string json = File.ReadAllText(path);
                var pack = RuntimeLevelLoader.ParsePack(json);
                if (pack == null || pack.levels == null || pack.levels.Count == 0)
                {
                    Fail("В файле нет уровней или он повреждён.\n" + path);
                    return;
                }

                var levels = LevelDtoConverter.ToLevelData(pack);
                RunImport(levels, pack.levels);
            }
            catch (System.Exception ex)
            {
                Fail("Ошибка чтения/разбора JSON:\n" + ex.Message);
            }
        }

        private void ImportCsv()
        {
            string path = EditorUtility.OpenFilePanel("Выберите CSV с уровнями", Application.dataPath, "csv");
            if (string.IsNullOrEmpty(path)) return;

            try
            {
                string csv = File.ReadAllText(path);
                var dtos = CsvLevelParser.Parse(csv);
                if (dtos == null || dtos.Count == 0)
                {
                    Fail("В CSV не найдено уровней. Проверьте заголовок и колонки levelId/itemId.");
                    return;
                }

                var levels = new List<LevelData>();
                foreach (var dto in dtos)
                {
                    var level = LevelDtoConverter.ToLevelData(dto);
                    if (level != null) levels.Add(level);
                }
                RunImport(levels, dtos);
            }
            catch (System.Exception ex)
            {
                Fail("Ошибка чтения/разбора CSV:\n" + ex.Message);
            }
        }

        /// <summary>
        /// Общий конвейер: создать/обновить ассеты уровней, завести недостающие
        /// предметы, (опционально) прописать всё в каталог и сохранить проект.
        /// </summary>
        private void RunImport(List<LevelData> levels, List<LevelDto> sourceDtos)
        {
            if (levels == null || levels.Count == 0)
            {
                Fail("После конвертации не осталось валидных уровней.");
                return;
            }

            EnsureFolder(GeneratedFolder);
            EnsureFolder(ItemsFolder);

            int levelsCreated = 0, levelsUpdated = 0, itemsCreated = 0;
            var report = new System.Text.StringBuilder();

            // Собираем все упомянутые itemId из размещений.
            var referencedItems = CollectItemIds(sourceDtos);

            // 1) Завести недостающие HiddenItemData.
            var itemAssets = new Dictionary<string, HiddenItemData>();
            foreach (var itemId in referencedItems)
            {
                bool created;
                var itemAsset = EnsureItemAsset(itemId, out created);
                if (itemAsset != null)
                {
                    itemAssets[itemId] = itemAsset;
                    if (created) { itemsCreated++; report.AppendLine($"+ предмет: {itemId}"); }
                }
            }

            // 2) Создать/обновить уровни.
            var levelAssets = new List<LevelData>();
            foreach (var level in levels)
            {
                if (string.IsNullOrEmpty(level.Id))
                {
                    report.AppendLine("! уровень без id — пропущен");
                    continue;
                }

                bool wasCreated;
                var saved = SaveLevelAsset(level, out wasCreated);
                if (saved == null) continue;

                levelAssets.Add(saved);
                if (wasCreated) { levelsCreated++; report.AppendLine($"+ уровень: {saved.Id}"); }
                else { levelsUpdated++; report.AppendLine($"~ уровень (обновлён): {saved.Id}"); }
            }

            // 3) Опционально — прописать в каталог.
            if (_addToCatalog)
            {
                if (_catalog == null)
                {
                    report.AppendLine("! GameCatalog не выбран — контент не добавлен в каталог.");
                }
                else
                {
                    int addedLevels, addedItems, worldsMissing;
                    AddToCatalog(levelAssets, itemAssets, out addedLevels, out addedItems, out worldsMissing);
                    report.AppendLine($"→ в каталог добавлено: уровней {addedLevels}, предметов {addedItems}.");
                    if (worldsMissing > 0)
                        report.AppendLine($"! уровней без подходящего мира (worldId не найден): {worldsMissing}.");
                }
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            string summary =
                $"Импорт завершён.\nУровней создано: {levelsCreated}, обновлено: {levelsUpdated}.\n" +
                $"Предметов создано: {itemsCreated}.\n\n" + report;
            _lastReport = summary;
            Debug.Log("[LevelImporter] " + summary);
            EditorUtility.DisplayDialog("Level Importer",
                $"Готово.\nУровней: +{levelsCreated} / ~{levelsUpdated}\nПредметов: +{itemsCreated}", "OK");
        }

        // ----------------------------------------------------- Работа с ассетами -

        /// <summary>
        /// Сохраняет уровень как ассет .asset. Если ассет уже есть — обновляет его
        /// через CopySerialized (сохраняя GUID и ссылки), иначе создаёт новый.
        /// </summary>
        private static LevelData SaveLevelAsset(LevelData level, out bool created)
        {
            created = false;
            string path = $"{GeneratedFolder}/{Sanitize(level.Id)}.asset";
            var existing = AssetDatabase.LoadAssetAtPath<LevelData>(path);

            if (existing != null)
            {
                // Перенести данные в существующий ассет, не меняя его GUID.
                EditorUtility.CopySerialized(level, existing);
                EditorUtility.SetDirty(existing);
                Object.DestroyImmediate(level); // временный инстанс больше не нужен
                return existing;
            }

            AssetDatabase.CreateAsset(level, path);
            EditorUtility.SetDirty(level);
            created = true;
            return level;
        }

        /// <summary>
        /// Возвращает существующий HiddenItemData по id или создаёт новый ассет
        /// с человекочитаемым DisplayName.
        /// </summary>
        private static HiddenItemData EnsureItemAsset(string itemId, out bool created)
        {
            created = false;
            if (string.IsNullOrEmpty(itemId)) return null;

            string path = $"{ItemsFolder}/{Sanitize(itemId)}.asset";
            var existing = AssetDatabase.LoadAssetAtPath<HiddenItemData>(path);
            if (existing != null) return existing;

            var item = ScriptableObject.CreateInstance<HiddenItemData>();
            item.Id = itemId;
            item.DisplayName = Prettify(itemId);
            AssetDatabase.CreateAsset(item, path);
            EditorUtility.SetDirty(item);
            created = true;
            return item;
        }

        /// <summary>
        /// Прописывает уровни в подходящие миры каталога, а предметы — в
        /// GameCatalog.Items. Дубликаты не добавляет. Помечает изменённые ассеты.
        /// </summary>
        private void AddToCatalog(
            List<LevelData> levels,
            Dictionary<string, HiddenItemData> items,
            out int addedLevels, out int addedItems, out int worldsMissing)
        {
            addedLevels = 0;
            addedItems = 0;
            worldsMissing = 0;

            // Предметы каталога.
            foreach (var kv in items)
            {
                var item = kv.Value;
                if (item != null && !_catalog.Items.Contains(item))
                {
                    _catalog.Items.Add(item);
                    addedItems++;
                }
            }

            // Уровни — в соответствующий WorldData по WorldId.
            foreach (var level in levels)
            {
                if (level == null) continue;

                var world = FindWorld(level.WorldId);
                if (world == null)
                {
                    worldsMissing++;
                    continue;
                }

                if (!world.Levels.Contains(level))
                {
                    world.Levels.Add(level);
                    EditorUtility.SetDirty(world);
                    addedLevels++;
                }
            }

            EditorUtility.SetDirty(_catalog);
        }

        /// <summary>Ищет мир каталога по идентификатору (без учёта регистра).</summary>
        private WorldData FindWorld(string worldId)
        {
            if (_catalog == null || _catalog.Worlds == null || string.IsNullOrEmpty(worldId)) return null;
            foreach (var w in _catalog.Worlds)
            {
                if (w != null && string.Equals(w.Id, worldId, System.StringComparison.OrdinalIgnoreCase))
                    return w;
            }
            return null;
        }

        // ------------------------------------------------------------- Утилиты ---

        /// <summary>Собирает уникальные itemId из размещений всех DTO уровней.</summary>
        private static List<string> CollectItemIds(List<LevelDto> dtos)
        {
            var seen = new HashSet<string>();
            var ordered = new List<string>();
            if (dtos == null) return ordered;

            foreach (var dto in dtos)
            {
                if (dto?.items == null) continue;
                foreach (var it in dto.items)
                {
                    if (it == null || string.IsNullOrEmpty(it.itemId)) continue;
                    if (seen.Add(it.itemId)) ordered.Add(it.itemId);
                }
            }
            return ordered;
        }

        /// <summary>Создаёт папку ассетов рекурсивно, если её ещё нет.</summary>
        private static void EnsureFolder(string assetFolder)
        {
            if (AssetDatabase.IsValidFolder(assetFolder)) return;

            string parent = Path.GetDirectoryName(assetFolder).Replace('\\', '/');
            string leaf = Path.GetFileName(assetFolder);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }

        /// <summary>Делает id безопасным для имени файла ассета.</summary>
        private static string Sanitize(string id)
        {
            if (string.IsNullOrEmpty(id)) return "unnamed";
            var chars = id.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                bool ok = char.IsLetterOrDigit(c) || c == '_' || c == '-';
                if (!ok) chars[i] = '_';
            }
            return new string(chars);
        }

        /// <summary>«item_red_key» → «Red Key»: человекочитаемое имя из id.</summary>
        private static string Prettify(string id)
        {
            if (string.IsNullOrEmpty(id)) return "Item";

            // Отрезаем частый префикс "item_".
            string s = id;
            if (s.StartsWith("item_", System.StringComparison.OrdinalIgnoreCase))
                s = s.Substring(5);

            s = s.Replace('_', ' ').Replace('-', ' ').Trim();
            if (s.Length == 0) return id;

            var parts = s.Split(' ');
            var sb = new System.Text.StringBuilder();
            foreach (var p in parts)
            {
                if (p.Length == 0) continue;
                if (sb.Length > 0) sb.Append(' ');
                sb.Append(char.ToUpperInvariant(p[0]));
                if (p.Length > 1) sb.Append(p.Substring(1));
            }
            return sb.ToString();
        }

        /// <summary>Показывает ошибку пользователю и в консоли, не бросая исключений.</summary>
        private void Fail(string message)
        {
            _lastReport = "ОШИБКА: " + message;
            Debug.LogError("[LevelImporter] " + message);
            EditorUtility.DisplayDialog("Level Importer — ошибка", message, "OK");
        }
    }
}
#endif
