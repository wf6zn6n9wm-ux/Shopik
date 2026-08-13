/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · спільне для серверної частини

   Тут живуть три речі: підпис LiqPay, сховище ліцензій і самі правила
   ліцензії. Функції в api/ лише приймають запити й кличуть це.

   Змінні оточення (Vercel → Settings → Environment Variables):
     LIQPAY_PUBLIC_KEY    публічний ключ мерчанта
     LIQPAY_PRIVATE_KEY   приватний ключ — ніколи не потрапляє в браузер
     PUBLIC_BASE_URL      https://pro-trainer.pro
   ────────────────────────────────────────────────────────────────── */
const crypto = require('crypto');

const ENV = {
  pub: process.env.LIQPAY_PUBLIC_KEY || '',
  priv: process.env.LIQPAY_PRIVATE_KEY || '',
  base: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
};
const configured = () => !!(ENV.pub && ENV.priv);

/* ─────────── тарифи ───────────
   Ціни мають збігатися з PLANS у index.html (поле web). LiqPay уміє
   регулярні списання лише з періодом «місяць» або «рік», тому план на
   3 місяці продається разовим платежем — і на сторінці оплати про це
   написано прямо, а не дрібним шрифтом. */
const PLANS = {
  monthly:   {id: 'monthly',   months: 1,  usd: 4.49,  period: 'month'},
  quarterly: {id: 'quarterly', months: 3,  usd: 11.99, period: null},
  yearly:    {id: 'yearly',    months: 12, usd: 48.99, period: 'year'},
};
const DEVICES = 3;                 /* стільки ж, скільки WEB.devices у застосунку */
const GRACE_DAYS = 3;              /* запас на випадок, якщо банк спише з затримкою */

/* ─────────── підпис LiqPay ───────────
   signature = base64( sha1( private_key + data + private_key ) )      */
const sign = data =>
  crypto.createHash('sha1').update(ENV.priv + data + ENV.priv).digest('base64');
const pack = obj => Buffer.from(JSON.stringify(obj)).toString('base64');
const unpack = data => JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
const verify = (data, signature) => {
  const mine = Buffer.from(sign(data));
  const theirs = Buffer.from(String(signature || ''));
  return mine.length === theirs.length && crypto.timingSafeEqual(mine, theirs);
};

/* ─────────── сховище ───────────
   Vercel KV, якщо підключений. Без нього — пам'ять процесу: цього
   вистачає, щоб прокликати сценарій локально, але між запусками
   функції дані не переживуть. Для продакшену KV обов'язковий.        */
let mem = new Map();
let kvPromise = null;
async function kv(){
  if (!process.env.KV_REST_API_URL) return null;
  if (!kvPromise) kvPromise = import('@vercel/kv').then(m => m.kv).catch(() => null);
  return kvPromise;
}
async function get(key){
  const k = await kv();
  if (k) return (await k.get(key)) || null;
  return mem.get(key) || null;
}
async function set(key, value){
  const k = await kv();
  if (k) return void (await k.set(key, value));
  mem.set(key, value);
}

/* ─────────── ліцензія ───────────
   Ключ — нормалізований логін (той самий, що в застосунку: пошта в
   нижньому регістрі або телефон у цифрах). Пристрої обмежені, інакше
   знання чужої пошти давало б чужу підписку.                         */
const normLogin = raw => {
  const s = String(raw || '').trim();
  if (s.indexOf('@') > 0) return s.toLowerCase();
  const d = s.replace(/\D/g, '');
  return d ? (d.length === 10 && d[0] === '0' ? '38' + d : d) : s.toLowerCase();
};
const keyOf = login => 'lic:' + normLogin(login);

const addMonths = (from, months) => {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);            /* 31 січня + 1 міс = 28/29 лютого */
  return +d;
};

const readLicence = login => get(keyOf(login));
const writeLicence = (login, lic) => set(keyOf(login), lic);

/* публічний вигляд ліцензії — рівно те, що застосунок уміє читати */
function view(lic, device){
  if (!lic) return {ok: true, active: false};
  const known = (lic.devices || []).includes(device);
  const live = lic.expiresAt > Date.now();
  return {
    ok: true,
    active: live && known,
    known,
    plan: lic.plan,
    expiresAt: lic.expiresAt,
    purchasedAt: lic.purchasedAt,
    autoRenew: lic.autoRenew !== false,
    orderId: lic.orderId,
    devices: (lic.devices || []).length,
    limit: DEVICES,
    /* підписка є, але цей пристрій ще не прив'язаний — застосунок
       запропонує «Відновити покупку» */
    needsClaim: live && !known,
  };
}

/* оплата пройшла: продовжуємо строк від більшої з дат — «зараз» або
   «кінець чинного періоду», щоб продовження не з'їдало залишок */
async function applyPayment({login, device, plan, orderId, autoRenew}){
  const p = PLANS[plan];
  if (!p) throw new Error('unknown_plan');
  const old = await readLicence(login);
  const from = Math.max(Date.now(), (old && old.expiresAt) || 0);
  const devices = (old && old.devices) || [];
  if (device && !devices.includes(device) && devices.length < DEVICES) devices.push(device);
  const lic = {
    login: normLogin(login), plan, orderId,
    purchasedAt: (old && old.purchasedAt) || Date.now(),
    paidAt: Date.now(),
    expiresAt: addMonths(from, p.months) + GRACE_DAYS * 86400000,
    autoRenew: autoRenew !== false && !!p.period,
    devices,
  };
  await writeLicence(login, lic);
  return lic;
}

const json = (res, code, body) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  /* застосунок може бути на іншому origin (нативна оболонка) */
  res.setHeader('access-control-allow-origin', '*');
  res.status(code).send(JSON.stringify(body));
};

module.exports = {
  ENV, configured, PLANS, DEVICES,
  store: {get, set},                 /* спільне сховище для інших ендпоінтів */
  sign, pack, unpack, verify,
  normLogin, readLicence, writeLicence, view, applyPayment, addMonths, json,
};
