/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · міст до магазину застосунків

   Застосунок нічого не знає про StoreKit чи Play Billing: він працює
   з одним об'єктом window.ProTrainerIAP і чекає від нього рівно це:

     platform          'ios' | 'android'
     buy(productId)  → {ok, transactionId?, ts?, expiresAt?, error?}
     restore()       → {ok, purchases:[{productId, transactionId, ts, expiresAt?}]}
     status()        → {ok, active, productId?, expiresAt?, autoRenew?}   (необов'язково)

   Якщо магазин повідомляє expiresAt — застосунок бере його, бо магазин
   знає про продовження й скасування більше. Якщо моста немає (веб,
   браузер, дев-збірка) — застосунок сам вмикає демо-режим, тож цей файл
   можна не підключати.

   Реалізації дві, обирається у CONFIG.provider:
     'revenuecat'  — @revenuecat/purchases-capacitor (за замовчуванням:
                     дає серверну перевірку чеків і спільні права доступу
                     між пристроями, тобто закриває питання «перевстановив
                     застосунок — отримав новий пробний період»);
     'cdvpurchase' — cordova-plugin-purchase (CdvPurchase v13), якщо не
                     хочете зовнішній сервіс.

   ⚠️ Перед релізом: підставте ключі в CONFIG і звірте назви методів із
   версією плагіна, яку встановите — API плагінів змінюється між мажорами.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CONFIG = {
    provider: 'revenuecat',            // 'revenuecat' | 'cdvpurchase'
    entitlement: 'pro',                // назва entitlement у RevenueCat
    apiKeyIos: 'appl_XXXXXXXXXXXXXXXXXXXX',
    apiKeyAndroid: 'goog_XXXXXXXXXXXXXXXXXXXX',
    products: ['pro_trainer_monthly', 'pro_trainer_quarterly', 'pro_trainer_yearly'],
  };

  var C = window.Capacitor;
  var platform = (C && C.getPlatform && C.getPlatform()) || 'web';
  if (platform !== 'ios' && platform !== 'android') return;   // у вебі міст не потрібен

  var ts = v => (v ? +new Date(v) : undefined);
  var log = (m, e) => console.warn('[iap] ' + m, e || '');

  /* ─────────── RevenueCat ─────────── */
  var RC = {
    plugin(){ return (C.Plugins && C.Plugins.Purchases) || window.Purchases || null; },
    ready: false,
    async init(){
      var P = RC.plugin();
      if (!P) return false;
      if (RC.ready) return true;
      await P.configure({apiKey: platform === 'ios' ? CONFIG.apiKeyIos : CONFIG.apiKeyAndroid});
      RC.ready = true;
      return true;
    },
    /* права доступу → зрозумілий застосунку вигляд */
    fromInfo(info){
      var ent = info && info.entitlements && info.entitlements.active
        ? info.entitlements.active[CONFIG.entitlement] : null;
      if (!ent) return {ok: true, active: false};
      return {
        ok: true,
        active: true,
        productId: ent.productIdentifier,
        expiresAt: ts(ent.expirationDate),
        autoRenew: ent.willRenew !== false,
        transactionId: info.originalPurchaseDate || ent.originalPurchaseDate,
        ts: ts(ent.latestPurchaseDate) || Date.now(),
      };
    },
    async buy(productId){
      var P = RC.plugin();
      if (!(await RC.init())) return {ok: false, error: 'store_unavailable'};
      try {
        var got = await P.getProducts({productIdentifiers: [productId]});
        var product = (got && (got.products || got))[0];
        if (!product) return {ok: false, error: 'product_not_found'};
        var res = await P.purchaseStoreProduct({product: product});
        var st = RC.fromInfo(res && res.customerInfo);
        return st.active
          ? {ok: true, transactionId: String(st.transactionId || ''), ts: st.ts, expiresAt: st.expiresAt}
          : {ok: false, error: 'not_entitled'};
      } catch (e){
        /* користувач закрив вікно оплати — це не помилка застосунку */
        if (e && (e.code === 'PURCHASE_CANCELLED' || e.userCancelled)) return {ok: false, error: 'cancelled'};
        log('buy', e);
        return {ok: false, error: (e && (e.message || e.code)) || 'payment_failed'};
      }
    },
    async restore(){
      var P = RC.plugin();
      if (!(await RC.init())) return {ok: false, error: 'store_unavailable'};
      try {
        var res = await P.restorePurchases();
        var st = RC.fromInfo(res && res.customerInfo);
        return {ok: true, purchases: st.active
          ? [{productId: st.productId, transactionId: String(st.transactionId || ''), ts: st.ts, expiresAt: st.expiresAt}]
          : []};
      } catch (e){ log('restore', e); return {ok: false, error: 'restore_failed'}; }
    },
    async status(){
      var P = RC.plugin();
      if (!(await RC.init())) return {ok: false};
      try {
        var res = await P.getCustomerInfo();
        return RC.fromInfo(res && res.customerInfo);
      } catch (e){ log('status', e); return {ok: false}; }
    },
  };

  /* ─────────── cordova-plugin-purchase ─────────── */
  var CDV = {
    ready: false,
    store(){ return window.CdvPurchase && window.CdvPurchase.store; },
    async init(){
      var S = CDV.store();
      if (!S) return false;
      if (CDV.ready) return true;
      var P = window.CdvPurchase;
      S.register(CONFIG.products.map(id => ({
        id: id,
        type: P.ProductType.PAID_SUBSCRIPTION,
        platform: platform === 'ios' ? P.Platform.APPLE_APPSTORE : P.Platform.GOOGLE_PLAY,
      })));
      await S.initialize([platform === 'ios' ? P.Platform.APPLE_APPSTORE : P.Platform.GOOGLE_PLAY]);
      CDV.ready = true;
      return true;
    },
    owned(){
      var S = CDV.store();
      var out = [];
      CONFIG.products.forEach(id => {
        var p = S.get(id);
        if (p && p.owned) out.push({
          productId: id,
          transactionId: (p.transaction && p.transaction.id) || id,
          ts: ts(p.lastRenewalDate) || Date.now(),
          expiresAt: ts(p.expiryDate),
        });
      });
      return out;
    },
    async buy(productId){
      if (!(await CDV.init())) return {ok: false, error: 'store_unavailable'};
      try {
        var S = CDV.store();
        var offer = S.get(productId) && S.get(productId).getOffer();
        if (!offer) return {ok: false, error: 'product_not_found'};
        var err = await offer.order();
        if (err) return {ok: false, error: err.message || 'payment_failed'};
        var mine = CDV.owned().filter(x => x.productId === productId)[0];
        return mine ? {ok: true, transactionId: mine.transactionId, ts: mine.ts, expiresAt: mine.expiresAt}
                    : {ok: true, transactionId: 'pending', ts: Date.now()};
      } catch (e){ log('buy', e); return {ok: false, error: 'payment_failed'}; }
    },
    async restore(){
      if (!(await CDV.init())) return {ok: false, error: 'store_unavailable'};
      try { await CDV.store().restorePurchases(); return {ok: true, purchases: CDV.owned()}; }
      catch (e){ log('restore', e); return {ok: false, error: 'restore_failed'}; }
    },
    async status(){
      if (!(await CDV.init())) return {ok: false};
      var mine = CDV.owned()[0];
      return mine
        ? {ok: true, active: !mine.expiresAt || mine.expiresAt > Date.now(), productId: mine.productId, expiresAt: mine.expiresAt}
        : {ok: true, active: false};
    },
  };

  var impl = CONFIG.provider === 'cdvpurchase' ? CDV : RC;

  window.ProTrainerIAP = {
    platform: platform,
    buy: id => impl.buy(id),
    restore: () => impl.restore(),
    status: () => impl.status(),
  };

  /* підписка могла змінитись, поки застосунок був згорнутий */
  document.addEventListener('resume', function () {
    if (window.ProTrainerIAP.status) window.ProTrainerIAP.status().catch(function(){});
  });
})();
