// -----------------------------------------------------------------------------
//  WinScreen.cs — экран победы.
//
//  Реагирует на LevelCompletedEvent: показывает заработанные звёзды и награды
//  (монеты/опыт из LevelData). Кнопки: Далее (следующий уровень или карта),
//  Повторить, Карта, и опциональная «Удвоить награду» за просмотр рекламы.
// -----------------------------------------------------------------------------
using System.Collections;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class WinScreen : BaseScreen
    {
        [Header("Награды и звёзды")]
        [Tooltip("Иконки звёзд по порядку (3 штуки).")]
        [SerializeField] private Image[] _stars = new Image[3];
        [SerializeField] private TextMeshProUGUI _coinsLabel;
        [SerializeField] private TextMeshProUGUI _xpLabel;

        [Header("Кнопки")]
        [SerializeField] private Button _nextButton;
        [SerializeField] private Button _retryButton;
        [SerializeField] private Button _mapButton;
        [SerializeField] private Button _doubleRewardButton;

        // Последний результат (кэшируется из события, используется при показе).
        private string _levelId;
        private int _stars3;
        private bool _doubleClaimed;

        private System.Action<LevelCompletedEvent> _onLevelCompleted;

        protected override void Awake()
        {
            base.Awake();
            _onLevelCompleted = OnLevelCompleted;

            if (_nextButton) _nextButton.onClick.AddListener(OnNext);
            if (_retryButton) _retryButton.onClick.AddListener(OnRetry);
            if (_mapButton) _mapButton.onClick.AddListener(OnMap);
            if (_doubleRewardButton) _doubleRewardButton.onClick.AddListener(OnDoubleReward);
        }

        private void OnEnable()
        {
            if (!App.IsReady) return;
            App.Bus.Subscribe(_onLevelCompleted);
        }

        private void OnDisable()
        {
            if (!App.IsReady) return;
            App.Bus.Unsubscribe(_onLevelCompleted);
        }

        // Если экран открыт напрямую навигацией — берём данные из сервисов.
        protected override void OnShow()
        {
            if (string.IsNullOrEmpty(_levelId) && App.IsReady &&
                App.Services.TryResolve<IGameFlow>(out var flow))
            {
                _levelId = flow.CurrentLevelId;
                if (App.Services.TryResolve<IProgressService>(out var progress) && !string.IsNullOrEmpty(_levelId))
                    _stars3 = progress.GetStars(_levelId);
            }
            _doubleClaimed = false;
            if (_doubleRewardButton) _doubleRewardButton.interactable = true;
            Refresh();
        }

        private void OnLevelCompleted(LevelCompletedEvent e)
        {
            _levelId = e.LevelId;
            _stars3 = e.Stars;
            _doubleClaimed = false;

            // Экран сам показывает себя по завершении уровня.
            App.Resolve<INavigation>().Show(ScreenId.Win);
            Refresh();
        }

        private void Refresh()
        {
            // Звёзды.
            if (_stars != null)
                for (int i = 0; i < _stars.Length; i++)
                    if (_stars[i]) _stars[i].enabled = i < _stars3;

            // Награды из данных уровня.
            var level = LevelOrNull();
            if (level != null)
            {
                if (_coinsLabel) _coinsLabel.text = $"+{level.RewardCoins}";
                if (_xpLabel) _xpLabel.text = $"+{level.RewardXp} XP";
            }

            if (isActiveAndEnabled) StartCoroutine(PopStars());
        }

        private LevelData LevelOrNull()
        {
            if (!App.IsReady || string.IsNullOrEmpty(_levelId)) return null;
            return App.Services.TryResolve<ILevelProvider>(out var lp) ? lp.GetLevel(_levelId) : null;
        }

        // Небольшая анимация «выскакивания» звёзд по очереди.
        private IEnumerator PopStars()
        {
            if (_stars == null) yield break;
            for (int i = 0; i < _stars.Length; i++)
            {
                if (_stars[i] == null || i >= _stars3) continue;
                var tr = _stars[i].transform;
                float t = 0f;
                while (t < 0.2f)
                {
                    t += Time.unscaledDeltaTime;
                    tr.localScale = Vector3.one * Mathf.Lerp(0.4f, 1f, t / 0.2f);
                    yield return null;
                }
                tr.localScale = Vector3.one;
                yield return new WaitForSecondsRealtime(0.08f);
            }
        }

        // ---- Кнопки ---------------------------------------------------------

        private void OnNext()
        {
            if (!App.IsReady) return;
            var nav = App.Resolve<INavigation>();
            string next = null;
            if (App.Services.TryResolve<IProgressService>(out var progress) && !string.IsNullOrEmpty(_levelId))
                next = progress.GetNextLevelId(_levelId);

            _levelId = null; // сбрасываем кэш перед выходом

            if (!string.IsNullOrEmpty(next) && App.Services.TryResolve<IGameFlow>(out var flow))
            {
                flow.StartLevel(next);
                nav.Show(ScreenId.Game);
            }
            else
            {
                nav.Show(ScreenId.WorldMap); // уровней больше нет — на карту
            }
        }

        private void OnRetry()
        {
            if (!App.IsReady) return;
            _levelId = null;
            if (App.Services.TryResolve<IGameFlow>(out var flow)) flow.RetryCurrentLevel();
            App.Resolve<INavigation>().Show(ScreenId.Game);
        }

        private void OnMap()
        {
            if (!App.IsReady) return;
            _levelId = null;
            App.Resolve<INavigation>().Show(ScreenId.WorldMap);
        }

        private void OnDoubleReward()
        {
            if (!App.IsReady || _doubleClaimed) return;
            if (!App.Services.TryResolve<IAdService>(out var ads)) return;

            ads.ShowRewarded("win_double", result =>
            {
                if (result != OperationResult.Success) return;
                var level = LevelOrNull();
                if (level != null && App.Services.TryResolve<IWalletService>(out var wallet))
                    wallet.Add(CurrencyType.Coins, level.RewardCoins); // выдаём столько же ещё раз

                _doubleClaimed = true;
                if (_doubleRewardButton) _doubleRewardButton.interactable = false;
                App.Resolve<INavigation>().Toast("Награда удвоена!");
            });
        }
    }
}
