// -----------------------------------------------------------------------------
//  LoseScreen.cs — экран поражения.
//
//  Реагирует на LevelFailedEvent. Кнопки: Повторить (нужна жизнь), Карта и
//  «Продолжить» за просмотр рекламы (после награды — повтор уровня).
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Core.Events;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class LoseScreen : BaseScreen
    {
        [Header("Информация")]
        [SerializeField] private TextMeshProUGUI _titleLabel;

        [Header("Кнопки")]
        [SerializeField] private Button _retryButton;
        [SerializeField] private Button _mapButton;
        [SerializeField] private Button _continueAdButton;

        private string _levelId;
        private System.Action<LevelFailedEvent> _onLevelFailed;

        protected override void Awake()
        {
            base.Awake();
            _onLevelFailed = OnLevelFailed;

            if (_retryButton) _retryButton.onClick.AddListener(OnRetry);
            if (_mapButton) _mapButton.onClick.AddListener(OnMap);
            if (_continueAdButton) _continueAdButton.onClick.AddListener(OnContinueForAd);
        }

        private void OnEnable()
        {
            if (!App.IsReady) return;
            App.Bus.Subscribe(_onLevelFailed);
        }

        private void OnDisable()
        {
            if (!App.IsReady) return;
            App.Bus.Unsubscribe(_onLevelFailed);
        }

        protected override void OnShow()
        {
            if (string.IsNullOrEmpty(_levelId) && App.IsReady &&
                App.Services.TryResolve<IGameFlow>(out var flow))
                _levelId = flow.CurrentLevelId;

            if (_titleLabel) _titleLabel.text = "Уровень не пройден";
            // Кнопка рекламы доступна только если реклама готова.
            if (_continueAdButton && App.IsReady && App.Services.TryResolve<IAdService>(out var ads))
                _continueAdButton.interactable = ads.IsRewardedReady;
        }

        private void OnLevelFailed(LevelFailedEvent e)
        {
            _levelId = e.LevelId;
            App.Resolve<INavigation>().Show(ScreenId.Lose);
        }

        // ---- Кнопки ---------------------------------------------------------

        private void OnRetry()
        {
            if (!App.IsReady) return;
            var nav = App.Resolve<INavigation>();

            // Повтор требует жизни.
            if (App.Services.TryResolve<ILivesService>(out var lives) && !lives.HasLife)
            {
                nav.Toast("Нет жизней для повтора");
                return;
            }

            _levelId = null;
            if (App.Services.TryResolve<IGameFlow>(out var flow)) flow.RetryCurrentLevel();
            nav.Show(ScreenId.Game);
        }

        private void OnMap()
        {
            if (!App.IsReady) return;
            _levelId = null;
            App.Resolve<INavigation>().Show(ScreenId.WorldMap);
        }

        private void OnContinueForAd()
        {
            if (!App.IsReady) return;
            if (!App.Services.TryResolve<IAdService>(out var ads)) return;

            ads.ShowRewarded("lose_continue", result =>
            {
                if (result != OperationResult.Success) return;
                // Даём игроку продолжить, перезапустив уровень.
                _levelId = null;
                if (App.Services.TryResolve<IGameFlow>(out var flow)) flow.RetryCurrentLevel();
                App.Resolve<INavigation>().Show(ScreenId.Game);
            });
        }
    }
}
