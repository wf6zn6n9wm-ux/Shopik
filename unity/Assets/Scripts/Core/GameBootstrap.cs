// -----------------------------------------------------------------------------
//  GameBootstrap.cs — КОМПОЗИЦИОННЫЙ КОРЕНЬ приложения.
//
//  Единственное место, где создаются конкретные реализации и связываются друг с
//  другом (Dependency Injection вручную, без рефлексии). Порядок регистрации =
//  порядок зависимостей. После инициализации показывает главное меню.
//
//  Разместить на объекте в стартовой сцене Bootstrap. Ссылки на GameCatalog и
//  сценные сервисы (аудио, навигация, игровой контроллер) назначаются в инспекторе.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using Findoria.Data;
using Findoria.Economy;
using Findoria.Progression;
using Findoria.Services;
using Findoria.Gameplay;

namespace Findoria.Core
{
    public sealed class GameBootstrap : MonoBehaviour
    {
        [Header("Контент")]
        [SerializeField] private GameCatalog _catalog;

        [Header("Сценные сервисы (MonoBehaviour)")]
        [SerializeField] private AudioService _audio;
        [SerializeField] private MonoBehaviour _navigation;   // должен реализовывать INavigation (UIManager)
        [SerializeField] private HiddenObjectSceneController _sceneController;

        [Header("Опции")]
        [SerializeField] private bool _loadRuntimeJsonLevels = false;

        private readonly List<ITickable> _tickables = new();
        private bool _ready;

        private async void Awake()
        {
            DontDestroyOnLoad(gameObject);

            if (_catalog == null || _catalog.Config == null)
            {
                Debug.LogError("[Bootstrap] Не назначен GameCatalog с GameConfig.");
                return;
            }

            // --- Ядро ---
            var bus = new EventBus();
            var container = new ServiceContainer();
            App.Initialize(container, bus);

            container.Register(_catalog);
            container.Register(_catalog.Config);
            container.Register(new GameStateMachine(bus));

            // --- Сохранение (корень данных) ---
            var save = new LocalSaveService(_catalog.Config /*, cloud backend опционально */);
            container.Register<ISaveService>(save);
            await save.InitializeAsync();

            // --- Контент уровней ---
            var levels = new LevelProvider(_catalog);
            await levels.InitializeAsync();
            if (_loadRuntimeJsonLevels)
            {
                var extra = Admin.RuntimeLevelLoader.LoadFromResources("Levels/levels");
                if (extra != null) levels.AddRuntimeLevels(extra);
            }
            container.Register<ILevelProvider>(levels);

            // --- Экономика ---
            var wallet   = new WalletService(save, bus);
            var xp       = new ExperienceService(save, bus, _catalog.Config);
            var lives    = new LivesService(save, bus, _catalog.Config);
            var boosters = new BoosterService(save, bus);
            var rewards  = new RewardService(wallet, xp, lives, boosters);
            container.Register<IWalletService>(wallet);
            container.Register<IExperienceService>(xp);
            container.Register<ILivesService>(lives);
            container.Register<IBoosterService>(boosters);
            container.Register<IRewardService>(rewards);
            _tickables.Add(lives);

            // --- Прогресс уровней ---
            container.Register<IProgressService>(new ProgressService(save, bus, levels));

            // --- Инфраструктурные сервисы ---
            container.Register<ISpriteLoader>(new SpriteLoader());
            container.Register<IObjectPoolService>(new ObjectPoolService());
            if (_audio != null) container.Register<IAudioService>(_audio);

            // --- Мета-прогрессия ---
            var quests = new QuestService(save, bus, _catalog, rewards);
            var ach    = new AchievementService(save, bus, _catalog, rewards);
            var daily  = new DailyRewardService(save, bus, _catalog, rewards);
            var streak = new LoginStreakService(save, bus);
            container.Register<IQuestService>(quests);
            container.Register<IAchievementService>(ach);
            container.Register<IDailyRewardService>(daily);
            container.Register<ILoginStreakService>(streak);
            await quests.InitializeAsync();
            await ach.InitializeAsync();
            await daily.InitializeAsync();
            await streak.InitializeAsync();

            // --- Монетизация ---
            var ads = new Monetization.AdService(save, bus);
            var iap = new Monetization.PurchaseService(save, bus, rewards, _catalog);
            container.Register<IAdService>(ads);
            container.Register<IPurchaseService>(iap);
            await ads.InitializeAsync();
            await iap.InitializeAsync();

            // --- Навигация и игровой контроллер (сценные) ---
            if (_navigation is INavigation nav) container.Register<INavigation>(nav);
            if (_sceneController != null) container.Register<IGameFlow>(_sceneController);

            _ready = true;
            Debug.Log("[Bootstrap] Инициализация завершена.");

            // Стартовый экран после готовности сервисов.
            if (_navigation is INavigation navigation)
                navigation.Show(ScreenId.MainMenu);

            _audio?.PlayMusic("music_menu");
        }

        private void Update()
        {
            if (!_ready) return;
            float dt = Time.unscaledDeltaTime;
            for (int i = 0; i < _tickables.Count; i++) _tickables[i].Tick(dt);
        }

        private async void OnApplicationPause(bool paused)
        {
            if (_ready && paused && App.Services.TryResolve<ISaveService>(out var save))
                await save.SaveCloudAsync();
        }
    }
}
