/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · дані для адмінки

   Що тут можна побачити й чому саме це. Ми не збираємо ні дій усередині
   застосунку, ні вмісту бази: копія зашифрована ключем, якого в нас
   немає (поки тренер не лишив увімкненим відновлення — але й тоді ми її
   не відкриваємо). Тому статистика тут — про життя кабінета, а не про
   людину:

     завів кабінет     trial:<login>  — пробний період починається при
                                        реєстрації, це і є «зареєструвався»
     працює            db:<login>     — є копія бази й дата останнього
                                        збереження; кращої ознаки, що
                                        застосунком справді користуються,
                                        у нас немає
     платить           lic:<login>    — тариф, строк, автопродовження
     гроші             pay:log        — журнал списань і повернень

   Вхід за паролем ADMIN_PASS. Це відкрита адреса в інтернеті, тож:
   пароль порівнюється без раннього виходу, а після кількох невдач з
   однієї адреси відповідаємо відмовою незалежно від пароля — інакше
   шість символів підбираються за вечір.

     GET  /api/admin                     зведення
     GET  /api/admin?chat=1               список ниток переписки
     GET  /api/admin?chat=<логін>         одна нитка
     POST /api/admin  {reply, text}       відповісти тренеру
   Скрізь Authorization: Bearer $ADMIN_PASS
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');
const TRIAL = require('../api/trial.js');
const DB = require('../api/db.js');
const CHAT = require('../api/chat.js');

const DAY = 86400000;
const WINDOW = 15 * 60 * 1000;     /* за скільки рахуємо невдалі спроби */
const TRIES = 10;                  /* стільки спроб на адресу */
const SERIES_DAYS = 30;            /* глибина графіка */

const day = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
const gateOf = ip => 'adm:' + ip;

const same = (a, b) => {
  const x = String(a || ''), y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
};

module.exports = async function handler(req, res){
  const pass = process.env.ADMIN_PASS || '';
  /* Без заданого пароля адмінка не працює зовсім. «Поки що без пароля»
     тут означало б відкриту сторінку з поштами тренерів. */
  if (!pass) return L.json(res, 503, {ok: false, error: 'no_pass'});

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'none';
  const gate = await L.store.get(gateOf(ip));
  const now = Date.now();
  const fails = gate && now - gate.at < WINDOW ? gate.n : 0;
  if (fails >= TRIES) return L.json(res, 429, {ok: false, error: 'too_many'});

  const auth = String(req.headers['authorization'] || '');
  if (!same(auth, 'Bearer ' + pass)){
    await L.store.set(gateOf(ip), {n: fails + 1, at: now});
    return L.json(res, 401, {ok: false, error: 'forbidden'});
  }
  if (fails) await L.store.set(gateOf(ip), null);

  /* ─── переписка з тренерами ───
     Живе тут, а не окремою функцією, з двох причин. Перша — слотів на
     викладку рівно дванадцять. Друга важливіша: замок уже стоїть саме
     тут, з перебором і затримкою. Друга двері до тих самих ниток
     означала б другий замок, який рано чи пізно розійдеться з першим. */
  const q = {...(req.query || {}), ...(req.body || {})};

  if (q.reply !== undefined){
    const to = L.normLogin(q.reply);
    const text = String(q.text || '').trim();
    if (!to || !text) return L.json(res, 400, {ok: false, error: 'no_text'});
    if (!(await CHAT.read(to))) return L.json(res, 404, {ok: false, error: 'no_thread'});
    const {msg} = await CHAT.add(to, 's', text);
    return L.json(res, 200, {ok: true, at: msg.at});
  }

  if (q.chat !== undefined){
    const one = L.normLogin(q.chat);
    if (!one || q.chat === '1')
      return L.json(res, 200, {ok: true, threads: (await L.store.get(CHAT.INDEX)) || []});
    const rec = await CHAT.read(one);
    if (!rec) return L.json(res, 404, {ok: false, error: 'no_thread'});
    /* відкрили нитку — вважаємо прочитаною; інакше лічильник
       непрочитаного жив би своїм життям */
    rec.seenS = Date.now();
    await CHAT.save(rec);
    return L.json(res, 200, {ok: true, login: rec.login, lang: rec.lang, msgs: rec.msgs});
  }

  const storage = (await L.store.live()) ? 'kv' : 'memory';
  const keys = await L.store.keys('trial:*');

  const people = [];
  for (const key of keys){
    const login = key.slice('trial:'.length);
    const t = (await L.store.get(key)) || {};
    const box = await L.store.get(DB.keyOf(login));
    const lic = await L.readLicence(login);
    const endsAt = t.startedAt ? t.startedAt + TRIAL.TRIAL_DAYS * DAY : 0;
    const live = !!(lic && lic.expiresAt > now);
    people.push({
      login,
      since: day(t.startedAt),
      startedAt: t.startedAt || 0,
      lang: t.lang || '',
      /* остання ознака життя: коли востаннє змінювалась база */
      seenAt: (box && box.savedAt) || 0,
      seen: day(box && box.savedAt),
      size: (box && box.size) || 0,
      works: !!box,
      trial: !!(endsAt > now),
      trialEnds: day(endsAt),
      paid: live && !(lic && lic.granted),
      granted: live && !!(lic && lic.granted),
      plan: (lic && lic.plan) || '',
      until: lic ? day(lic.expiresAt) : '',
      renews: !!(lic && lic.autoRenew),
      devices: (lic && (lic.devices || []).length) || 0,
    });
  }
  people.sort((a, b) => b.startedAt - a.startedAt);

  /* реєстрації по днях — рівно стільки днів, скільки показує графік */
  const series = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--){
    const d = day(now - i * DAY);
    series.push({day: d, joined: people.filter(p => p.since === d).length});
  }

  const fresh = ms => people.filter(p => p.seenAt && now - p.seenAt < ms).length;
  /* Лійка: скільки дійшло до кожного наступного кроку. Рахуємо тільки
     тих, у кого пробний уже скінчився, — інакше «не купив» означало б
     «ще не встиг», і цифра брехала б щодня. */
  const done = people.filter(p => !p.trial);
  const count = {
    all: people.length,
    works: people.filter(p => p.works).length,
    trial: people.filter(p => p.trial).length,
    paid: people.filter(p => p.paid).length,
    granted: people.filter(p => p.granted).length,
    today: fresh(DAY), week: fresh(7 * DAY), month: fresh(30 * DAY),
    /* хто завів кабінет і жодного разу нічого не зберіг */
    idle: people.filter(p => !p.works).length,
  };
  const funnel = {
    joined: people.length,
    works: count.works,
    finished: done.length,
    bought: done.filter(p => p.paid).length,
  };

  /* ─── продажі ───
     Рахуємо з журналу списань, а не з ліцензій: ліцензія зберігає лише
     поточний стан і затирає попередні списання, тож «скільки прийшло за
     серпень» по ній не порахувати взагалі.

     Повернення — окремим числом і зі знаком мінус у виручці. Ховати їх
     усередині підсумку означало б бачити гарнішу картину, ніж є.

     Видані вручну підписки сюди не потрапляють: за ними немає грошей, і
     мішати їх із виручкою — обманювати себе. Їх видно окремо, у
     верхньому рядку.                                                   */
  const pays = await L.readPayments();
  const since30 = now - 30 * DAY;
  const sum = (rows, f) => +rows.reduce((s, x) => s + f(x), 0).toFixed(2);
  const usd = rows => sum(rows, x => x.usd);
  const paid = pays.filter(p => p.kind !== 'back');
  const back = pays.filter(p => p.kind === 'back');

  /* по місяцях — від найновішого */
  const months = {};
  pays.forEach(p => {
    const k = new Date(p.ts).toISOString().slice(0, 7);
    (months[k] = months[k] || []).push(p);
  });
  const byMonth = Object.keys(months).sort().reverse().map(k => ({
    month: k,
    pays: months[k].filter(x => x.kind !== 'back').length,
    backs: months[k].filter(x => x.kind === 'back').length,
    usd: usd(months[k]),
    payers: new Set(months[k].filter(x => x.kind !== 'back').map(x => x.login)).size,
  }));

  /* по днях — лише ті, коли щось було: порожні рядки нічого не кажуть */
  const days = {};
  pays.forEach(p => {
    const k = day(p.ts);
    (days[k] = days[k] || []).push(p);
  });
  const byDay = Object.keys(days).sort().reverse().slice(0, 60).map(k => ({
    day: k,
    pays: days[k].filter(x => x.kind !== 'back').length,
    backs: days[k].filter(x => x.kind === 'back').length,
    usd: usd(days[k]),
  }));

  /* по тарифах — видно, що саме купують */
  const byPlan = Object.keys(L.PLANS).map(id => {
    const rows = paid.filter(x => x.plan === id);
    return {plan: id, months: L.PLANS[id].months, price: L.PLANS[id].usd, pays: rows.length, usd: usd(rows)};
  }).filter(x => x.pays);

  const money = {
    usd30: usd(pays.filter(p => p.ts >= since30)),
    usdAll: usd(pays),
    /* скільки прийде наступного місяця, якщо ніхто не відпишеться */
    mrr: +people.filter(p => p.paid && p.renews)
                .reduce((s, p) => s + ((L.PLANS[p.plan] || {}).usd || 0) / ((L.PLANS[p.plan] || {}).months || 1), 0)
                .toFixed(2),
    pays: paid.length,
    backs: back.length,
    backUsd: usd(back),
    payers: new Set(paid.map(p => p.login)).size,
    avg: paid.length ? +(usd(paid) / paid.length).toFixed(2) : 0,
    /* з якого дня журнал взагалі щось знає — без цього нуль за липень
       читався б як «не продавали», а не як «ще не рахували» */
    since: pays.length ? day(pays[0].ts) : '',
    byMonth, byDay, byPlan,
    last: pays.slice(-40).reverse(),
  };

  const langs = {};
  people.forEach(p => { if (p.lang) langs[p.lang] = (langs[p.lang] || 0) + 1; });

  /* Чи взагалі можна зараз заплатити. Без цього нуль у продажах читався
     б як «ніхто не купує», хоча кнопка оплати може бути просто не
     підключена — і винен не тренер, а налаштування. */
  /* скільки листів чекає відповіді — щоб про них було видно з головної */
  const threads = (await L.store.get(CHAT.INDEX)) || [];
  const chat = {threads: threads.length,
                unread: threads.reduce((s, t) => s + (t.unread || 0), 0)};

  return L.json(res, 200, {ok: true, storage, now, count, funnel, series, langs, money, people, chat,
                           pay: L.configured(), trialDays: TRIAL.TRIAL_DAYS});
};

module.exports.TRIES = TRIES;
module.exports.gateOf = gateOf;
