// -----------------------------------------------------------------------------
//  ProfileScreen.cs — профиль игрока.
//
//  Показывает уровень игрока и полосу опыта, суммарные звёзды, серию входов и
//  сетку достижений с кнопками получения награды. Данные берутся из сервисов
//  прогресса; полоса XP дополнительно обновляется по событию XpChangedEvent.
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class ProfileScreen : BaseScreen
    {
        [Header("Шапка профиля")]
        [SerializeField] private TextMeshProUGUI _levelLabel;
        [SerializeField] private Slider _xpBar;
        [SerializeField] private TextMeshProUGUI _xpLabel;
        [SerializeField] private TextMeshProUGUI _totalStarsLabel;
        [SerializeField] private TextMeshProUGUI _streakLabel;

        [Header("Достижения")]
        [SerializeField] private Transform _achievementsGrid;
        [Tooltip("Префаб карточки достижения с компонентом AchievementView. Назначается в инспекторе.")]
        [SerializeField] private AchievementView _achievementPrefab;

        [Header("Управление")]
        [SerializeField] private Button _closeButton;

        private System.Action<XpChangedEvent> _onXpChanged;

        protected override void Awake()
        {
            base.Awake();
            _onXpChanged = _ => RefreshHeader();
            if (_closeButton) _closeButton.onClick.AddListener(() =>
            {
                if (App.IsReady) App.Resolve<INavigation>().Back();
            });
        }

        private void OnEnable()
        {
            if (!App.IsReady) return;
            App.Bus.Subscribe(_onXpChanged);
        }

        private void OnDisable()
        {
            if (!App.IsReady) return;
            App.Bus.Unsubscribe(_onXpChanged);
        }

        protected override void OnShow()
        {
            RefreshHeader();
            RefreshAchievements();
        }

        private void RefreshHeader()
        {
            if (!App.IsReady) return;

            if (App.Services.TryResolve<IExperienceService>(out var xp))
            {
                if (_levelLabel) _levelLabel.text = $"Уровень {xp.PlayerLevel}";
                if (_xpBar) _xpBar.value = xp.XpForNextLevel > 0
                    ? Mathf.Clamp01((float)xp.XpIntoLevel / xp.XpForNextLevel) : 0f;
                if (_xpLabel) _xpLabel.text = $"{xp.XpIntoLevel}/{xp.XpForNextLevel} XP";
            }

            if (App.Services.TryResolve<IProgressService>(out var progress) && _totalStarsLabel)
                _totalStarsLabel.text = progress.TotalStars.ToString();

            if (App.Services.TryResolve<ILoginStreakService>(out var streak) && _streakLabel)
                _streakLabel.text = $"{streak.StreakDays} дн.";
        }

        private void RefreshAchievements()
        {
            if (_achievementsGrid == null || _achievementPrefab == null) return;
            if (!App.Services.TryResolve<IAchievementService>(out var achievements)) return;

            for (int i = _achievementsGrid.childCount - 1; i >= 0; i--)
                Destroy(_achievementsGrid.GetChild(i).gameObject);

            foreach (var state in achievements.All)
            {
                if (state?.Definition == null) continue;
                var view = Instantiate(_achievementPrefab, _achievementsGrid);
                string id = state.Id; // копия для замыкания
                view.Render(state);
                view.Bind(() => OnClaim(id));
                // TODO: иконку достижения грузить через ISpriteLoader (Definition.Icon).
            }
        }

        private void OnClaim(string achievementId)
        {
            if (!App.IsReady || !App.Services.TryResolve<IAchievementService>(out var achievements)) return;

            if (achievements.TryClaim(achievementId, out var reward))
                App.Resolve<INavigation>().Toast($"Получено: {DailyRewardScreen.Describe(reward)}");

            RefreshAchievements(); // обновляем состояние карточек
        }
    }

    /// <summary>Карточка достижения. Виджеты связываются в инспекторе.</summary>
    public sealed class AchievementView : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI _titleLabel;
        [SerializeField] private TextMeshProUGUI _descriptionLabel;
        [SerializeField] private TextMeshProUGUI _progressLabel;
        [SerializeField] private Slider _progressBar;
        [SerializeField] private Image _iconImage;
        [SerializeField] private Button _claimButton;
        [SerializeField] private GameObject _claimedOverlay;

        public Image IconImage => _iconImage;

        /// <summary>Заполнить карточку по текущему состоянию достижения.</summary>
        public void Render(AchievementState state)
        {
            var def = state.Definition;
            if (_titleLabel) _titleLabel.text = def.Title;
            if (_descriptionLabel) _descriptionLabel.text = def.Description;
            if (_progressLabel) _progressLabel.text = $"{Mathf.Min(state.Progress, state.Target)}/{state.Target}";
            if (_progressBar) _progressBar.value = state.Normalized;
            if (_claimedOverlay) _claimedOverlay.SetActive(state.Claimed);

            // Забрать можно только выполненное и ещё не полученное достижение.
            if (_claimButton) _claimButton.interactable = state.Unlocked && !state.Claimed;
        }

        public void Bind(UnityEngine.Events.UnityAction onClaim)
        {
            if (!_claimButton) return;
            _claimButton.onClick.RemoveAllListeners();
            _claimButton.onClick.AddListener(onClaim);
        }
    }
}
