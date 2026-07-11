// -----------------------------------------------------------------------------
//  GameEnums.cs — перечисления и общие value-типы предметной области.
//  Держим их в одном месте, чтобы модули говорили на одном языке (DRY).
// -----------------------------------------------------------------------------
using System;

namespace Findoria.Core
{
    /// <summary>Сложность уровня. Влияет на число предметов, время и награды.</summary>
    public enum Difficulty { Easy, Normal, Hard, Expert }

    /// <summary>Типы бустеров.</summary>
    public enum BoosterType
    {
        Hint,        // Подсказка — подсвечивает случайный ненайденный предмет
        Magnet,      // Магнит — автоматически находит один предмет
        TimeFreeze,  // Заморозка времени
        ExtraLife,   // Дополнительная жизнь
        Magnifier    // Увеличительное стекло — временный зум сцены
    }

    /// <summary>Валюты игры.</summary>
    public enum CurrencyType { Coins, Gems }

    /// <summary>Что именно выдаётся в награду.</summary>
    public enum RewardKind { Coins, Gems, Xp, Booster, Life, RemoveAds }

    /// <summary>Период задания.</summary>
    public enum QuestPeriod { Daily, Weekly }

    /// <summary>Метрика, по которой засчитывается прогресс задания.</summary>
    public enum QuestMetric { FindItems, CompleteLevels, UseBoosters, EarnCoins, PerfectLevels, PlaySessions }

    /// <summary>Метрика достижения (накопительная за всё время).</summary>
    public enum AchievementMetric { TotalItemsFound, LevelsCompleted, StarsEarned, CoinsSpent, BoostersUsed, StreakDays, PlayerLevel }

    /// <summary>Идентификаторы экранов UI.</summary>
    public enum ScreenId { Loading, MainMenu, WorldMap, Game, Shop, Settings, Win, Lose, DailyReward, Profile }

    /// <summary>Тип товара в магазине.</summary>
    public enum ShopItemKind { CoinPack, GemPack, BoosterPack, RemoveAds, BattlePass }

    /// <summary>Глобальное состояние игрового цикла.</summary>
    public enum GameState { Boot, MainMenu, Map, Loading, Playing, Paused, Win, Lose }

    /// <summary>Результат покупки/просмотра рекламы для колбэков.</summary>
    public enum OperationResult { Success, Cancelled, Failed, NotAvailable }

    /// <summary>
    /// Награда — универсальная «единица выдачи». Используется уровнями,
    /// заданиями, достижениями, ежедневными наградами и магазином.
    /// </summary>
    [Serializable]
    public struct Reward
    {
        public RewardKind Kind;
        public int Amount;
        public BoosterType BoosterType; // применимо только при Kind == Booster

        public Reward(RewardKind kind, int amount, BoosterType booster = Core.BoosterType.Hint)
        {
            Kind = kind;
            Amount = amount;
            BoosterType = booster;
        }

        public static Reward Coins(int amount) => new(RewardKind.Coins, amount);
        public static Reward Gems(int amount) => new(RewardKind.Gems, amount);
        public static Reward Xp(int amount) => new(RewardKind.Xp, amount);
        public static Reward Booster(BoosterType type, int amount = 1) => new(RewardKind.Booster, amount, type);
        public static Reward Life(int amount = 1) => new(RewardKind.Life, amount);

        public override string ToString() =>
            Kind == RewardKind.Booster ? $"{BoosterType} ×{Amount}" : $"{Kind} ×{Amount}";
    }
}
