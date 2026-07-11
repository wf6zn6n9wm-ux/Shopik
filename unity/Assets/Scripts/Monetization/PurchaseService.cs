// -----------------------------------------------------------------------------
//  PurchaseService.cs — внутриигровые покупки (IAP).
//
//  DEV-ЗАГЛУШКА: покупка «проходит» мгновенно и без реального биллинга. Логика
//  выдачи (Remove Ads / содержимое товара) уже боевая, поэтому при подключении
//  Unity IAP останется лишь заменить «мгновенный успех» на реальные колбэки
//  IStoreController/ProcessPurchase. Места для боевых вызовов помечены «SDK-ШОВ».
// -----------------------------------------------------------------------------
using System;
using System.Threading.Tasks;
using UnityEngine;
using Findoria.Core;
using Findoria.Core.Events;
using Findoria.Data;

namespace Findoria.Monetization
{
    public sealed class PurchaseService : IPurchaseService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;
        private readonly Findoria.Economy.IRewardService _rewards;
        private readonly GameCatalog _catalog;

        public PurchaseService(ISaveService save, EventBus bus,
                               Findoria.Economy.IRewardService rewards, GameCatalog catalog)
        {
            _save = save;
            _bus = bus;
            _rewards = rewards;
            _catalog = catalog;
        }

        public bool IsRemoveAdsOwned => _save.Data.RemoveAds;

        public Task InitializeAsync()
        {
            Debug.Log("[IAP] init (stub)");
            // SDK-ШОВ: здесь конфигурируется Unity IAP, напр.:
            //   var builder = ConfigurationBuilder.Instance(StandardPurchasingModule.Instance());
            //   foreach (var item in _catalog.ShopItems)
            //       if (!string.IsNullOrEmpty(item.StoreProductId))
            //           builder.AddProduct(item.StoreProductId, MapKind(item.Kind));
            //   UnityPurchasing.Initialize(this, builder); // this : IStoreListener
            // Инициализация асинхронная — верните реальный Task вместо CompletedTask.
            return Task.CompletedTask;
        }

        public void Buy(string productId, Action<OperationResult> onFinished)
        {
            var item = FindItem(productId);
            if (item == null)
            {
                Debug.LogWarning($"[IAP] product '{productId}' not found");
                onFinished?.Invoke(OperationResult.Failed);
                return;
            }

            // SDK-ШОВ: боевая реализация здесь лишь стартует покупку:
            //   _storeController.InitiatePurchase(productId);
            // а фактическая выдача (код ниже) должна выполняться в ProcessPurchase(...)
            // после подтверждения платформой. Заглушка выдаёт сразу.
            GrantPurchase(item);

            _bus.Publish(new PurchaseCompletedEvent(productId, OperationResult.Success));
            onFinished?.Invoke(OperationResult.Success);
        }

        public void Restore(Action<OperationResult> onFinished)
        {
            // Заглушка: восстанавливать нечего, кроме уже применённых прав.
            // Если non-consumable «Remove Ads» был куплен — оставляем его включённым.
            if (_save.Data.RemoveAds)
                _bus.Publish(new RemoveAdsChangedEvent(true));

            Debug.Log("[IAP] Restore (stub)");
            // SDK-ШОВ: iOS — _appleExtensions.RestoreTransactions(cb);
            //          Android — покупки восстанавливаются автоматически при Initialize
            //          (запросить через _storeController.products и переприменить права).
            onFinished?.Invoke(OperationResult.Success);
        }

        public string GetLocalizedPrice(string productId)
        {
            // SDK-ШОВ: боевая цена берётся из метаданных продукта, напр.:
            //   _storeController.products.WithID(productId).metadata.localizedPriceString
            return "$1.99"; // плейсхолдер для UI в режиме заглушки
        }

        // --------------------------------------------------------------- helpers --

        /// <summary>Ищем товар по StoreProductId, при промахе — по Id (fallback).</summary>
        private ShopItemData FindItem(string productId)
        {
            if (string.IsNullOrEmpty(productId) || _catalog?.ShopItems == null) return null;

            ShopItemData byId = null;
            foreach (var it in _catalog.ShopItems)
            {
                if (it == null) continue;
                if (it.StoreProductId == productId) return it;
                if (byId == null && it.Id == productId) byId = it;
            }
            return byId;
        }

        /// <summary>Применяет права/содержимое купленного товара. Единая точка выдачи.</summary>
        private void GrantPurchase(ShopItemData item)
        {
            if (item.Kind == ShopItemKind.RemoveAds)
            {
                _save.Data.RemoveAds = true;
                _save.Save();
                _bus.Publish(new RemoveAdsChangedEvent(true));
            }
            else
            {
                // Монеты/кристаллы/бустеры и т.п. — через общий RewardService.
                _rewards.GrantAll(item.Contents);
            }
        }
    }
}
