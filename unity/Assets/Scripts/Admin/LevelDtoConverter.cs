// -----------------------------------------------------------------------------
//  LevelDtoConverter.cs — конвертация плоских DTO импорта в ScriptableObject'ы.
//
//  Мост между форматом импорта (LevelPackDto/LevelDto из JSON/CSV) и рантайм-
//  данными (LevelData). Используется как редакторными инструментами, так и
//  рантайм-загрузчиком, поэтому лежит в обычной сборке (Assembly-CSharp), а не
//  в редакторной. Не трогает файловую систему и AssetDatabase — только память.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using Findoria.Core;
using Findoria.Data;

namespace Findoria.Admin
{
    /// <summary>
    /// Набор статических помощников для превращения DTO уровней в
    /// <see cref="LevelData"/>. Чистое отображение полей без побочных эффектов.
    /// </summary>
    public static class LevelDtoConverter
    {
        /// <summary>
        /// Преобразует один <see cref="LevelDto"/> в новый экземпляр
        /// <see cref="LevelData"/> (ScriptableObject в памяти).
        /// Список требуемых предметов (<see cref="LevelData.RequiredItems"/>)
        /// генерируется автоматически из размещений — «автоматическая генерация
        /// списка предметов».
        /// </summary>
        public static LevelData ToLevelData(LevelDto dto)
        {
            if (dto == null)
            {
                Debug.LogError("[LevelDtoConverter] Получен null LevelDto — пропуск.");
                return null;
            }

            var level = ScriptableObject.CreateInstance<LevelData>();

            // --- Идентификация ---
            level.Id = dto.id ?? string.Empty;
            level.Title = dto.title ?? string.Empty;
            level.WorldId = dto.worldId ?? string.Empty;
            level.Description = dto.description ?? string.Empty;

            // --- Графика (адреса Addressables/Resources) ---
            level.Background = new AssetRef(dto.background);
            level.Thumbnail = new AssetRef(dto.thumbnail);

            // --- Правила ---
            // Разбор строки сложности; при неудаче — Normal по умолчанию.
            level.Difficulty = System.Enum.TryParse(dto.difficulty, ignoreCase: true, out Difficulty parsed)
                ? parsed
                : Difficulty.Normal;
            level.TimeLimitSeconds = dto.timeLimit;
            level.MistakesAllowed = dto.mistakesAllowed;

            // --- Награды и звёзды ---
            level.RewardCoins = dto.rewardCoins;
            level.RewardXp = dto.rewardXp;
            level.ThreeStarTime = dto.threeStarTime;
            level.TwoStarTime = dto.twoStarTime;

            // --- Предметы: размещения + автогенерация требований ---
            BuildItems(dto, level);

            return level;
        }

        /// <summary>Преобразует весь пакет уровней в список <see cref="LevelData"/>.</summary>
        public static List<LevelData> ToLevelData(LevelPackDto pack)
        {
            var result = new List<LevelData>();
            if (pack?.levels == null)
            {
                Debug.LogError("[LevelDtoConverter] Пустой или некорректный LevelPackDto.");
                return result;
            }

            foreach (var dto in pack.levels)
            {
                var level = ToLevelData(dto);
                if (level != null) result.Add(level);
            }
            return result;
        }

        /// <summary>
        /// Заполняет <see cref="LevelData.Placements"/> из DTO и
        /// АВТОМАТИЧЕСКИ генерирует <see cref="LevelData.RequiredItems"/>,
        /// группируя размещения по itemId и суммируя count'ы
        /// (count == 0 трактуется как 1, минимум 1 на размещение).
        /// </summary>
        private static void BuildItems(LevelDto dto, LevelData level)
        {
            level.Placements = new List<ItemPlacement>();
            level.RequiredItems = new List<ItemRequirement>();

            if (dto.items == null) return;

            // Копим требования по каждому itemId, сохраняя порядок первого появления.
            var order = new List<string>();
            var counts = new Dictionary<string, int>();

            foreach (var it in dto.items)
            {
                if (it == null || string.IsNullOrEmpty(it.itemId)) continue;

                // Размещение переносим один-к-одному.
                level.Placements.Add(new ItemPlacement
                {
                    ItemId = it.itemId,
                    X = it.x,
                    Y = it.y,
                    Radius = it.radius,
                    Rotation = it.rotation
                });

                // Автогенерация требований: count 0 → 1, иначе max(count, 1).
                int add = Mathf.Max(1, it.count);
                if (counts.ContainsKey(it.itemId))
                {
                    counts[it.itemId] += add;
                }
                else
                {
                    counts[it.itemId] = add;
                    order.Add(it.itemId);
                }
            }

            foreach (var id in order)
            {
                level.RequiredItems.Add(new ItemRequirement { ItemId = id, Count = counts[id] });
            }
        }
    }
}
