/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · перевірка покупок у магазинах застосунків

   Файл із підкресленням — спільний код, Vercel не рахує його за
   функцію. Дзвонить сюди /api/store.

   ─── навіщо це взагалі ───
   Магазин бере гроші сам, усередині телефона. Наш сервер про це не
   дізнається нізвідки — жодного сповіщення нам ніхто не шле за
   замовчуванням. Тож застосунок мусить сказати: «я купив, ось чек».

   І саме тут головне правило, те саме, що й із monobank: телефону не
   вірять. Застосунок можна зламати, міст до магазину — підмінити,
   відповідь «покупка вдалась» — підробити за п'ять хвилин. Тому чек
   перевіряється не в застосунку, а тут: сервер іде до Apple або Google
   своїм ключем і питає, чи справді ця покупка існує, за який тариф і до
   якого числа діє. Що відповість магазин — те й правда.

   Без ключів жодна перевірка не вдає, ніби все гаразд: вона чесно
   каже, що не налаштована. «Не змогли перевірити» ніколи не означає
   «покупка справжня» — інакше вимкненого ключа вистачило б, щоб
   отримати підписку задарма.

   ─── змінні оточення ───
   Google Play:
     GOOGLE_PLAY_SA        службовий акаунт, JSON цілком або base64 від нього
     GOOGLE_PLAY_PACKAGE   com.protrainer.app (за замовчуванням саме він)

   App Store:
     APPLE_KEY_ID          ідентифікатор ключа App Store Server API (.p8)
     APPLE_ISSUER_ID       ідентифікатор видавця з App Store Connect
     APPLE_PRIVATE_KEY     вміст .p8 цілком, або base64 від нього
     APPLE_BUNDLE_ID       com.protrainer.app (за замовчуванням саме він)
   ────────────────────────────────────────────────────────────────── */
const crypto = require('crypto');

const PACKAGE = process.env.GOOGLE_PLAY_PACKAGE || 'com.protrainer.app';
const BUNDLE = process.env.APPLE_BUNDLE_ID || 'com.protrainer.app';

/* productId у магазині → наш тариф. Тримаємо тут, а не в застосунку:
   застосунок може збрехати про що завгодно, зокрема й про те, який
   тариф він нібито купив. */
const PRODUCTS = {
  pro_trainer_monthly:   'monthly',
  pro_trainer_quarterly: 'quarterly',
  pro_trainer_yearly:    'yearly',
};

/* ключ може лежати як є або в base64 — приймаємо обидва написання,
   бо в змінну оточення багаторядковий PEM вставляється по-різному */
const unwrap = raw => {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.includes('-----BEGIN') || s.startsWith('{')) return s;
  try { return Buffer.from(s, 'base64').toString('utf8'); } catch { return s; }
};

const b64url = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ═══════════════ Google Play ═══════════════ */

const googleSA = () => {
  const raw = unwrap(process.env.GOOGLE_PLAY_SA);
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    return (sa.client_email && sa.private_key) ? sa : null;
  } catch { return null; }
};

/* Google не дає постійного ключа доступу: службовий акаунт підписує
   коротке посвідчення, а Google міняє його на токен на годину. Токен
   тримаємо в пам'яті функції, поки живий, — інакше кожна перевірка
   починалась би зі зайвого походу по нього. */
let gToken = {value: '', until: 0};

async function googleToken(){
  const sa = googleSA();
  if (!sa) return '';
  if (gToken.value && gToken.until > Date.now() + 60000) return gToken.value;

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  };
  const head = b64url(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const body = b64url(JSON.stringify(claim));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key));
  const jwt = head + '.' + body + '.' + sig;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt}),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) throw new Error('google_auth_failed');
  gToken = {value: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000};
  return gToken.value;
}

/* Питаємо Google про конкретну покупку. Відповідає він про підписку
   цілком: коли закінчується, чи продовжується, чи не скасована. */
async function checkGoogle({token}){
  if (!googleSA()) return {ok: false, why: 'google_not_configured'};
  let access;
  try { access = await googleToken(); }
  catch (e){ return {ok: false, why: String((e && e.message) || e)}; }

  const url = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
    encodeURIComponent(PACKAGE) + '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(token);
  let j;
  try {
    const r = await fetch(url, {headers: {authorization: 'Bearer ' + access}, signal: AbortSignal.timeout(10000)});
    j = await r.json().catch(() => null);
    if (!r.ok) return {ok: false, why: 'google_' + r.status + ((j && j.error && j.error.message) ? ': ' + j.error.message : '')};
  } catch (e){ return {ok: false, why: 'google_unreachable: ' + ((e && e.message) || e)}; }

  /* ACTIVE і IN_GRACE_PERIOD — гроші є або ось-ось будуть; решта станів
     (скасовано, призупинено, прострочено) доступу не дають. */
  const state = String((j && j.subscriptionState) || '');
  if (state !== 'SUBSCRIPTION_STATE_ACTIVE' && state !== 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD')
    return {ok: false, why: 'state_' + (state || 'unknown')};

  const line = (j.lineItems || [])[0] || {};
  const plan = PRODUCTS[line.productId];
  if (!plan) return {ok: false, why: 'unknown_product_' + (line.productId || '')};

  return {
    ok: true, plan,
    expiresAt: line.expiryTime ? +new Date(line.expiryTime) : 0,
    autoRenew: !!(line.autoRenewingPlan && line.autoRenewingPlan.autoRenewEnabled),
    orderId: String(j.latestOrderId || token).slice(0, 120),
  };
}

/* ═══════════════ App Store ═══════════════ */

const appleKey = () => {
  const key = unwrap(process.env.APPLE_PRIVATE_KEY);
  const kid = process.env.APPLE_KEY_ID || '';
  const iss = process.env.APPLE_ISSUER_ID || '';
  return (key && kid && iss) ? {key, kid, iss} : null;
};

/* Apple теж просить коротке посвідчення, але міняти його ні на що не
   треба — воно й є ключ доступу. Живе годину. */
function appleJwt(){
  const k = appleKey();
  if (!k) return '';
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({alg: 'ES256', kid: k.kid, typ: 'JWT'}));
  const body = b64url(JSON.stringify({
    iss: k.iss, iat: now, exp: now + 3000,
    aud: 'appstoreconnect-v1', bid: BUNDLE,
  }));
  /* ES256 просить підпис у форматі P1363, а Node за замовчуванням дає
     DER — з ним Apple відповідає 401, і причина ніде не написана. */
  const sig = crypto.createSign('SHA256')
    .update(head + '.' + body)
    .sign({key: k.key, dsaEncoding: 'ieee-p1363'});
  return head + '.' + body + '.' + b64url(sig);
}

/* Apple віддає відповідь підписаним рядком (JWS). Підпис тут не
   перевіряємо й не робимо вигляд, що перевіряємо: сам запит пішов на
   apple.com із нашим ключем і по HTTPS — підмінити відповідь на цьому
   шляху нікому. Читаємо середню частину. */
const jwsBody = s => {
  const parts = String(s || '').split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')); }
  catch { return null; }
};

async function checkApple({transactionId, sandbox}){
  if (!appleKey()) return {ok: false, why: 'apple_not_configured'};
  const host = sandbox ? 'https://api.storekit-sandbox.itunes.apple.com'
                       : 'https://api.storekit.itunes.apple.com';
  let j;
  try {
    const r = await fetch(host + '/inApps/v1/subscriptions/' + encodeURIComponent(transactionId), {
      headers: {authorization: 'Bearer ' + appleJwt()},
      signal: AbortSignal.timeout(10000),
    });
    j = await r.json().catch(() => null);
    /* 4040010 — «покупки тут немає»: так відповідає бойовий сервер на
       чек із пісочниці. Пробуємо там, але тільки один раз. */
    if (r.status === 404 && !sandbox && j && j.errorCode === 4040010)
      return checkApple({transactionId, sandbox: true});
    if (!r.ok) return {ok: false, why: 'apple_' + r.status + ((j && j.errorMessage) ? ': ' + j.errorMessage : '')};
  } catch (e){ return {ok: false, why: 'apple_unreachable: ' + ((e && e.message) || e)}; }

  const group = (j && j.data || [])[0] || {};
  const last = (group.lastTransactions || [])[0] || {};
  const status = Number(last.status || 0);
  /* 1 — активна, 4 — у пільговому періоді. 2 (прострочена), 3 (у стані
     відкликання), 5 (відкликана) доступу не дають. */
  if (status !== 1 && status !== 4) return {ok: false, why: 'apple_status_' + (status || 'unknown')};

  const info = jwsBody(last.signedTransactionInfo);
  const renew = jwsBody(last.signedRenewalInfo);
  if (!info) return {ok: false, why: 'apple_bad_payload'};

  const plan = PRODUCTS[info.productId];
  if (!plan) return {ok: false, why: 'unknown_product_' + (info.productId || '')};

  return {
    ok: true, plan,
    expiresAt: Number(info.expiresDate || 0),
    autoRenew: !!(renew && Number(renew.autoRenewStatus) === 1),
    orderId: String(info.originalTransactionId || transactionId).slice(0, 120),
  };
}

/* ═══════════════ спільний вхід ═══════════════ */

/* store — 'google' | 'apple'; proof — те, що дав магазин телефону:
   purchaseToken у Google, transactionId в Apple. */
async function verify({store, proof}){
  if (store === 'google') return checkGoogle({token: proof});
  if (store === 'apple') return checkApple({transactionId: proof});
  return {ok: false, why: 'unknown_store'};
}

const ready = () => ({google: !!googleSA(), apple: !!appleKey()});

module.exports = {verify, ready, PRODUCTS, PACKAGE, BUNDLE};
