/* ──────────────────────────────────────────────────────────────────
   ПРО БАРБЕР · общее для подписки

   Здесь три вещи: подпись LiqPay, хранилище лицензий и сами правила
   лицензии. Функции в api/ только принимают запросы и зовут это.

   Устроено так же, как в PRO Trainer: единственный источник правды о
   деньгах — callback от банка, а приложение лишь спрашивает сервер,
   есть ли живая лицензия на этот логин и это устройство.

   Переменные окружения (Vercel → Settings → Environment Variables):
     BARBER_LIQPAY_PUBLIC_KEY    публичный ключ мерчанта
     BARBER_LIQPAY_PRIVATE_KEY   приватный ключ — в браузер не попадает
     BARBER_PUBLIC_BASE_URL      https://probarber.app
   Без префикса BARBER_ тоже читается: удобно, когда проект один.
   ────────────────────────────────────────────────────────────────── */
const crypto = require('crypto');

const env = name => process.env['BARBER_' + name] || process.env[name] || '';
const ENV = {
  get pub(){ return env('LIQPAY_PUBLIC_KEY'); },
  get priv(){ return env('LIQPAY_PRIVATE_KEY'); },
  get base(){ return env('PUBLIC_BASE_URL').replace(/\/+$/, ''); },
};
const configured = () => !!(ENV.pub && ENV.priv);

/* ─────────── тарифы ───────────
   Цены обязаны совпадать с PLANS в index.html и в pay.html.

   Все планы — разовая оплата, без регулярных списаний: продавец на второй
   группе ФОП, поэтому автосписаний с карты нет вовсе. Кончился оплаченный
   период — барбер платит ещё раз, сам и когда захочет. Из этого следует всё
   остальное: нет autoRenew, нет «отменить подписку», нет отдельной страницы
   управления автопродлением.

   Гривна, а не доллар: доход от нерезидента второй группе не положен, да и
   LiqPay всё равно рассчитывается в гривне.                              */
const PLANS = {
  monthly:   {id: 'monthly',   months: 1,  uah: 299},
  quarterly: {id: 'quarterly', months: 3,  uah: 749},
  yearly:    {id: 'yearly',    months: 12, uah: 1990},
};
const CURRENCY = 'UAH';
const DEVICES = 3;                 /* столько же, сколько WEB.devices в приложении */
const GRACE_DAYS = 3;              /* запас на случай, если банк проведёт платёж с задержкой */

/* ─────────── подпись LiqPay ───────────
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

/* ─────────── хранилище ───────────
   Vercel KV, если подключён. Без него — память процесса: этого хватает,
   чтобы прокликать сценарий локально, но между запусками функции данные
   не переживут. Для продакшена KV обязателен.                          */
let mem = new Map();
let kvPromise = null;

/* Имена переменных зависят от того, под каким префиксом Upstash
   подключили к проекту. Вместо того чтобы угадывать одно, берём первое
   существующее и создаём клиента явно — тогда переименование в панели
   ничего не ломает. */
const first = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; return ''; };
const REST = {
  get url(){ return first('BARBER_KV_REST_API_URL', 'KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'STORAGE_REST_API_URL'); },
  get token(){ return first('BARBER_KV_REST_API_TOKEN', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'STORAGE_REST_API_TOKEN'); },
};
async function kv(){
  if (!REST.url || !REST.token) return null;
  if (!kvPromise) kvPromise = import('@vercel/kv')
    .then(m => m.createClient({url: REST.url, token: REST.token}))
    .catch(() => null);
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

/* ─────────── лицензия ───────────
   Ключ — нормализованный логин (тот же, что в приложении: почта в
   нижнем регистре или телефон цифрами). Устройства ограничены, иначе
   знание чужой почты давало бы чужую подписку.                        */
const normLogin = raw => {
  const s = String(raw || '').trim();
  if (s.indexOf('@') > 0) return s.toLowerCase();
  const d = s.replace(/\D/g, '');
  return d ? (d.length === 10 && d[0] === '0' ? '38' + d : d) : s.toLowerCase();
};
const keyOf = login => 'blic:' + normLogin(login);

const addMonths = (from, months) => {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);            /* 31 января + 1 мес = 28/29 февраля */
  return +d;
};

const readLicence = login => get(keyOf(login));
const writeLicence = (login, lic) => set(keyOf(login), lic);

/* публичный вид лицензии — ровно то, что приложение умеет читать */
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
    orderId: lic.orderId,
    devices: (lic.devices || []).length,
    limit: DEVICES,
    /* доступ оплачен, но это устройство ещё не привязано — приложение
       предложит «Восстановить покупку» */
    needsClaim: live && !known,
  };
}

/* оплата прошла: продлеваем срок от большей из дат — «сейчас» или
   «конец действующего периода», чтобы продление не съедало остаток.
   Заплатить наперёд можно сколько угодно раз — сроки складываются. */
async function applyPayment({login, device, plan, orderId}){
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
    devices,
  };
  await writeLicence(login, lic);
  return lic;
}

const json = (res, code, body) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  /* приложение может быть открыто с другого origin */
  res.setHeader('access-control-allow-origin', '*');
  res.status(code).send(JSON.stringify(body));
};

module.exports = {
  ENV, configured, PLANS, CURRENCY, DEVICES, GRACE_DAYS,
  /* live() — настоящее ли это хранилище, а не память процесса */
  store: {get, set, live: async () => !!(await kv())},
  sign, pack, unpack, verify,
  normLogin, readLicence, writeLicence, view, applyPayment, addMonths, json,
};
