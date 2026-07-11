// -----------------------------------------------------------------------------
//  CatalogTools.cs — редакторные проверки целостности GameCatalog.
//
//  Инструмент валидации контента (только чтение — ничего не меняет). Проверяет
//  выбранный в Project GameCatalog (или первый найденный) и пишет в консоль
//  предупреждения о типичных ошибках наполнения: дубликаты id уровней,
//  ссылки размещений на неизвестные предметы, уровни без размещений.
// -----------------------------------------------------------------------------
#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using Findoria.Data;

namespace Findoria.Admin.EditorTools
{
    /// <summary>Меню-команды проверки каталога контента (read-only).</summary>
    public static class CatalogTools
    {
        [MenuItem("Findoria/Validate Catalog")]
        public static void ValidateCatalog()
        {
            var catalog = ResolveCatalog();
            if (catalog == null)
            {
                Debug.LogWarning("[CatalogTools] GameCatalog не найден. Выделите ассет каталога в Project " +
                                 "или создайте его (Findoria/Game Catalog).");
                return;
            }

            int warnings = 0;

            // Множество известных предметов (из каталога и из миров/уровней).
            var knownItemIds = BuildKnownItemIds(catalog);

            // Собираем все уровни из всех миров.
            var levelIdSeen = new HashSet<string>();

            if (catalog.Worlds == null || catalog.Worlds.Count == 0)
            {
                Debug.LogWarning($"[CatalogTools] Каталог '{catalog.name}' не содержит миров.");
                warnings++;
            }
            else
            {
                foreach (var world in catalog.Worlds)
                {
                    if (world == null)
                    {
                        Debug.LogWarning("[CatalogTools] В списке миров есть пустая (null) ссылка.");
                        warnings++;
                        continue;
                    }

                    if (world.Levels == null) continue;

                    foreach (var level in world.Levels)
                    {
                        if (level == null)
                        {
                            Debug.LogWarning($"[CatalogTools] Мир '{world.Id}' содержит пустую (null) ссылку на уровень.");
                            warnings++;
                            continue;
                        }

                        // 1) Дубликаты id уровней.
                        if (!levelIdSeen.Add(level.Id))
                        {
                            Debug.LogWarning($"[CatalogTools] Дубликат id уровня: '{level.Id}' " +
                                             $"(мир '{world.Id}').", level);
                            warnings++;
                        }

                        // 2) Уровни без размещений.
                        if (level.Placements == null || level.Placements.Count == 0)
                        {
                            Debug.LogWarning($"[CatalogTools] Уровень '{level.Id}' не содержит размещений предметов.",
                                             level);
                            warnings++;
                        }

                        // 3) Размещения, ссылающиеся на неизвестные предметы.
                        if (level.Placements != null)
                        {
                            foreach (var p in level.Placements)
                            {
                                if (string.IsNullOrEmpty(p.ItemId))
                                {
                                    Debug.LogWarning($"[CatalogTools] Уровень '{level.Id}': размещение с пустым ItemId.",
                                                     level);
                                    warnings++;
                                }
                                else if (!knownItemIds.Contains(p.ItemId))
                                {
                                    Debug.LogWarning($"[CatalogTools] Уровень '{level.Id}': размещение ссылается на " +
                                                     $"неизвестный предмет '{p.ItemId}'.", level);
                                    warnings++;
                                }
                            }
                        }
                    }
                }
            }

            if (warnings == 0)
                Debug.Log($"[CatalogTools] Каталог '{catalog.name}' проверен: замечаний нет.", catalog);
            else
                Debug.Log($"[CatalogTools] Каталог '{catalog.name}' проверен: замечаний — {warnings}.", catalog);
        }

        /// <summary>Каталог из текущего выделения, либо первый найденный в проекте.</summary>
        private static GameCatalog ResolveCatalog()
        {
            if (Selection.activeObject is GameCatalog selected) return selected;

            string[] guids = AssetDatabase.FindAssets("t:GameCatalog");
            if (guids != null && guids.Length > 0)
            {
                string path = AssetDatabase.GUIDToAssetPath(guids[0]);
                return AssetDatabase.LoadAssetAtPath<GameCatalog>(path);
            }
            return null;
        }

        /// <summary>
        /// Собирает множество известных id предметов: из GameCatalog.Items.
        /// Именно оно считается «правдой» о валидных предметах.
        /// </summary>
        private static HashSet<string> BuildKnownItemIds(GameCatalog catalog)
        {
            var set = new HashSet<string>();
            if (catalog.Items != null)
            {
                foreach (var item in catalog.Items)
                {
                    if (item != null && !string.IsNullOrEmpty(item.Id))
                        set.Add(item.Id);
                }
            }
            return set;
        }
    }
}
#endif
