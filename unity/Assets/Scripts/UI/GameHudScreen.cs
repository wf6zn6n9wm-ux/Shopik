// -----------------------------------------------------------------------------
//  GameHudScreen.cs — внутриигровой HUD.
//
//  Показывает список искомых предметов, таймер, жизни, счётчик ошибок и кнопки
//  бустеров. Полностью реактивен: реагирует на события уровня, не опрашивая
//  gameplay напрямую. Бустеры активируются публикацией запроса на шину событий.
// -----------------------------------------------------------------------------
using System;
using System.Collections.Generic;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class GameHudScreen : BaseScreen
    {
        [Header("Список искомых предметов")]
        [SerializeField] private Transform _foundListRoot;
        [Tooltip("Префаб строки предмета с компонентом FoundItemView. Назначается в инспекторе.")]
        [SerializeField] private FoundItemView _foundItemPrefab;

        [Header("Индикаторы")]
        [SerializeField] private TextMeshProUGUI _livesLabel;
        [SerializeField] private TextMeshProUGUI _timerText;
        [SerializeField] private Slider _timerSlider;
        [SerializeField] private TextMeshProUGUI _mistakesLabel;

        [Header("Бустеры (порядок соответствует enum BoosterType)")]
        [Tooltip("5 кнопок: Hint, Magnet, TimeFreeze, ExtraLife, Magnifier.")]
        [SerializeField] private Button[] _boosterButtons = new Button[5];
        [SerializeField] private TextMeshProUGUI[] _boosterCountLabels = new TextMeshProUGUI[5];

        [Header("Управление")]
        [SerializeField] private Button _pauseButton;

        // Активные строки списка: itemId -> вид. Позволяет «вычёркивать» найденное.
        private readonly Dictionary<string, FoundItemView> _foundViews = new();

        // Поля-обработчики для корректной отписки.
        private Action<LevelStartedEvent> _onLevelStarted;
        private Action<ItemFoundEvent> _onItemFound;
        private Action<LevelTimerTickEvent> _onTimerTick;
        private Action<LivesChangedEvent> _onLivesChanged;
        private Action<LevelMistakesChangedEvent> _onMistakesChanged;
        private Action<BoosterCountChangedEvent> _onBoosterCountChanged;

        protected override void Awake()
        {
            base.Awake();

            _onLevelStarted = OnLevelStarted;
            _onItemFound = OnItemFound;
            _onTimerTick = OnTimerTick;
            _onLivesChanged = OnLivesChanged;
            _onMistakesChanged = OnMistakesChanged;
            _onBoosterCountChanged = OnBoosterCountChanged;

            // Каждая кнопка бустера публикует запрос на активацию своего типа.
            if (_boosterButtons != null)
            {
                for (int i = 0; i < _boosterButtons.Length; i++)
                {
                    if (_boosterButtons[i] == null) continue;
                    var type = (BoosterType)i; // индекс кнопки = значение enum
                    _boosterButtons[i].onClick.AddListener(() => RequestBooster(type));
                }
            }

            if (_pauseButton) _pauseButton.onClick.AddListener(OnPause);
        }

        private void OnEnable()
        {
            if (!App.IsReady) return;
            App.Bus.Subscribe(_onLevelStarted);
            App.Bus.Subscribe(_onItemFound);
            App.Bus.Subscribe(_onTimerTick);
            App.Bus.Subscribe(_onLivesChanged);
            App.Bus.Subscribe(_onMistakesChanged);
            App.Bus.Subscribe(_onBoosterCountChanged);
        }

        private void OnDisable()
        {
            if (!App.IsReady) return;
            App.Bus.Unsubscribe(_onLevelStarted);
            App.Bus.Unsubscribe(_onItemFound);
            App.Bus.Unsubscribe(_onTimerTick);
            App.Bus.Unsubscribe(_onLivesChanged);
            App.Bus.Unsubscribe(_onMistakesChanged);
            App.Bus.Unsubscribe(_onBoosterCountChanged);
        }

        protected override void OnShow() => RefreshBoosterCounts();

        // ---- Обработчики событий уровня -------------------------------------

        private void OnLevelStarted(LevelStartedEvent e)
        {
            BuildFoundList(e.LevelId);
            RefreshBoosterCounts();

            // Начальные значения жизней/ошибок берём из сервисов и данных уровня.
            if (App.Services.TryResolve<ILivesService>(out var lives) && _livesLabel)
                _livesLabel.text = $"{lives.Current}/{lives.Max}";

            var level = App.Resolve<ILevelProvider>().GetLevel(e.LevelId);
            if (level != null && _mistakesLabel)
                _mistakesLabel.text = $"{level.MistakesAllowed}/{level.MistakesAllowed}";
        }

        private void BuildFoundList(string levelId)
        {
            _foundViews.Clear();
            if (_foundListRoot == null || _foundItemPrefab == null) return;

            // Чистим предыдущий список.
            for (int i = _foundListRoot.childCount - 1; i >= 0; i--)
                Destroy(_foundListRoot.GetChild(i).gameObject);

            var level = App.Resolve<ILevelProvider>().GetLevel(levelId);
            if (level == null) return;

            var catalog = App.Services.TryResolve<GameCatalog>(out var c) ? c : null;

            foreach (var req in level.RequiredItems)
            {
                if (string.IsNullOrEmpty(req.ItemId) || _foundViews.ContainsKey(req.ItemId)) continue;

                var itemData = catalog?.GetItem(req.ItemId);
                string display = itemData != null ? itemData.DisplayName : req.ItemId;

                var view = Instantiate(_foundItemPrefab, _foundListRoot);
                view.Render(display, Mathf.Max(1, req.Count));
                // TODO: иконку предмета грузить асинхронно через ISpriteLoader (itemData.Icon).
                _foundViews[req.ItemId] = view;
            }
        }

        private void OnItemFound(ItemFoundEvent e)
        {
            // Вычёркиваем/прячем найденный предмет в списке.
            if (_foundViews.TryGetValue(e.ItemId, out var view) && view != null)
                view.MarkFound();
        }

        private void OnTimerTick(LevelTimerTickEvent e)
        {
            if (_timerText)
            {
                int seconds = Mathf.CeilToInt(Mathf.Max(0f, e.Remaining));
                _timerText.text = $"{seconds / 60:0}:{seconds % 60:00}";
            }
            if (_timerSlider)
                _timerSlider.value = e.Total > 0f ? Mathf.Clamp01(e.Remaining / e.Total) : 0f;
        }

        private void OnLivesChanged(LivesChangedEvent e)
        {
            if (_livesLabel) _livesLabel.text = $"{e.Current}/{e.Max}";
        }

        private void OnMistakesChanged(LevelMistakesChangedEvent e)
        {
            if (_mistakesLabel) _mistakesLabel.text = $"{e.Remaining}/{e.Max}";
        }

        private void OnBoosterCountChanged(BoosterCountChangedEvent e)
        {
            int idx = (int)e.Type;
            if (_boosterCountLabels != null && idx >= 0 && idx < _boosterCountLabels.Length && _boosterCountLabels[idx])
                _boosterCountLabels[idx].text = e.Count.ToString();
        }

        // ---- Прочее ---------------------------------------------------------

        private void RefreshBoosterCounts()
        {
            if (!App.Services.TryResolve<IBoosterService>(out var boosters)) return;
            foreach (BoosterType type in Enum.GetValues(typeof(BoosterType)))
            {
                int idx = (int)type;
                if (_boosterCountLabels != null && idx < _boosterCountLabels.Length && _boosterCountLabels[idx])
                    _boosterCountLabels[idx].text = boosters.GetCount(type).ToString();
            }
        }

        private void RequestBooster(BoosterType type)
        {
            if (!App.IsReady) return;
            // Само списание/применение делает gameplay-модуль, слушающий это событие.
            App.Bus.Publish(new BoosterActivationRequestedEvent(type));
        }

        private void OnPause()
        {
            if (!App.IsReady) return;
            // Выходим из уровня на карту через навигацию.
            if (App.Services.TryResolve<IGameFlow>(out var flow)) flow.QuitToMap();
            App.Resolve<INavigation>().Show(ScreenId.WorldMap);
        }
    }

    /// <summary>
    /// Строка одного искомого предмета в HUD. Виджеты связываются в инспекторе.
    /// </summary>
    public sealed class FoundItemView : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI _nameLabel;
        [SerializeField] private Image _iconImage;
        [Tooltip("Оверлей-«галочка»/зачёркивание, показывается при нахождении.")]
        [SerializeField] private GameObject _foundOverlay;
        [SerializeField] private CanvasGroup _group;

        /// <summary>Заполнить строку: название и требуемое количество.</summary>
        public void Render(string displayName, int count)
        {
            if (_nameLabel) _nameLabel.text = count > 1 ? $"{displayName} ×{count}" : displayName;
            if (_foundOverlay) _foundOverlay.SetActive(false);
            if (_group) _group.alpha = 1f;
        }

        /// <summary>Пометить предмет найденным (визуально «вычеркнуть»).</summary>
        public void MarkFound()
        {
            if (_foundOverlay) _foundOverlay.SetActive(true);
            if (_group) _group.alpha = 0.4f; // приглушаем найденную строку
        }

        /// <summary>Доступ к иконке — для будущей асинхронной загрузки спрайта.</summary>
        public Image IconImage => _iconImage;
    }
}
