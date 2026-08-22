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

   ─── proof: найважливіше поле ───
   Крім строку й номера операції міст віддає ще proof — те, чим сам
   магазин доводить покупку: purchaseToken у Google, transactionId в
   Apple. Застосунок відсилає його на наш сервер, і сервер іде
   перепитувати магазин напряму (api/_store.js).

   Без цього підписка з магазину існувала б лише в пам'яті телефона —
   тобто трималась би на слові застосунку, який можна підмінити.

   Реалізації дві, обирається у CONFIG.provider:
     'cdvpurchase' — cordova-plugin-purchase (CdvPurchase v13), за
                     замовчуванням: розмовляє з магазином напряму, без
                     стороннього сервісу й чужого акаунта;
     'revenuecat'  — @revenuecat/purchases-capacitor, якщо колись
                     знадобиться готова аналітика й спільні права.

   ⚠️ Перед релізом звірте назви методів із версією плагіна, яку
   встановите, — API плагінів змінюється між мажорами.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CONFIG = {
    provider: 'cdvpurchase',           // 'cdvpurchase' | 'revenuecat'
    entitlement: 'pro',                // знадобиться лише для revenuecat
    apiKeyIos: '',
    apiKeyAndroid: '',
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
        /* RevenueCat не віддає сирий чек магазину — у нього свій
           ідентифікатор користувача. Для нашої серверної перевірки
           цього замало, тож ця гілка лишається запасною. */
        proof: (info && info.originalAppUserId) || '',
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
          ? {ok: true, transactionId: String(st.transactionId || ''), proof: st.proof,
             ts: st.ts, expiresAt: st.expiresAt}
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
          ? [{productId: st.productId, transactionId: String(st.transactionId || ''),
              proof: st.proof, ts: st.ts, expiresAt: st.expiresAt}]
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
    /* Чим магазин доводить покупку. Google дає purchaseToken, Apple —
       transactionId, і лежать вони в різних місцях залежно від версії
       плагіна. Тому перебираємо відомі місця, а не покладаємось на
       одне: порожній proof означає, що сервер не зможе перевірити
       покупку взагалі, і тренер лишиться без доступу за свої гроші. */
    proofOf(t){
      if (!t) return '';
      var n = t.nativePurchase || {};
      return String(t.purchaseToken || n.purchaseToken ||
                    t.transactionId || n.transactionId || t.id || '');
    },
    owned(){
      var S = CDV.store();
      var out = [];
      CONFIG.products.forEach(id => {
        var p = S.get(id);
        if (p && p.owned) out.push({
          productId: id,
          transactionId: (p.transaction && p.transaction.id) || id,
          proof: CDV.proofOf(p.transaction),
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
        return mine ? {ok: true, transactionId: mine.transactionId, proof: mine.proof,
                       ts: mine.ts, expiresAt: mine.expiresAt}
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
