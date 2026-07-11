// -----------------------------------------------------------------------------
//  ShopScreen.cs — магазин.
//
//  Строит список товаров из GameCatalog.ShopItems. Товар с StoreProductId — это
//  реальная покупка (IAP) через IPurchaseService; иначе покупка за внутриигровую
//  валюту через IWalletService с последующей выдачей содержимого. Отдельно —
//  «Убрать рекламу» и «Восстановить покупки».
// -----------------------------------------------------------------------------
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Findoria.UI
{
    public sealed class ShopScreen : BaseScreen
    {
        [Header("Список товаров")]
        [SerializeField] private Transform _content;
        [Tooltip("Префаб карточки товара с компонентом ShopItemView. Назначается в инспекторе.")]
        [SerializeField] private ShopItemView _shopItemPrefab;

        [Header("Баланс")]
        [SerializeField] private TextMeshProUGUI _coinsLabel;
        [SerializeField] private TextMeshProUGUI _gemsLabel;

        [Header("Дополнительно")]
        [SerializeField] private Button _removeAdsButton;
        [SerializeField] private Button _restoreButton;
        [SerializeField] private Button _backButton;

        // Поле-обработчик: любое изменение валюты перерисовывает магазин (цены/баланс).
        private System.Action<CurrencyChangedEvent> _onCurrencyChanged;

        protected override void Awake()
        {
            base.Awake();
            _onCurrencyChanged = _ => Refresh();

            if (_removeAdsButton) _removeAdsButton.onClick.AddListener(OnRemoveAds);
            if (_restoreButton) _restoreButton.onClick.AddListener(OnRestore);
            if (_backButton) _backButton.onClick.AddListener(() =>
            {
                if (App.IsReady) App.Resolve<INavigation>().Back();
            });
        }

        private void OnEnable()
        {
            if (!App.IsReady) return;
            App.Bus.Subscribe(_onCurrencyChanged);
        }

        private void OnDisable()
        {
            if (!App.IsReady) return;
            App.Bus.Unsubscribe(_onCurrencyChanged);
        }

        protected override void OnShow() => Refresh();

        /// <summary>Пересобрать список товаров и обновить баланс.</summary>
        public void Refresh()
        {
            if (!App.IsReady) return;
            UpdateBalance();

            if (_content == null || _shopItemPrefab == null) return;
            if (!App.Services.TryResolve<GameCatalog>(out var catalog) || catalog == null) return;

            for (int i = _content.childCount - 1; i >= 0; i--)
                Destroy(_content.GetChild(i).gameObject);

            var purchases = App.Services.TryResolve<IPurchaseService>(out var p) ? p : null;

            foreach (var item in catalog.ShopItems)
            {
                if (item == null) continue;

                bool isIap = !string.IsNullOrEmpty(item.StoreProductId);
                string price = isIap
                    ? (purchases?.GetLocalizedPrice(item.StoreProductId) ?? "—")
                    : $"{item.SoftPrice} {(item.SoftPriceCurrency == CurrencyType.Coins ? "монет" : "кристаллов")}";

                var view = Instantiate(_shopItemPrefab, _content);
                var captured = item; // для замыкания
                view.Render(item.Title, price, item.IsBestValue);
                view.Bind(() => Buy(captured));
                // TODO: иконку товара грузить через ISpriteLoader (item.Icon).
            }
        }

        private void Buy(ShopItemData item)
        {
            if (!App.IsReady || item == null) return;
            var nav = App.Resolve<INavigation>();

            // --- Реальная покупка (IAP) ---
            if (!string.IsNullOrEmpty(item.StoreProductId))
            {
                if (!App.Services.TryResolve<IPurchaseService>(out var purchases))
                {
                    nav.Toast("Магазин недоступен");
                    return;
                }
                purchases.Buy(item.StoreProductId, result =>
                {
                    nav.Toast(result == OperationResult.Success ? "Покупка совершена" : "Покупка не удалась");
                    Refresh();
                });
                return;
            }

            // --- Покупка за внутриигровую валюту ---
            if (!App.Services.TryResolve<IWalletService>(out var wallet))
            {
                nav.Toast("Кошелёк недоступен");
                return;
            }
            if (!wallet.TrySpend(item.SoftPriceCurrency, item.SoftPrice))
            {
                nav.Toast("Недостаточно средств");
                return;
            }

            // Мягкая покупка: выдаём содержимое. В «боевой» версии выдачу лучше
            // проводить через отдельный RewardService/событие — здесь применяем напрямую.
            foreach (var reward in item.Contents) GrantReward(reward);
            nav.Toast("Куплено!");
            Refresh();
        }

        /// <summary>Применить одну награду к профилю игрока через доменные сервисы.</summary>
        private void GrantReward(Reward reward)
        {
            switch (reward.Kind)
            {
                case RewardKind.Coins:
                    if (App.Services.TryResolve<IWalletService>(out var w1)) w1.Add(CurrencyType.Coins, reward.Amount);
                    break;
                case RewardKind.Gems:
                    if (App.Services.TryResolve<IWalletService>(out var w2)) w2.Add(CurrencyType.Gems, reward.Amount);
                    break;
                case RewardKind.Xp:
                    if (App.Services.TryResolve<IExperienceService>(out var xp)) xp.AddXp(reward.Amount);
                    break;
                case RewardKind.Booster:
                    if (App.Services.TryResolve<IBoosterService>(out var b)) b.Add(reward.Booster, reward.Amount);
                    break;
                case RewardKind.Life:
                    if (App.Services.TryResolve<ILivesService>(out var l)) l.Add(reward.Amount);
                    break;
                case RewardKind.RemoveAds:
                    // Обрабатывается сервисом покупок; здесь ничего не делаем.
                    break;
            }
        }

        private void OnRemoveAds()
        {
            if (!App.IsReady) return;
            var nav = App.Resolve<INavigation>();
            if (!App.Services.TryResolve<IPurchaseService>(out var purchases)) { nav.Toast("Недоступно"); return; }
            // Условный productId для «убрать рекламу»; настраивается в конфиге платформы.
            purchases.Buy("remove_ads", result =>
                nav.Toast(result == OperationResult.Success ? "Реклама отключена" : "Не удалось"));
        }

        private void OnRestore()
        {
            if (!App.IsReady) return;
            var nav = App.Resolve<INavigation>();
            if (!App.Services.TryResolve<IPurchaseService>(out var purchases)) { nav.Toast("Недоступно"); return; }
            purchases.Restore(result =>
                nav.Toast(result == OperationResult.Success ? "Покупки восстановлены" : "Нечего восстанавливать"));
        }

        private void UpdateBalance()
        {
            if (!App.Services.TryResolve<IWalletService>(out var wallet)) return;
            if (_coinsLabel) _coinsLabel.text = wallet.Coins.ToString();
            if (_gemsLabel) _gemsLabel.text = wallet.Gems.ToString();
        }
    }

    /// <summary>Карточка товара магазина. Виджеты связываются в инспекторе.</summary>
    public sealed class ShopItemView : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI _titleLabel;
        [SerializeField] private TextMeshProUGUI _priceLabel;
        [SerializeField] private Image _iconImage;
        [SerializeField] private GameObject _bestValueBadge;
        [SerializeField] private Button _buyButton;

        public Image IconImage => _iconImage;

        public void Render(string title, string price, bool bestValue)
        {
            if (_titleLabel) _titleLabel.text = title;
            if (_priceLabel) _priceLabel.text = price;
            if (_bestValueBadge) _bestValueBadge.SetActive(bestValue);
        }

        public void Bind(UnityEngine.Events.UnityAction onBuy)
        {
            if (!_buyButton) return;
            _buyButton.onClick.RemoveAllListeners();
            _buyButton.onClick.AddListener(onBuy);
        }
    }
}
