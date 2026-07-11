// -----------------------------------------------------------------------------
//  MainMenuScreen.cs — главное меню.
//
//  Кнопки перехода (Играть, Магазин, Настройки, Ежедневная награда, Профиль) и
//  «шапка» с балансом (монеты/кристаллы/жизни). Баланс обновляется по событиям
//  экономики, поэтому меню не опрашивает сервисы каждый кадр.
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Core.Events;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class MainMenuScreen : BaseScreen
    {
        [Header("Кнопки навигации (заполняются в инспекторе)")]
        [SerializeField] private Button _playButton;
        [SerializeField] private Button _shopButton;
        [SerializeField] private Button _settingsButton;
        [SerializeField] private Button _dailyRewardButton;
        [SerializeField] private Button _profileButton;

        [Header("Баланс")]
        [SerializeField] private TextMeshProUGUI _coinsLabel;
        [SerializeField] private TextMeshProUGUI _gemsLabel;
        [SerializeField] private TextMeshProUGUI _livesLabel;

        // Поля-обработчики: нужны, чтобы корректно отписаться в OnDisable.
        private System.Action<CurrencyChangedEvent> _onCurrencyChanged;
        private System.Action<LivesChangedEvent> _onLivesChanged;

        protected override void Awake()
        {
            base.Awake();
            // Кнопки подключаем один раз. Навигацию резолвим лениво при клике.
            if (_playButton) _playButton.onClick.AddListener(() => Navigate(ScreenId.WorldMap));
            if (_shopButton) _shopButton.onClick.AddListener(() => Navigate(ScreenId.Shop));
            if (_settingsButton) _settingsButton.onClick.AddListener(() => Navigate(ScreenId.Settings));
            if (_dailyRewardButton) _dailyRewardButton.onClick.AddListener(() => Navigate(ScreenId.DailyReward));
            if (_profileButton) _profileButton.onClick.AddListener(() => Navigate(ScreenId.Profile));

            _onCurrencyChanged = OnCurrencyChanged;
            _onLivesChanged = OnLivesChanged;
        }

        private void OnEnable()
        {
            if (!App.IsReady) return;
            App.Bus.Subscribe(_onCurrencyChanged);
            App.Bus.Subscribe(_onLivesChanged);
        }

        private void OnDisable()
        {
            if (!App.IsReady) return;
            App.Bus.Unsubscribe(_onCurrencyChanged);
            App.Bus.Unsubscribe(_onLivesChanged);
        }

        // При каждом показе читаем актуальные значения из сервисов.
        protected override void OnShow()
        {
            RefreshBalance();
        }

        private void Navigate(ScreenId target)
        {
            if (!App.IsReady) return;
            App.Resolve<INavigation>().Show(target);
        }

        private void RefreshBalance()
        {
            if (!App.IsReady) return;

            if (App.Services.TryResolve<IWalletService>(out var wallet))
            {
                if (_coinsLabel) _coinsLabel.text = wallet.Coins.ToString();
                if (_gemsLabel) _gemsLabel.text = wallet.Gems.ToString();
            }
            if (App.Services.TryResolve<ILivesService>(out var lives) && _livesLabel)
                _livesLabel.text = $"{lives.Current}/{lives.Max}";
        }

        private void OnCurrencyChanged(CurrencyChangedEvent e)
        {
            if (e.Currency == CurrencyType.Coins && _coinsLabel) _coinsLabel.text = e.NewAmount.ToString();
            if (e.Currency == CurrencyType.Gems && _gemsLabel) _gemsLabel.text = e.NewAmount.ToString();
        }

        private void OnLivesChanged(LivesChangedEvent e)
        {
            if (_livesLabel) _livesLabel.text = $"{e.Current}/{e.Max}";
        }
    }
}
