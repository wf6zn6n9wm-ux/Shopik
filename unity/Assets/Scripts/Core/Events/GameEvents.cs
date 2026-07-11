// -----------------------------------------------------------------------------
//  GameEvents.cs — все события игрового цикла в одном файле.
//  Каждое событие — маленькая неизменяемая структура (readonly), реализующая IEvent.
//  Публикуются через App.Bus.Publish(...), слушаются через App.Bus.Subscribe(...).
// -----------------------------------------------------------------------------
using Findoria.Core;

namespace Findoria.Core.Events
{
    // ---- Навигация / состояние -------------------------------------------------

    public readonly struct GameStateChangedEvent : IEvent
    {
        public readonly GameState Previous, Current;
        public GameStateChangedEvent(GameState prev, GameState cur) { Previous = prev; Current = cur; }
    }

    public readonly struct ScreenChangedEvent : IEvent
    {
        public readonly ScreenId Screen;
        public ScreenChangedEvent(ScreenId screen) { Screen = screen; }
    }

    // ---- Жизненный цикл уровня -------------------------------------------------

    public readonly struct LevelStartedEvent : IEvent
    {
        public readonly string LevelId;
        public readonly int TotalItems;
        public LevelStartedEvent(string levelId, int totalItems) { LevelId = levelId; TotalItems = totalItems; }
    }

    public readonly struct ItemFoundEvent : IEvent
    {
        public readonly string LevelId, ItemId;
        public readonly int RemainingItems;
        public ItemFoundEvent(string levelId, string itemId, int remaining)
        { LevelId = levelId; ItemId = itemId; RemainingItems = remaining; }
    }

    public readonly struct WrongTapEvent : IEvent
    {
        public readonly float NormalizedX, NormalizedY;
        public WrongTapEvent(float x, float y) { NormalizedX = x; NormalizedY = y; }
    }

    public readonly struct LevelCompletedEvent : IEvent
    {
        public readonly string LevelId;
        public readonly int Stars;
        public readonly float TimeSeconds;
        public LevelCompletedEvent(string levelId, int stars, float time)
        { LevelId = levelId; Stars = stars; TimeSeconds = time; }
    }

    public readonly struct LevelFailedEvent : IEvent
    {
        public readonly string LevelId;
        public LevelFailedEvent(string levelId) { LevelId = levelId; }
    }

    public readonly struct LevelUnlockedEvent : IEvent
    {
        public readonly string LevelId;
        public LevelUnlockedEvent(string levelId) { LevelId = levelId; }
    }

    // ---- Экономика -------------------------------------------------------------

    public readonly struct CurrencyChangedEvent : IEvent
    {
        public readonly CurrencyType Currency;
        public readonly int NewAmount, Delta;
        public CurrencyChangedEvent(CurrencyType currency, int newAmount, int delta)
        { Currency = currency; NewAmount = newAmount; Delta = delta; }
    }

    public readonly struct XpChangedEvent : IEvent
    {
        public readonly int TotalXp, CurrentLevelXp, XpForNextLevel;
        public XpChangedEvent(int total, int current, int forNext)
        { TotalXp = total; CurrentLevelXp = current; XpForNextLevel = forNext; }
    }

    public readonly struct PlayerLeveledUpEvent : IEvent
    {
        public readonly int NewLevel;
        public PlayerLeveledUpEvent(int newLevel) { NewLevel = newLevel; }
    }

    public readonly struct LivesChangedEvent : IEvent
    {
        public readonly int Current, Max;
        public readonly float SecondsToNext;
        public LivesChangedEvent(int current, int max, float secondsToNext)
        { Current = current; Max = max; SecondsToNext = secondsToNext; }
    }

    // ---- Бустеры ---------------------------------------------------------------

    public readonly struct BoosterUsedEvent : IEvent
    {
        public readonly BoosterType Type;
        public readonly int Remaining;
        public BoosterUsedEvent(BoosterType type, int remaining) { Type = type; Remaining = remaining; }
    }

    public readonly struct BoosterCountChangedEvent : IEvent
    {
        public readonly BoosterType Type;
        public readonly int Count;
        public BoosterCountChangedEvent(BoosterType type, int count) { Type = type; Count = count; }
    }

    /// <summary>UI просит применить бустер во время уровня. Слушает gameplay-сцена.</summary>
    public readonly struct BoosterActivationRequestedEvent : IEvent
    {
        public readonly BoosterType Type;
        public BoosterActivationRequestedEvent(BoosterType type) { Type = type; }
    }

    /// <summary>Изменился таймер уровня (для HUD).</summary>
    public readonly struct LevelTimerTickEvent : IEvent
    {
        public readonly float Remaining, Total;
        public LevelTimerTickEvent(float remaining, float total) { Remaining = remaining; Total = total; }
    }

    /// <summary>Изменилось число «жизней уровня» (допустимых ошибок).</summary>
    public readonly struct LevelMistakesChangedEvent : IEvent
    {
        public readonly int Remaining, Max;
        public LevelMistakesChangedEvent(int remaining, int max) { Remaining = remaining; Max = max; }
    }

    // ---- Прогресс мета-игры ----------------------------------------------------

    public readonly struct QuestProgressEvent : IEvent
    {
        public readonly string QuestId;
        public readonly int Progress, Target;
        public readonly bool Completed;
        public QuestProgressEvent(string id, int progress, int target, bool completed)
        { QuestId = id; Progress = progress; Target = target; Completed = completed; }
    }

    public readonly struct AchievementUnlockedEvent : IEvent
    {
        public readonly string AchievementId;
        public AchievementUnlockedEvent(string id) { AchievementId = id; }
    }

    public readonly struct DailyRewardClaimedEvent : IEvent
    {
        public readonly int DayIndex;
        public readonly Reward Reward;
        public DailyRewardClaimedEvent(int dayIndex, Reward reward) { DayIndex = dayIndex; Reward = reward; }
    }

    public readonly struct LoginStreakChangedEvent : IEvent
    {
        public readonly int StreakDays;
        public LoginStreakChangedEvent(int days) { StreakDays = days; }
    }

    // ---- Монетизация -----------------------------------------------------------

    public readonly struct PurchaseCompletedEvent : IEvent
    {
        public readonly string ProductId;
        public readonly OperationResult Result;
        public PurchaseCompletedEvent(string productId, OperationResult result)
        { ProductId = productId; Result = result; }
    }

    public readonly struct RewardedAdWatchedEvent : IEvent
    {
        public readonly string Placement;
        public readonly OperationResult Result;
        public RewardedAdWatchedEvent(string placement, OperationResult result)
        { Placement = placement; Result = result; }
    }

    public readonly struct RemoveAdsChangedEvent : IEvent
    {
        public readonly bool Owned;
        public RemoveAdsChangedEvent(bool owned) { Owned = owned; }
    }

    // ---- Аудио / настройки -----------------------------------------------------

    public readonly struct SettingsChangedEvent : IEvent
    {
        public readonly bool MusicOn, SfxOn, VibrationOn;
        public SettingsChangedEvent(bool music, bool sfx, bool vibration)
        { MusicOn = music; SfxOn = sfx; VibrationOn = vibration; }
    }
}
