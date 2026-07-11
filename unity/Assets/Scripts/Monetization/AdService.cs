// -----------------------------------------------------------------------------
//  AdService.cs — фасад рекламы (баннер / межстраничная / rewarded).
//
//  Это DEV-ЗАГЛУШКА: она НЕ подключает реальную рекламную сеть, а лишь
//  симулирует её поведение (логи + мгновенный «успешный просмотр»). Структура
//  повторяет реальный интеграционный слой, поэтому боевой SDK (AdMob /
//  Unity LevelPlay / любой mediation) подставляется за тем же IAdService без
//  правок вызывающего кода. Места для боевых вызовов помечены «SDK-ШОВ».
// -----------------------------------------------------------------------------
using System;
using System.Threading.Tasks;
using UnityEngine;
using Findoria.Core;
using Findoria.Core.Events;

namespace Findoria.Monetization
{
    public sealed class AdService : IAdService
    {
        private readonly ISaveService _save;
        private readonly EventBus _bus;

        public AdService(ISaveService save, EventBus bus)
        {
            _save = save;
            _bus = bus;
        }

        /// <summary>Реклама отключена, если куплен «Remove Ads».</summary>
        public bool AreAdsRemoved => _save.Data.RemoveAds;

        /// <summary>
        /// Заглушка всегда «готова». Боевая реализация должна возвращать true
        /// только когда rewarded-объявление реально загружено (IsRewardedAdReady).
        /// </summary>
        public bool IsRewardedReady => true;

        public Task InitializeAsync()
        {
            Debug.Log("[Ads] init (stub)");
            // SDK-ШОВ: здесь инициализируется боевой SDK и загружаются первые объявления, напр.:
            //   MobileAds.Initialize(_ => { LoadBanner(); LoadInterstitial(); LoadRewarded(); });
            // Инициализация обычно асинхронная — верните реальный Task вместо CompletedTask.
            return Task.CompletedTask;
        }

        public void ShowBanner()
        {
            if (AreAdsRemoved) return; // покупатель «Remove Ads» баннер не видит
            Debug.Log("[Ads] ShowBanner (stub)");
            // SDK-ШОВ: _bannerView.Show(); (создание/загрузка баннера — при инициализации)
        }

        public void HideBanner()
        {
            if (AreAdsRemoved) return;
            Debug.Log("[Ads] HideBanner (stub)");
            // SDK-ШОВ: _bannerView.Hide();
        }

        public void ShowInterstitial(string placement, Action onClosed = null)
        {
            // При отключённой рекламе сразу отдаём управление вызывающему коду.
            if (AreAdsRemoved)
            {
                onClosed?.Invoke();
                return;
            }

            Debug.Log($"[Ads] ShowInterstitial '{placement}' (stub)");
            // SDK-ШОВ: показать боевую межстраничную и вызвать onClosed в колбэке OnAdClosed,
            // затем сразу подгрузить следующую. Если объявление не готово — тоже onClosed().
            onClosed?.Invoke();
        }

        public void ShowRewarded(string placement, Action<OperationResult> onFinished)
        {
            Debug.Log($"[Ads] ShowRewarded '{placement}' (stub)");

            // SDK-ШОВ: боевая реализация показывает rewarded-ролик и выдаёт награду
            // ТОЛЬКО в колбэке OnUserEarnedReward (полный просмотр). Иные исходы:
            //   отмена/закрытие досрочно -> OperationResult.Cancelled
            //   объявление не загружено   -> OperationResult.NotAvailable
            //   ошибка показа             -> OperationResult.Failed
            // Заглушка же всегда симулирует успешный полный просмотр:
            onFinished?.Invoke(OperationResult.Success);
            _bus.Publish(new RewardedAdWatchedEvent(placement, OperationResult.Success));
        }
    }
}
