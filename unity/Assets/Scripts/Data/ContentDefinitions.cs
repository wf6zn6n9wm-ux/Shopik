// -----------------------------------------------------------------------------
//  ContentDefinitions.cs — прочие ScriptableObject'ы контента:
//  предметы, миры, бустеры, товары магазина, задания, достижения, ежедневные
//  награды и общий конфиг игры. Всё — чистые данные.
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;
using UnityEngine;
using Findoria.Core;

namespace Findoria.Data
{
    // ------------------------------------------------------------ Предмет ------

    [CreateAssetMenu(fileName = "Item_", menuName = "Findoria/Hidden Item", order = 1)]
    public sealed class HiddenItemData : ScriptableObject
    {
        public string Id = "item_key";
        public string DisplayName = "Ключ";
        public AssetRef Icon;        // иконка для списка внизу
        public string Category = "misc";
    }

    // -------------------------------------------------------------- Мир --------

    [CreateAssetMenu(fileName = "World_", menuName = "Findoria/World", order = 2)]
    public sealed class WorldData : ScriptableObject
    {
        public string Id = "world_meadow";
        public string Title = "Солнечная поляна";
        public AssetRef MapBackground;
        public Color Tint = Color.white;
        [Tooltip("Уровни этого мира по порядку")]
        public List<LevelData> Levels = new();
    }

    // ------------------------------------------------------------ Бустер -------

    [CreateAssetMenu(fileName = "Booster_", menuName = "Findoria/Booster", order = 3)]
    public sealed class BoosterData : ScriptableObject
    {
        public BoosterType Type = BoosterType.Hint;
        public string DisplayName = "Подсказка";
        [TextArea] public string Description = "Подсвечивает случайный ненайденный предмет.";
        public AssetRef Icon;
        public int PriceCoins = 150;
        [Tooltip("Длительность эффекта (для заморозки/лупы), сек")]
        public float Duration = 5f;
    }

    // ---------------------------------------------------------- Товар магазина -

    [CreateAssetMenu(fileName = "Shop_", menuName = "Findoria/Shop Item", order = 4)]
    public sealed class ShopItemData : ScriptableObject
    {
        public string Id = "coins_small";
        public ShopItemKind Kind = ShopItemKind.CoinPack;
        public string Title = "Горсть монет";
        public AssetRef Icon;

        [Header("Цена")]
        [Tooltip("ID продукта для магазина платформы (IAP). Пусто = покупка за внутриигровую валюту")]
        public string StoreProductId = "";
        public CurrencyType SoftPriceCurrency = CurrencyType.Gems;
        public int SoftPrice = 0;             // цена во внутриигровой валюте (если не IAP)

        [Header("Содержимое")]
        public List<Reward> Contents = new();
        public bool IsBestValue;
    }

    // ------------------------------------------------------------ Задание ------

    [CreateAssetMenu(fileName = "Quest_", menuName = "Findoria/Quest", order = 5)]
    public sealed class QuestDefinition : ScriptableObject
    {
        public string Id = "quest_find_20";
        public QuestPeriod Period = QuestPeriod.Daily;
        [TextArea] public string Description = "Найдите 20 предметов";
        public QuestMetric Metric = QuestMetric.FindItems;
        public int Target = 20;
        public Reward Reward = Core.Reward.Coins(100);
    }

    // --------------------------------------------------------- Достижение ------

    [CreateAssetMenu(fileName = "Achievement_", menuName = "Findoria/Achievement", order = 6)]
    public sealed class AchievementDefinition : ScriptableObject
    {
        public string Id = "ach_first_100";
        public string Title = "Зоркий глаз";
        [TextArea] public string Description = "Найдите 100 предметов за всё время";
        public AssetRef Icon;
        public AchievementMetric Metric = AchievementMetric.TotalItemsFound;
        public int Target = 100;
        public Reward Reward = Core.Reward.Gems(5);
    }

    // ------------------------------------------------- Ежедневные награды ------

    [CreateAssetMenu(fileName = "DailyRewardTable", menuName = "Findoria/Daily Reward Table", order = 7)]
    public sealed class DailyRewardTable : ScriptableObject
    {
        [Tooltip("Награды по дням серии; последний день — самый крупный")]
        public List<Reward> Days = new()
        {
            Core.Reward.Coins(100),
            Core.Reward.Coins(150),
            Core.Reward.Booster(BoosterType.Hint, 2),
            Core.Reward.Coins(250),
            Core.Reward.Gems(3),
            Core.Reward.Booster(BoosterType.Magnet, 2),
            Core.Reward.Gems(10),
        };
    }

    // -------------------------------------------------------- Конфиг игры ------

    [CreateAssetMenu(fileName = "GameConfig", menuName = "Findoria/Game Config", order = 0)]
    public sealed class GameConfig : ScriptableObject
    {
        [Header("Жизни")]
        public int MaxLives = 5;
        public int LifeRegenMinutes = 20;

        [Header("Опыт")]
        [Tooltip("XP для перехода на 2-й уровень; далее растёт по формуле")]
        public int BaseXpPerLevel = 100;
        [Range(1f, 2f)] public float XpGrowth = 1.25f;

        [Header("Стартовый баланс новой игры")]
        public int StartCoins = 250;
        public int StartGems = 10;

        [Header("Реклама")]
        [Tooltip("Через сколько завершённых уровней показывать межстраничную рекламу")]
        public int InterstitialEveryLevels = 3;

        /// <summary>Сколько всего XP нужно, чтобы достичь уровня <paramref name="level"/>.</summary>
        public int TotalXpForLevel(int level)
        {
            int total = 0;
            for (int l = 1; l < level; l++)
                total += Mathf.RoundToInt(BaseXpPerLevel * Mathf.Pow(XpGrowth, l - 1));
            return total;
        }

        /// <summary>XP, необходимый именно на переход с уровня level на level+1.</summary>
        public int XpForLevelStep(int level) =>
            Mathf.RoundToInt(BaseXpPerLevel * Mathf.Pow(XpGrowth, Mathf.Max(0, level - 1)));
    }
}
