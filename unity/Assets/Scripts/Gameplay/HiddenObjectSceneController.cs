// -----------------------------------------------------------------------------
//  HiddenObjectSceneController.cs — ядро игрового процесса уровня (IGameFlow).
//
//  Отвечает за весь цикл: загрузка сцены → расстановка зон предметов → обработка
//  верных/неверных нажатий → таймер и «жизни уровня» → бустеры → победа/поражение
//  с выдачей наград и открытием следующего уровня. Общается с остальной игрой
//  только через сервисы (интерфейсы) и события — низкая связность.
// -----------------------------------------------------------------------------
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using Findoria.Economy;
using Findoria.Services;

namespace Findoria.Gameplay
{
    public sealed class HiddenObjectSceneController : MonoBehaviour, IGameFlow
    {
        [Header("Сцена (назначается в инспекторе)")]
        [SerializeField] private RectTransform _boardRoot;   // контейнер размера иллюстрации
        [SerializeField] private Image _backgroundImage;     // сама иллюстрация
        [SerializeField] private GameObject _itemHotspotPrefab; // префаб с HiddenItemView
        [SerializeField] private Button _backgroundCatcher;  // ловит промахи по пустому месту

        [Header("Награды за каждый найденный предмет")]
        [SerializeField] private int _coinsPerItem = 2;
        [SerializeField] private int _xpPerItem = 1;

        // --- Разрешённые сервисы ---
        private ILevelProvider _levels;
        private IProgressService _progress;
        private IRewardService _rewards;
        private IBoosterService _boosters;
        private ILivesService _lives;
        private IAudioService _audio;
        private ISpriteLoader _sprites;
        private IObjectPoolService _pool;
        private INavigation _nav;
        private GameCatalog _catalog;
        private GameConfig _config;
        private EventBus Bus => App.Bus;

        // --- Состояние текущего уровня ---
        private LevelData _level;
        private readonly List<HiddenItemView> _spawned = new();
        private int _totalItems, _foundItems;
        private int _mistakesRemaining;
        private float _timeRemaining, _timeElapsed;
        private float _freezeTimer, _magnifierTimer;
        private float _tickAccum;
        private bool _active;

        public string CurrentLevelId => _level != null ? _level.Id : null;

        // -------------------------------------------------------- Жизненный цикл

        private void Awake()
        {
            if (App.IsReady) App.Services.Register<IGameFlow>(this);
        }

        private void OnEnable()  => Bus?.Subscribe<BoosterActivationRequestedEvent>(OnBoosterRequested);
        private void OnDisable() => Bus?.Unsubscribe<BoosterActivationRequestedEvent>(OnBoosterRequested);

        private void ResolveServices()
        {
            _levels   = App.Resolve<ILevelProvider>();
            _progress = App.Resolve<IProgressService>();
            _rewards  = App.Resolve<IRewardService>();
            _boosters = App.Resolve<IBoosterService>();
            _lives    = App.Resolve<ILivesService>();
            _audio    = App.Resolve<IAudioService>();
            _sprites  = App.Resolve<ISpriteLoader>();
            _pool     = App.Resolve<IObjectPoolService>();
            _nav      = App.Resolve<INavigation>();
            _catalog  = App.Resolve<GameCatalog>();
            _config   = _catalog != null ? _catalog.Config : null;
        }

        // -------------------------------------------------------------- IGameFlow

        public async void StartLevel(string levelId)
        {
            if (!App.IsReady) return;
            ResolveServices();

            var level = _levels.GetLevel(levelId);
            if (level == null) { Debug.LogError($"[Game] Уровень '{levelId}' не найден."); return; }

            // Одна «глобальная» жизнь тратится на попытку пройти уровень.
            if (!_lives.HasLife) { _nav.Toast("Нет жизней — подождите или пополните"); _nav.Show(ScreenId.Shop); return; }
            _lives.TryConsume();

            CleanupLevel();
            _level = level;

            await LoadBackgroundAsync(level);
            SpawnHotspots(level);

            _totalItems = _spawned.Count;
            _foundItems = 0;
            _mistakesRemaining = Mathf.Max(1, level.MistakesAllowed);
            _timeRemaining = level.TimeLimitSeconds;
            _timeElapsed = 0f;
            _freezeTimer = _magnifierTimer = 0f;
            if (_boardRoot != null) _boardRoot.localScale = Vector3.one;
            _active = true;

            if (_backgroundCatcher != null)
            {
                _backgroundCatcher.onClick.RemoveAllListeners();
                _backgroundCatcher.onClick.AddListener(OnBackgroundTapped);
            }

            _audio?.PlayMusic("music_game");
            Bus.Publish(new LevelStartedEvent(level.Id, _totalItems));
            Bus.Publish(new LevelMistakesChangedEvent(_mistakesRemaining, _mistakesRemaining));
            Bus.Publish(new LevelTimerTickEvent(_timeRemaining, level.TimeLimitSeconds));
        }

        public void RetryCurrentLevel()
        {
            if (_level != null) StartLevel(_level.Id);
        }

        public void QuitToMap()
        {
            _active = false;
            CleanupLevel();
            _nav?.Show(ScreenId.WorldMap);
        }

        // ------------------------------------------------------- Загрузка сцены

        private async System.Threading.Tasks.Task LoadBackgroundAsync(LevelData level)
        {
            if (_backgroundImage == null) return;
            var sprite = await _sprites.LoadAsync(level.Background);
            if (sprite != null)
            {
                _backgroundImage.sprite = sprite;
                _backgroundImage.preserveAspect = true;
            }
        }

        private void SpawnHotspots(LevelData level)
        {
            if (_boardRoot == null || _itemHotspotPrefab == null) return;

            var rect = _boardRoot.rect;
            float w = rect.width, h = rect.height;

            foreach (var p in level.Placements)
            {
                var go = _pool.Spawn(_itemHotspotPrefab, _boardRoot);
                var view = go.GetComponent<HiddenItemView>();
                if (view == null) { _pool.Despawn(go); continue; }

                // Нормализованные координаты: (0,0) — левый верх, (1,1) — правый низ.
                var anchored = new Vector2((p.X - 0.5f) * w, (0.5f - p.Y) * h);
                float size = Mathf.Max(48f, p.Radius * w * 2f); // радиус в долях ширины
                view.Setup(p.ItemId, anchored, size, p.Rotation, OnItemTapped);
                _spawned.Add(view);
            }
        }

        // --------------------------------------------------------- Ввод игрока

        private void OnItemTapped(HiddenItemView view)
        {
            if (!_active || view.Found) return;

            _audio?.PlaySfx("sfx_found");
            view.PlayFound(() => { _pool.Despawn(view.gameObject); });
            _spawned.Remove(view);
            _foundItems++;

            // Микронаграда за каждый найденный предмет.
            _rewards.Grant(Reward.Coins(_coinsPerItem));
            _rewards.Grant(Reward.Xp(_xpPerItem));

            // Мета-прогресс: задания и достижения.
            ReportStat("TotalItemsFound", 1, AchievementMetric.TotalItemsFound);
            App.Services.TryResolve<IQuestService>(out var quests);
            quests?.Report(QuestMetric.FindItems);

            Bus.Publish(new ItemFoundEvent(_level.Id, view.ItemId, _totalItems - _foundItems));

            if (_foundItems >= _totalItems) CompleteLevel();
        }

        private void OnBackgroundTapped()
        {
            if (!_active) return;
            RegisterMistake();
        }

        private void RegisterMistake()
        {
            _mistakesRemaining--;
            _audio?.PlaySfx("sfx_wrong");
            Bus.Publish(new WrongTapEvent(0.5f, 0.5f));
            Bus.Publish(new LevelMistakesChangedEvent(Mathf.Max(0, _mistakesRemaining), Mathf.Max(1, _level.MistakesAllowed)));
            if (_mistakesRemaining <= 0) FailLevel();
        }

        // -------------------------------------------------------------- Таймер

        private void Update()
        {
            if (!_active) return;

            // Бустеры длительного действия.
            if (_freezeTimer > 0f) _freezeTimer -= Time.deltaTime;
            if (_magnifierTimer > 0f)
            {
                _magnifierTimer -= Time.deltaTime;
                if (_magnifierTimer <= 0f && _boardRoot != null) _boardRoot.localScale = Vector3.one;
            }

            bool frozen = _freezeTimer > 0f;
            if (_level.TimeLimitSeconds > 0f && !frozen)
            {
                _timeRemaining -= Time.deltaTime;
                _timeElapsed += Time.deltaTime;

                _tickAccum += Time.deltaTime;
                if (_tickAccum >= 0.25f)
                {
                    _tickAccum = 0f;
                    Bus.Publish(new LevelTimerTickEvent(Mathf.Max(0, _timeRemaining), _level.TimeLimitSeconds));
                }
                if (_timeRemaining <= 0f) FailLevel();
            }
            else if (!frozen)
            {
                _timeElapsed += Time.deltaTime;
            }
        }

        // ------------------------------------------------------- Итоги уровня

        private void CompleteLevel()
        {
            _active = false;
            int stars = _level.EvaluateStars(_timeElapsed);

            // Основные награды уровня.
            _rewards.Grant(Reward.Coins(_level.RewardCoins));
            _rewards.Grant(Reward.Xp(_level.RewardXp));
            _rewards.GrantAll(_level.BonusRewards);

            _progress.RecordResult(_level.Id, stars, _timeElapsed);

            // Статистика и мета-прогресс.
            ReportStat("LevelsCompleted", 1, AchievementMetric.LevelsCompleted);
            App.Services.TryResolve<IAchievementService>(out var ach);
            ach?.Report(AchievementMetric.StarsEarned, _progress.TotalStars);
            App.Services.TryResolve<IQuestService>(out var quests);
            quests?.Report(QuestMetric.CompleteLevels);
            if (stars >= 3) quests?.Report(QuestMetric.PerfectLevels);

            _audio?.PlaySfx("sfx_win");
            MaybeShowInterstitial();

            Bus.Publish(new LevelCompletedEvent(_level.Id, stars, _timeElapsed));
            _nav.Show(ScreenId.Win);
        }

        private void FailLevel()
        {
            _active = false;
            _audio?.PlaySfx("sfx_lose");
            Bus.Publish(new LevelFailedEvent(_level.Id));
            _nav.Show(ScreenId.Lose);
        }

        private void MaybeShowInterstitial()
        {
            if (_config == null || _config.InterstitialEveryLevels <= 0) return;
            if (!App.Services.TryResolve<IAdService>(out var ads)) return;

            int completed = App.Resolve<ISaveService>().Data.Stats.Get("LevelsCompleted");
            if (completed % _config.InterstitialEveryLevels == 0)
                ads.ShowInterstitial("level_complete");
        }

        // -------------------------------------------------------------- Бустеры

        private void OnBoosterRequested(BoosterActivationRequestedEvent e)
        {
            if (!_active) return;
            if (!_boosters.TryConsume(e.Type)) { _nav.Toast("Нет такого бустера"); return; }

            var data = _catalog != null ? _catalog.GetBooster(e.Type) : null;
            float duration = data != null ? data.Duration : 5f;

            switch (e.Type)
            {
                case BoosterType.Hint:      HighlightRandom(); break;
                case BoosterType.Magnet:    AutoFindRandom(); break;
                case BoosterType.TimeFreeze: _freezeTimer = duration; break;
                case BoosterType.Magnifier: ApplyMagnifier(duration); break;
                case BoosterType.ExtraLife:
                    _mistakesRemaining++;
                    Bus.Publish(new LevelMistakesChangedEvent(_mistakesRemaining, Mathf.Max(1, _level.MistakesAllowed)));
                    break;
            }

            ReportStat("BoostersUsed", 1, AchievementMetric.BoostersUsed);
            App.Services.TryResolve<IQuestService>(out var quests);
            quests?.Report(QuestMetric.UseBoosters);
            Bus.Publish(new BoosterUsedEvent(e.Type, _boosters.GetCount(e.Type)));
        }

        private void HighlightRandom()
        {
            var v = RandomRemaining();
            v?.PlayHint();
        }

        private void AutoFindRandom()
        {
            var v = RandomRemaining();
            if (v != null) OnItemTapped(v);
        }

        private void ApplyMagnifier(float duration)
        {
            if (_boardRoot == null) return;
            _boardRoot.localScale = Vector3.one * 1.5f;
            _magnifierTimer = duration;
        }

        private HiddenItemView RandomRemaining()
        {
            if (_spawned.Count == 0) return null;
            return _spawned[Random.Range(0, _spawned.Count)];
        }

        // -------------------------------------------------------------- Утилиты

        private void ReportStat(string statKey, int delta, AchievementMetric metric)
        {
            var data = App.Resolve<ISaveService>().Data;
            data.Stats.Add(statKey, delta);
            App.Services.TryResolve<IAchievementService>(out var ach);
            ach?.Report(metric, data.Stats.Get(statKey));
        }

        private void CleanupLevel()
        {
            foreach (var v in _spawned)
                if (v != null) _pool.Despawn(v.gameObject);
            _spawned.Clear();

            if (_level != null && _sprites != null) _sprites.Release(_level.Background);
        }
    }
}
