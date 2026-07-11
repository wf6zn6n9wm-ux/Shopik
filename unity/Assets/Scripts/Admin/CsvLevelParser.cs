// -----------------------------------------------------------------------------
//  CsvLevelParser.cs — разбор CSV с размещениями предметов в LevelDto.
//
//  Табличный формат импорта: удобно готовить уровни в Excel/Google Sheets и
//  выгружать в CSV. Одна строка = одно размещение предмета. Строки одного
//  уровня группируются по levelId; мета-поля уровня берутся из первой строки
//  этого уровня (последующие непустые значения тоже применяются).
//
//  СХЕМА CSV (первая строка — заголовок, регистр имён игнорируется):
//    Обязательные:
//      levelId   — идентификатор уровня (ключ группировки)
//      itemId    — идентификатор предмета (ссылка на HiddenItemData.Id)
//      x, y      — нормализованные координаты 0..1
//    Необязательные (координаты предмета):
//      radius    — радиус зоны попадания (доля ширины), по умолчанию 0.05
//      rotation  — поворот спрайта в градусах, по умолчанию 0
//      count     — сколько экземпляров нужно (0 → 1), по умолчанию 1
//    Необязательные мета-поля уровня (достаточно указать в любой строке уровня):
//      title, worldId, description, background, thumbnail,
//      difficulty (Easy|Normal|Hard|Expert),
//      timeLimit, mistakesAllowed, rewardCoins, rewardXp,
//      threeStarTime, twoStarTime
//
//  Пример:
//    levelId,title,worldId,difficulty,timeLimit,itemId,x,y,radius,rotation,count
//    lvl_01,Погреб,world_meadow,Normal,120,key,0.1,0.2,0.05,0,1
//    lvl_01,,,,,apple,0.5,0.6,0.04,15,2
//
//  Требования уровня (RequiredItems) НЕ входят в CSV — они генерируются
//  автоматически конвертером из размещений.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using Findoria.Data;

namespace Findoria.Admin
{
    /// <summary>
    /// Парсер CSV → список <see cref="LevelDto"/>. Минимальный, но устойчивый:
    /// поддерживает поля в кавычках с запятыми и экранированные кавычки ("").
    /// Не бросает исключений на кривой ввод — логирует и пропускает строку.
    /// </summary>
    public static class CsvLevelParser
    {
        /// <summary>
        /// Разбирает CSV-текст в список DTO уровней. Возвращает пустой список,
        /// если ввод пуст, состоит из одного заголовка или не содержит levelId/itemId.
        /// </summary>
        public static List<LevelDto> Parse(string csv)
        {
            var result = new List<LevelDto>();
            if (string.IsNullOrWhiteSpace(csv))
            {
                Debug.LogError("[CsvLevelParser] Пустой CSV — нечего разбирать.");
                return result;
            }

            var lines = SplitLines(csv);
            if (lines.Count < 2)
            {
                Debug.LogError("[CsvLevelParser] В CSV нет строк данных (только заголовок или пусто).");
                return result;
            }

            // Заголовок → карта имя колонки (в нижнем регистре) → индекс.
            var header = SplitCsvLine(lines[0]);
            var col = new Dictionary<string, int>();
            for (int i = 0; i < header.Count; i++)
            {
                var name = header[i].Trim().ToLowerInvariant();
                if (!string.IsNullOrEmpty(name) && !col.ContainsKey(name)) col[name] = i;
            }

            if (!col.ContainsKey("levelid") || !col.ContainsKey("itemid"))
            {
                Debug.LogError("[CsvLevelParser] В заголовке нет обязательных колонок 'levelId' и/или 'itemId'.");
                return result;
            }

            // Группировка уровней по levelId с сохранением порядка появления.
            var byId = new Dictionary<string, LevelDto>();

            for (int r = 1; r < lines.Count; r++)
            {
                if (string.IsNullOrWhiteSpace(lines[r])) continue;

                var cells = SplitCsvLine(lines[r]);
                string levelId = Get(cells, col, "levelid");
                string itemId = Get(cells, col, "itemid");

                if (string.IsNullOrEmpty(levelId))
                {
                    Debug.LogWarning($"[CsvLevelParser] Строка {r + 1}: пустой levelId — пропуск.");
                    continue;
                }

                // Найти/создать DTO уровня.
                if (!byId.TryGetValue(levelId, out var level))
                {
                    level = new LevelDto { id = levelId };
                    byId[levelId] = level;
                    result.Add(level);
                }

                // Мета-поля уровня: применяем непустые значения (последнее выигрывает).
                ApplyMeta(level, cells, col);

                // Строка без itemId — только мета-описание уровня, размещения нет.
                if (string.IsNullOrEmpty(itemId)) continue;

                level.items.Add(new ItemPlacementDto
                {
                    itemId = itemId,
                    x = ParseFloat(Get(cells, col, "x"), 0f),
                    y = ParseFloat(Get(cells, col, "y"), 0f),
                    radius = ParseFloat(Get(cells, col, "radius"), 0.05f),
                    rotation = ParseFloat(Get(cells, col, "rotation"), 0f),
                    count = ParseInt(Get(cells, col, "count"), 1)
                });
            }

            return result;
        }

        /// <summary>Применяет необязательные мета-поля уровня из строки CSV.</summary>
        private static void ApplyMeta(LevelDto level, List<string> cells, Dictionary<string, int> col)
        {
            string title = Get(cells, col, "title");
            if (!string.IsNullOrEmpty(title)) level.title = title;

            string worldId = Get(cells, col, "worldid");
            if (!string.IsNullOrEmpty(worldId)) level.worldId = worldId;

            string description = Get(cells, col, "description");
            if (!string.IsNullOrEmpty(description)) level.description = description;

            string background = Get(cells, col, "background");
            if (!string.IsNullOrEmpty(background)) level.background = background;

            string thumbnail = Get(cells, col, "thumbnail");
            if (!string.IsNullOrEmpty(thumbnail)) level.thumbnail = thumbnail;

            string difficulty = Get(cells, col, "difficulty");
            if (!string.IsNullOrEmpty(difficulty)) level.difficulty = difficulty;

            string timeLimit = Get(cells, col, "timelimit");
            if (!string.IsNullOrEmpty(timeLimit)) level.timeLimit = ParseFloat(timeLimit, level.timeLimit);

            string mistakes = Get(cells, col, "mistakesallowed");
            if (!string.IsNullOrEmpty(mistakes)) level.mistakesAllowed = ParseInt(mistakes, level.mistakesAllowed);

            string rewardCoins = Get(cells, col, "rewardcoins");
            if (!string.IsNullOrEmpty(rewardCoins)) level.rewardCoins = ParseInt(rewardCoins, level.rewardCoins);

            string rewardXp = Get(cells, col, "rewardxp");
            if (!string.IsNullOrEmpty(rewardXp)) level.rewardXp = ParseInt(rewardXp, level.rewardXp);

            string threeStar = Get(cells, col, "threestartime");
            if (!string.IsNullOrEmpty(threeStar)) level.threeStarTime = ParseFloat(threeStar, level.threeStarTime);

            string twoStar = Get(cells, col, "twostartime");
            if (!string.IsNullOrEmpty(twoStar)) level.twoStarTime = ParseFloat(twoStar, level.twoStarTime);
        }

        // ------------------------------------------------------------- Утилиты ---

        /// <summary>Безопасно достаёт значение ячейки по имени колонки.</summary>
        private static string Get(List<string> cells, Dictionary<string, int> col, string name)
        {
            return col.TryGetValue(name, out int idx) && idx < cells.Count
                ? cells[idx].Trim()
                : string.Empty;
        }

        private static float ParseFloat(string s, float fallback)
        {
            return float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out float v) ? v : fallback;
        }

        private static int ParseInt(string s, int fallback)
        {
            return int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out int v) ? v : fallback;
        }

        /// <summary>Разбивает текст на логические строки, учитывая \r\n, \n и \r.</summary>
        private static List<string> SplitLines(string csv)
        {
            var normalized = csv.Replace("\r\n", "\n").Replace('\r', '\n');
            var raw = normalized.Split('\n');
            var lines = new List<string>(raw.Length);
            foreach (var line in raw) lines.Add(line);
            // Убираем возможную пустую последнюю строку от завершающего перевода строки.
            if (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[lines.Count - 1]))
                lines.RemoveAt(lines.Count - 1);
            return lines;
        }

        /// <summary>
        /// Разбивает одну CSV-строку на поля. Поддерживает поля в двойных кавычках
        /// (в которых допустимы запятые) и экранирование кавычки удвоением ("").
        /// </summary>
        private static List<string> SplitCsvLine(string line)
        {
            var fields = new List<string>();
            var sb = new System.Text.StringBuilder();
            bool inQuotes = false;

            for (int i = 0; i < line.Length; i++)
            {
                char c = line[i];

                if (inQuotes)
                {
                    if (c == '"')
                    {
                        // Удвоенная кавычка внутри кавычек → одна кавычка.
                        if (i + 1 < line.Length && line[i + 1] == '"')
                        {
                            sb.Append('"');
                            i++;
                        }
                        else
                        {
                            inQuotes = false;
                        }
                    }
                    else
                    {
                        sb.Append(c);
                    }
                }
                else
                {
                    if (c == '"')
                    {
                        inQuotes = true;
                    }
                    else if (c == ',')
                    {
                        fields.Add(sb.ToString());
                        sb.Clear();
                    }
                    else
                    {
                        sb.Append(c);
                    }
                }
            }

            fields.Add(sb.ToString());
            return fields;
        }
    }
}
