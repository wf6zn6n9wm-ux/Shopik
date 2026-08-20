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
  monthly:   {id: 'monthly',   months: 1,  uah: 299,  period: 'month'},
  quarterly: {id: 'quarterly', months: 3,  uah: 749,  period: null},
  yearly:    {id: 'yearly',    months: 12, uah: 1990, period: 'year'},
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

/* Ім'я змінних залежить від того, під яким префіксом Upstash під'єднали
   до проєкту. Замість того щоб вгадувати одне, беремо перше, що є, і
   створюємо клієнта явно — тоді перейменування в панелі нічого не ламає. */
const first = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; return ''; };
const REST = {
  url: first('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'STORAGE_REST_API_URL', 'REDIS_REST_API_URL'),
  token: first('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'STORAGE_REST_API_TOKEN', 'REDIS_REST_API_TOKEN'),
};
async function kv(){
  /* Сховища не налаштовано зовсім — це не збій, а робота локально: там
     пам'яті процесу достатньо, щоб прокликати сценарій. */
  if (!REST.url || !REST.token) return null;
  if (!kvPromise) kvPromise = import('@vercel/kv')
    .then(m => m.createClient({url: REST.url, token: REST.token}))
    .catch(() => null);
  const client = await kvPromise;
  /* Невдачу не запам'ятовуємо. Інакше один зірваний імпорт залишав би
     цей екземпляр функції без сховища до кінця життя — і записи тихо
     йшли б у пам'ять, звідки зникали б при наступному запуску. */
  if (!client){ kvPromise = null; throw new Error('kv_unavailable'); }
  return client;
}
/* ─── «не змогли прочитати» не дорівнює «такого немає» ───
   Раніше на зірваному підключенні читання мовчки йшло в порожню пам'ять
   і відповідало «запису немає». Тренер, у якого кабінет є, бачив на
   вході «такого кабінету немає» — найстрашніше, що можна сказати
   людині, чия база лежить у нас. Другий дотик спрацьовував: інший
   екземпляр функції, підключення вже живе.

   Тим самим шляхом губився б і платіж: LiqPay повідомляє про оплату,
   ліцензія лягає в пам'ять процесу, ми відповідаємо «прийнято» — гроші
   списані, підписки немає, і повторити банк уже не спробує.

   Тепер зірване підключення — це помилка. Сторінка чесно скаже «немає
   зв'язку», а банк надішле повідомлення про оплату ще раз. */
async function get(key){
  const k = await kv();
  if (k) return (await k.get(key)) || null;
  return mem.get(key) || null;
}
/* ttl — скільки секунд запису жити. Потрібен там, де ми зберігаємо не
   дані тренера, а тимчасове: знімок екрана, доданий до питання в
   підтримку. Такий знімок цінний тиждень, а лежати може роками — і
   росте сховище, за яке платимо, заради того, чого ніхто вже не
   відкриє. У пам'яті (локально, без сховища) строк не рахуємо: процес
   і так живе одну команду. */
async function set(key, value, ttl){
  const k = await kv();
  if (k) return void (await (ttl ? k.set(key, value, {ex: Math.round(ttl)}) : k.set(key, value)));
  mem.set(key, value);
}
/* Перелічити ключі за взірцем.

   Redis не любить KEYS на живій базі: вона однією командою перебирає все
   й на цей час стає нікому не доступною. SCAN ходить порціями й нікого
   не тримає — тому тут він, з курсором, а не одне зручне слово.

   Обмеження зверху обов'язкове: без нього помилка у взірці перетворилась
   би на нескінченний цикл усередині функції. */
async function keys(pattern, limit = 5000){
  const k = await kv();
  if (!k) return [...mem.keys()].filter(x => x.startsWith(pattern.replace(/\*$/, '')));
  const out = [];
  let cursor = 0;
  do {
    const [next, batch] = await k.scan(cursor, {match: pattern, count: 200});
    out.push(...batch);
    cursor = Number(next);
  } while (cursor && out.length < limit);
  return out.slice(0, limit);
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

/* ─────────── журнал оплат ───────────
   Ліцензія зберігає тільки поточний стан: коли підписка закінчується й
   чи продовжується сама. Скільки грошей прийшло за місяць, по ній не
   порахувати — попередні списання вона затирає. Тому кожен платіж
   лишає рядок тут.

   Це наш власний фінансовий облік, а не спостереження за тренером:
   логін, тариф, сума, дата. Нічого про те, що людина робить у
   застосунку, — ми цього не збираємо.

   Ліміт обов'язковий: без нього один запис ріс би нескінченно, а читаємо
   ми його цілком.                                                     */
const PAY_LOG = 'pay:log';
const PAY_KEEP = 2000;
async function logPayment({login, plan, orderId, kind}){
  const p = PLANS[plan];
  const row = {ts: Date.now(), login: normLogin(login), plan, orderId: String(orderId || ''),
               uah: p ? (kind === 'back' ? -p.uah : p.uah) : 0, kind: kind || 'pay'};
  const log = (await get(PAY_LOG)) || [];
  log.push(row);
  await set(PAY_LOG, log.slice(-PAY_KEEP));
  return row;
}
const readPayments = async () => (await get(PAY_LOG)) || [];

/* ─── запит-розвідник перед POST ───
   Нативна оболонка живе на іншому origin (capacitor://localhost), і перед
   кожним POST із JSON браузер надсилає окремий запит OPTIONS: чи можна.
   Відповіді на нього не було. Дозволений origin ми ставили, а дозволені
   метод і заголовок content-type — ні, тож розвідник не проходив, і з
   застосунку мовчки не працювало все, що пише: копія бази на сервер,
   зміна пароля після відновлення й лист у підтримку. Виглядало це як
   «немає зв'язку» — і шукали ми не там. Читання працювало завжди, бо
   простий GET розвідника не потребує; тому збій було так важко впіймати. */
const preflight = (req, res) => {
  if (String(req.method || 'GET').toUpperCase() !== 'OPTIONS') return false;
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-max-age', '86400');
  res.status(204).send('');
  return true;
};

/* ─── оплата тимчасово не приймається ───
   Мерчант не активований, і заплатити людина фізично не може. Вимкнути
   їй за це роботу — означає втратити її назавжди: вона не винна, а
   доступу до власної бази клієнтів позбудеться. Тому поки оплати немає,
   пробний період не закінчується.

   Прапорець навмисно навпаки: пауза стоїть за замовчуванням, а знімає
   її змінна PAY_LIVE=1. Так безпечніше. Забути ввімкнути прапорець
   означало б замкнути тридцятьох тренерів у той самий день; забути
   зняти — означає кілька зайвих безкоштовних днів, і це видно в
   адмінці, бо гроші не приходять.

   Коли оплату вмикають, люди не мають прокинутись відрізаними: мить
   зняття паузи запам'ятовується, і від неї рахується запас у GRACE днів
   на те, щоб заплатити. */
const PAY_GRACE_DAYS = 7;
const PAUSE_KEY = 'pay:pause';

async function payPause(){
  const live = String(process.env.PAY_LIVE || '') === '1';
  const rec = (await get(PAUSE_KEY)) || null;
  if (!live){
    if (!rec || !rec.on) await set(PAUSE_KEY, {on: true, since: Date.now()});
    return {on: true, graceDays: PAY_GRACE_DAYS};
  }
  /* Паузу зняли. Мить фіксуємо один раз — інакше запас відсувався б із
     кожним запитом і не скінчився б ніколи. */
  if (!rec || rec.on){
    const liftedAt = Date.now();
    await set(PAUSE_KEY, {on: false, liftedAt});
    return {on: false, graceUntil: liftedAt + PAY_GRACE_DAYS * 86400000};
  }
  return {on: false, graceUntil: (rec.liftedAt || 0) + PAY_GRACE_DAYS * 86400000};
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
  /* live() — чи це справжнє сховище, а не пам'ять процесу */
  store: {get, set, keys, live: async () => !!(await kv())},
  sign, pack, unpack, verify,
  normLogin, readLicence, writeLicence, view, applyPayment, addMonths, json, preflight,
  payPause, PAY_GRACE_DAYS,
  logPayment, readPayments, PAY_LOG,
};
