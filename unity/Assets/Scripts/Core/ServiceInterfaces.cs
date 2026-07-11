// -----------------------------------------------------------------------------
//  ServiceInterfaces.cs — контракты всех сервисов приложения.
//  Реализации живут в своих модулях, а зависят все от этих абстракций (DIP).
//  Это «швы» архитектуры: любой сервис можно заменить (напр. рекламу на заглушку
//  в разработке) не трогая остальной код.
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Findoria.Core;
using Findoria.Data;

namespace Findoria.Core
{
    /// <summary>Сервис, который нужно проинициализировать на старте (возможно async).</summary>
    public interface IInitializable
    {
        Task InitializeAsync();
    }

    /// <summary>Сервис с потиковым обновлением (двигается из корутины/апдейта бустрапа).</summary>
    public interface ITickable
    {
        void Tick(float deltaTime);
    }

    /// <summary>Навигация по экранам UI. Реализуется UIManager, но код зависит от абстракции.</summary>
    public interface INavigation
    {
        ScreenId Current { get; }
        void Show(ScreenId screen);
        void Back();
        /// <summary>Показать всплывающее сообщение (тост).</summary>
        void Toast(string message);
    }

    /// <summary>Точка входа в игровой процесс уровня (реализует gameplay-модуль).</summary>
    public interface IGameFlow
    {
        void StartLevel(string levelId);
        void RetryCurrentLevel();
        void QuitToMap();
        string CurrentLevelId { get; }
    }

    // ------------------------------------------------------------------ Данные --

    /// <summary>Держатель модели игрока в памяти + сохранение на диск/облако.</summary>
    public interface ISaveService : IInitializable
    {
        PlayerData Data { get; }
        void Save();                 // немедленное локальное сохранение
        Task SaveCloudAsync();       // выгрузка в облако (если доступно)
        Task LoadAsync();            // загрузка (облако → локально → дефолт)
        void ResetProgress();        // полный сброс (для настроек/тестов)
        event Action Saved;
    }

    // -------------------------------------------------------------- Экономика --

    /// <summary>Кошелёк: монеты и кристаллы.</summary>
    public interface IWalletService
    {
        int Coins { get; }
        int Gems { get; }
        bool CanSpend(CurrencyType type, int amount);
        void Add(CurrencyType type, int amount);
        bool TrySpend(CurrencyType type, int amount);
    }

    /// <summary>Опыт и уровень игрока.</summary>
    public interface IExperienceService
    {
        int PlayerLevel { get; }
        int TotalXp { get; }
        int XpIntoLevel { get; }
        int XpForNextLevel { get; }
        void AddXp(int amount);
    }

    /// <summary>Жизни с восстановлением по таймеру.</summary>
    public interface ILivesService : ITickable
    {
        int Current { get; }
        int Max { get; }
        bool HasLife { get; }
        float SecondsToNextLife { get; }
        bool TryConsume();
        void Add(int amount);
        void RefillFull();
    }

    /// <summary>Инвентарь бустеров.</summary>
    public interface IBoosterService
    {
        int GetCount(BoosterType type);
        void Add(BoosterType type, int amount);
        bool TryConsume(BoosterType type);
    }

    // ------------------------------------------------------------- Прогресс ----

    /// <summary>Прогресс по уровням: звёзды, разблокировка, лучшее время.</summary>
    public interface IProgressService
    {
        bool IsUnlocked(string levelId);
        int GetStars(string levelId);
        float GetBestTime(string levelId);
        void RecordResult(string levelId, int stars, float time);
        string GetNextLevelId(string levelId);
        int TotalStars { get; }
    }

    // ------------------------------------------------------------- Контент -----

    /// <summary>Провайдер контента уровней (из ScriptableObjects/JSON/Addressables).</summary>
    public interface ILevelProvider : IInitializable
    {
        IReadOnlyList<WorldData> Worlds { get; }
        LevelData GetLevel(string levelId);
        IReadOnlyList<LevelData> GetLevelsForWorld(string worldId);
    }

    /// <summary>Асинхронная загрузка спрайтов (Addressables) с кэшем и выгрузкой.</summary>
    public interface ISpriteLoader
    {
        Task<UnityEngine.Sprite> LoadAsync(AssetRef reference);
        void Release(AssetRef reference);
        void ReleaseAll();
    }

    // ------------------------------------------------------- Задания/награды --

    public interface IQuestService : IInitializable
    {
        IReadOnlyList<QuestState> ActiveQuests { get; }
        void Report(QuestMetric metric, int amount = 1);
        bool TryClaim(string questId, out Reward reward);
        void RefreshIfNeeded(); // ротация daily/weekly
    }

    public interface IAchievementService : IInitializable
    {
        IReadOnlyList<AchievementState> All { get; }
        void Report(AchievementMetric metric, int totalValue);
        bool TryClaim(string achievementId, out Reward reward);
    }

    public interface IDailyRewardService : IInitializable
    {
        int CurrentDay { get; }
        bool CanClaimToday { get; }
        bool TryClaimToday(out Reward reward);
        IReadOnlyList<DailyRewardEntry> Calendar { get; }
    }

    public interface ILoginStreakService : IInitializable
    {
        int StreakDays { get; }
        void RegisterLogin();
    }

    // -------------------------------------------------------- Монетизация ----

    /// <summary>Фасад рекламы. Реализация оборачивает конкретную сеть (напр. AdMob/LevelPlay).</summary>
    public interface IAdService : IInitializable
    {
        bool IsRewardedReady { get; }
        bool AreAdsRemoved { get; }
        void ShowBanner();
        void HideBanner();
        void ShowInterstitial(string placement, Action onClosed = null);
        void ShowRewarded(string placement, Action<OperationResult> onFinished);
    }

    /// <summary>Внутриигровые покупки (IAP).</summary>
    public interface IPurchaseService : IInitializable
    {
        bool IsRemoveAdsOwned { get; }
        void Buy(string productId, Action<OperationResult> onFinished);
        void Restore(Action<OperationResult> onFinished);
        string GetLocalizedPrice(string productId);
    }

    // ------------------------------------------------------------- Аудио -------

    public interface IAudioService
    {
        void PlaySfx(string clipId, float volume = 1f);
        void PlayMusic(string clipId, bool loop = true);
        void StopMusic();
        void SetMusicEnabled(bool on);
        void SetSfxEnabled(bool on);
    }

    // -------------------------------------------------------- Пулинг ----------

    /// <summary>Пул переиспользуемых GameObject'ов (снижает GC и аллокации).</summary>
    public interface IObjectPoolService
    {
        void Prewarm(UnityEngine.GameObject prefab, int count);
        UnityEngine.GameObject Spawn(UnityEngine.GameObject prefab, UnityEngine.Transform parent = null);
        void Despawn(UnityEngine.GameObject instance);
        void Clear();
    }
}
