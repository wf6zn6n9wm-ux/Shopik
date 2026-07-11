// -----------------------------------------------------------------------------
//  GameCatalog.cs — центральный реестр всего контента игры (ScriptableObject).
//  Один ассет, на который ссылается Bootstrap. Отсюда сервисы берут конфиг,
//  миры, предметы, бустеры, товары, задания, достижения и таблицу наград.
//  Добавление контента = правка ассета, без изменения кода.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;

namespace Findoria.Data
{
    [CreateAssetMenu(fileName = "GameCatalog", menuName = "Findoria/Game Catalog", order = -1)]
    public sealed class GameCatalog : ScriptableObject
    {
        public GameConfig Config;

        [Header("Контент")]
        public List<WorldData> Worlds = new();
        public List<HiddenItemData> Items = new();
        public List<BoosterData> Boosters = new();
        public List<ShopItemData> ShopItems = new();

        [Header("Мета-прогрессия")]
        public List<QuestDefinition> DailyQuestPool = new();
        public List<QuestDefinition> WeeklyQuestPool = new();
        public List<AchievementDefinition> Achievements = new();
        public DailyRewardTable DailyRewards;

        [Header("Ротация заданий")]
        public int DailyQuestSlots = 3;
        public int WeeklyQuestSlots = 2;

        // --- Индексы для быстрого поиска (строятся при инициализации) ---
        private Dictionary<string, HiddenItemData> _itemIndex;
        private Dictionary<string, BoosterData> _boosterIndex;

        public HiddenItemData GetItem(string id)
        {
            EnsureIndices();
            return _itemIndex.TryGetValue(id, out var it) ? it : null;
        }

        public BoosterData GetBooster(Core.BoosterType type)
        {
            EnsureIndices();
            return _boosterIndex.TryGetValue(type.ToString(), out var b) ? b : null;
        }

        private void EnsureIndices()
        {
            if (_itemIndex != null) return;
            _itemIndex = new Dictionary<string, HiddenItemData>();
            foreach (var it in Items) if (it && !_itemIndex.ContainsKey(it.Id)) _itemIndex[it.Id] = it;
            _boosterIndex = new Dictionary<string, BoosterData>();
            foreach (var b in Boosters) if (b) _boosterIndex[b.Type.ToString()] = b;
        }
    }
}
