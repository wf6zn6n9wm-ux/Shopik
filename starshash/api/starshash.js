// Serverless-функция (Vercel) — сервер StarsHash.
//
// Зачем она вообще: пока баланс лежит в телефоне, он принадлежит игроку.
// Две строчки в веб-инспекторе Telegram Desktop — и на счету миллион.
// Поэтому деньги живут в базе, а телефон только показывает то, что отдал
// сервер, и просит что-то сделать.
//
// Кто пришёл — определяем по подписи Telegram initData (HMAC токеном
// бота). Подделать чужой tg_id нельзя: подпись не сойдётся. Регистрации
// как таковой нет — человек открывает приложение и уже заведён.
//
// Действия (POST { action, initData, ... }):
//   state              → состояние игрока; заводит нового, начисляет майнинг
//   invest   {amount}  → вложить звёзды в мощность
//   bonus              → забрать ежедневный бонус
//   crash_bet {amount, auto}  → ставка в Краше; точка обрыва остаётся тут
//   crash_settle {x}   → расчёт: забрал на x или не успел
//   case_open {id}     → открыть кейс, приз выбирает сервер
//   pvp      {stake}   → раунд ПВП: соперники и победитель с сервера
//   task     {id}      → закрыть задание; награду называет сервер
//   top      {period}  → таблица лидеров: day | week | all
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   SH_SUPABASE_URL              — URL проекта Supabase под StarsHash
//   SH_SUPABASE_SERVICE_ROLE_KEY — service_role ключ (секрет, в браузер не отдаём)
//   SH_BOT_TOKEN                 — токен бота от @BotFather
//   SH_ADMIN_IDS                 — tg_id админов через запятую (необязательно)
// (читаются и без префикса SH_, если отдельные не заданы)
//
// Пока ключи не заданы — отвечаем not_configured, и приложение работает
// по-старому, из памяти телефона. Так выкладка не ломает то, что уже есть.

const crypto = require('crypto');

function env(k) { return process.env['SH_' + k] || process.env[k] || ''; }

// ── Экономика. Держим здесь же, потому что сервер должен считать сам:
// присланному телефоном числу верить нельзя. Значения обязаны совпадать с
// index.html — расхождение сразу видно игроку как «обсчитали».
const BASE_YIELD = 1.0;
const BOOSTS = [
  { y: 1.2, price: 100 }, { y: 1.4, price: 200 }, { y: 1.6, price: 300 },
  { y: 1.8, price: 1000 }, { y: 2.0, price: 3000 }, { y: 2.3, price: 5000 },
  { y: 2.6, price: 10000 }, { y: 2.8, price: 20000 }, { y: 3.5, price: 50000 },
  { y: 5.0, price: 100000 }
];
function rateFor(v) {
  let y = BASE_YIELD;
  for (const b of BOOSTS) if (v >= b.price) y = b.y;
  return y;
}

// Лесенка ежедневного бонуса: первый день 10 ★, дальше по одной.
const DAILY_FIRST = 10, DAILY_REST = 1, DAILY_LEN = 60;

// Краш. Закон обрыва: target = min(ПОТОЛОК, ДОЛЯ/U), U равномерно на
// (0,1]. Отдача при таком законе постоянная и равна ДОЛЕ, как бы игрок
// ни выбирал момент вывода — на этом и держится честность игры.
const КРАШ = { ДОЛЯ: 0.95, ПОТОЛОК: 25, РОСТ: 0.12 };
// Множитель растёт как 1 + РОСТ·t². Обратная величина нужна, чтобы
// проверить: не просит ли телефон вывод по множителю, до которого время
// ещё не дошло.
const крашX = сек => 1 + КРАШ.РОСТ * сек * сек;
const крашСек = x => Math.sqrt(Math.max(0, x - 1) / КРАШ.РОСТ);

// Кейсы. Значения выписаны явно, а не считаются из цены: они подогнаны
// под границы, обещанные игроку на карточке кейса.
const ШАНСЫ = [18, 22, 24, 25, 9, 2];              // проценты, в сумме 100
const КЕЙСЫ = {
  free:    { price: 0,   drops: [1, 6, 14, 24, 50, 100] },
  spark:   { price: 20,  drops: [1, 6, 14, 24, 50, 100] },
  neon:    { price: 50,  drops: [2, 15, 35, 60, 125, 250] },
  crystal: { price: 100, drops: [5, 30, 70, 120, 250, 500] },
  royal:   { price: 200, drops: [10, 60, 140, 240, 500, 1000] },
  legend:  { price: 500, drops: [25, 150, 350, 600, 1250, 2500] }
};

// ПВП: банк забирает победитель за вычетом комиссии.
const КОМИССИЯ = 0.05;

// Задания. Награду называет сервер: попроси её у телефона — и любой
// напишет себе тысячу за «подписку на канал».
//
// Разовые берутся раз в жизни, ежедневные обнуляются в полночь по
// серверным часам. Проверить настоящую подписку на канал клиент не может
// вовсе — это умеет только бот, и это отдельная работа.
const ЗАДАНИЯ = { sub: 10, invite: 10, topup: 5, boost: 8, kase: 6, crash: 5, pvp: 5, wd: 10 };
const ЗАДАНИЯ_ДНЯ = { d_play: 4, d_case: 4, d_win: 6 };

// Вывод. Заявку рассматривает человек-админ; деньги снимаются сразу и
// висят в удержании, отказ их возвращает. Комиссия одна на оба способа,
// курс — для GRAM. Значения обязаны совпадать с index.html: игрок не
// должен видеть одну сумму, а получать другую.
const ВЫВОД = { MIN: 150, FEE: 0.05, GRAM: 0.01 };
// Разбор суммы вывода: сколько спишется целиком, сколько удержим и что
// дойдёт до получателя. Отдельной функцией — её же сверяет набор
// `withdraw` без базы, как остальную экономику.
function расчётВывода(amount) {
  const сумма = Math.floor(Number(amount) || 0);
  const fee = Math.round(сумма * ВЫВОД.FEE * 1e6) / 1e6;
  const net = Math.round((сумма - fee) * 1e6) / 1e6;
  return { сумма, fee, net };
}

// Доход идёт и при закрытом приложении, но разрыв ограничиваем месяцем:
// на большем окне выигрывает съехавшее системное время, а не игрок.
const OFFLINE_CAP = 30 * 86400;

// ── Подпись Telegram ─────────────────────────────────────────────────
function verifyInitData(initData, botToken) {
  try {
    if (!initData || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dcs = [...params.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([k, v]) => k + '=' + v).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    // сравниваем без ранних выходов: длина одинаковая, утечки по времени нет
    if (calc.length !== hash.length ||
        !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
    // свежесть подписи — сутки: перехваченный initData не живёт вечно
    const authDate = Number(params.get('auth_date') || 0);
    if (authDate && (Date.now() / 1000 - authDate) > 86400) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return {
      id: Number(user.id),
      name: (user.first_name || '') + (user.last_name ? ' ' + user.last_name : ''),
      photo_url: user.photo_url || null,
      lang: (user.language_code || 'ru').slice(0, 2),
      start_param: params.get('start_param') || ''
    };
  } catch (e) { return null; }
}

// Глушилка всплесков от одного игрока. Основная защита — подпись: без
// настоящего аккаунта Telegram сюда не дойти. Живёт в памяти инстанса,
// то есть работает приблизительно — этого достаточно.
const RL = new Map();
function rateLimited(id, max) {
  const now = Date.now(), arr = (RL.get(id) || []).filter(t => now - t < 60000);
  arr.push(now); RL.set(id, arr);
  if (RL.size > 5000) RL.clear();
  return arr.length > (max || 120);
}

const round6 = v => Math.round(Number(v) * 1e6) / 1e6;
const день = d => new Date(d).toISOString().slice(0, 10);

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method' }); return; }

    const URL = env('SUPABASE_URL');
    const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
    const BOT = env('BOT_TOKEN');
    if (!URL || !SERVICE || !BOT) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const me = verifyInitData(body.initData, BOT);
    if (!me) { res.status(401).json({ ok: false, reason: 'bad_auth' }); return; }

    const ADMINS = env('ADMIN_IDS').split(',').map(s => s.trim()).filter(Boolean);
    const isAdmin = ADMINS.indexOf(String(me.id)) !== -1;

    if (rateLimited(me.id, isAdmin ? 400 : 120)) { res.status(429).json({ ok: false, reason: 'rate_limited' }); return; }

    // ── доступ к базе ────────────────────────────────────────────────
    const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
    async function sb(path, opts) {
      const r = await fetch(URL + '/rest/v1/' + path, Object.assign({ headers: H }, opts || {}));
      const t = await r.text();
      let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
      if (!r.ok) throw new Error('db ' + r.status + ' ' + String(t).slice(0, 200));
      return j;
    }
    const один = a => (Array.isArray(a) && a.length) ? a[0] : null;

    // Запись в журнал вместе с новым балансом. Журнал ведём всегда: без
    // него нельзя ни разобрать спор с игроком, ни заметить утечку.
    async function движение(u, kind, amount, meta) {
      await sb('sh_tx', {
        method: 'POST',
        body: JSON.stringify({ tg_id: u.tg_id, kind, amount: round6(amount),
                               bal_after: round6(u.bal), meta: meta || {} })
      });
    }

    async function найтиИлиЗавести() {
      const есть = один(await sb('sh_users?tg_id=eq.' + me.id + '&select=*'));
      if (есть) {
        // имя, фото и язык могли поменяться — подтягиваем без лишней записи
        const патч = {};
        if (есть.name !== me.name) патч.name = me.name;
        if (есть.photo_url !== me.photo_url) патч.photo_url = me.photo_url;
        if (есть.lang !== me.lang) патч.lang = me.lang;
        if (Object.keys(патч).length) {
          await sb('sh_users?tg_id=eq.' + me.id, { method: 'PATCH', body: JSON.stringify(патч) });
          Object.assign(есть, патч);
        }
        return есть;
      }
      const новый = один(await sb('sh_users', {
        method: 'POST',
        headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ tg_id: me.id, name: me.name, photo_url: me.photo_url, lang: me.lang })
      }));
      return новый;
    }

    // Приглашение засчитываем один раз и не самому себе. Метку клиент не
    // передаёт: берём из подписанного initData, иначе её можно было бы
    // подставить любую.
    async function приглашение(u) {
      if (u.ref_by) return;
      const m = /^ref_(\d{1,20})$/.exec(me.start_param || '');
      if (!m) return;
      const кто = Number(m[1]);
      if (!кто || кто === u.tg_id) return;
      const хозяин = один(await sb('sh_users?tg_id=eq.' + кто + '&select=tg_id'));
      if (!хозяин) return;                       // пригласивший ещё не заходил
      await sb('sh_refs', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=ignore-duplicates' }),
                            body: JSON.stringify({ invitee: u.tg_id, inviter: кто }) });
      await sb('sh_users?tg_id=eq.' + u.tg_id, { method: 'PATCH', body: JSON.stringify({ ref_by: кто }) });
      u.ref_by = кто;
    }

    // Майнинг начисляет сервер по своим часам. Телефон не участвует —
    // иначе достаточно перевести время вперёд, чтобы «намайнить» год.
    async function начислить(u) {
      const inv = Number(u.inv);
      const было = new Date(u.accrued_at).getTime();
      const сек = Math.min(OFFLINE_CAP, (Date.now() - было) / 1000);
      if (!(inv > 0) || !(сек > 1)) {
        if (сек > 1) await sb('sh_users?tg_id=eq.' + u.tg_id, {
          method: 'PATCH', body: JSON.stringify({ accrued_at: new Date().toISOString(), seen_at: new Date().toISOString() }) });
        return 0;
      }
      const доход = round6(inv * (rateFor(inv) / 100) / 86400 * сек);
      if (!(доход > 0)) return 0;
      u.bal = round6(Number(u.bal) + доход);
      u.mined = round6(Number(u.mined) + доход);
      const t = new Date().toISOString();
      await sb('sh_users?tg_id=eq.' + u.tg_id, {
        method: 'PATCH', body: JSON.stringify({ bal: u.bal, mined: u.mined, accrued_at: t, seen_at: t }) });
      await движение(u, 'mine', доход, { sec: Math.round(сек) });
      u.accrued_at = t; u.seen_at = t;
      return доход;
    }

    function наружу(u, extra) {
      return Object.assign({
        ok: true,
        admin: isAdmin,
        me: { id: u.tg_id, name: u.name, photo: u.photo_url, lang: u.lang },
        bal: Number(u.bal), inv: Number(u.inv), mined: Number(u.mined),
        rate: rateFor(Number(u.inv)),
        ref: { by: u.ref_by ? String(u.ref_by) : '', earned: Number(u.ref_earned) },
        bonus: { streak: u.streak, day: u.bonus_day },
        tasks: u.tasks || {}, daily: u.daily || {},
        stats: { plays: u.plays, wins: u.wins, wagered: Number(u.wagered),
                 won: Number(u.won), best_win: Number(u.best_win), best_x: Number(u.best_x) }
      }, extra || {});
    }

    const action = String(body.action || 'state');
    const u = await найтиИлиЗавести();
    if (!u) { res.status(500).json({ ok: false, reason: 'no_user' }); return; }
    if (u.banned) { res.status(200).json({ ok: false, reason: 'banned' }); return; }

    // ── состояние ────────────────────────────────────────────────────
    if (action === 'state') {
      await приглашение(u);
      const доход = await начислить(u);
      const рефов = await sb('sh_refs?inviter=eq.' + u.tg_id + '&select=invitee');
      res.status(200).json(наружу(u, { mined_away: доход, ref_n: (рефов || []).length }));
      return;
    }

    // ── вложить в мощность ───────────────────────────────────────────
    // Вложенное обратно не достаётся — так задумано в игре, поэтому
    // отдельного «забрать» нет и на сервере.
    if (action === 'invest') {
      await начислить(u);
      const сумма = round6(Number(body.amount) || 0);
      if (!(сумма > 0)) { res.status(200).json({ ok: false, reason: 'bad_amount' }); return; }
      if (сумма > Number(u.bal)) { res.status(200).json({ ok: false, reason: 'not_enough' }); return; }
      u.bal = round6(Number(u.bal) - сумма);
      u.inv = round6(Number(u.inv) + сумма);
      await sb('sh_users?tg_id=eq.' + u.tg_id, { method: 'PATCH', body: JSON.stringify({ bal: u.bal, inv: u.inv }) });
      await движение(u, 'invest', -сумма, { inv: u.inv });
      res.status(200).json(наружу(u));
      return;
    }

    // ── ежедневный бонус ─────────────────────────────────────────────
    // Дату считает сервер: иначе достаточно перевести часы на телефоне,
    // чтобы забирать бонус хоть каждую минуту.
    if (action === 'bonus') {
      await начислить(u);
      const сегодня = день(Date.now()), вчера = день(Date.now() - 86400000);
      if (u.bonus_day === сегодня) { res.status(200).json({ ok: false, reason: 'already' }); return; }
      // цепочка продолжается, только если брали вчера; иначе начинается заново
      const шаг = (u.bonus_day === вчера) ? Math.min(DAILY_LEN, u.streak + 1) : 1;
      const сумма = шаг === 1 ? DAILY_FIRST : DAILY_REST;
      u.bal = round6(Number(u.bal) + сумма);
      u.streak = шаг; u.bonus_day = сегодня;
      await sb('sh_users?tg_id=eq.' + u.tg_id, {
        method: 'PATCH', body: JSON.stringify({ bal: u.bal, streak: шаг, bonus_day: сегодня }) });
      await движение(u, 'bonus', сумма, { day: шаг });
      res.status(200).json(наружу(u, { got: сумма }));
      return;
    }

    // ── пополнение звёздами Telegram ─────────────────────────────────
    // Здесь только выписывается счёт. Зачисление делает не эта функция и
    // не приложение, а бот, когда Telegram сообщит ему об оплате: слово
    // телефона «я заплатил» не стоит ничего.
    if (action === 'topup') {
      const n = Math.floor(Number(body.amount) || 0);
      if (!(n >= 1 && n <= 100000)) { res.status(200).json({ ok: false, reason: 'bad_amount' }); return; }
      // payload вернётся вместе с оплатой — по нему бот поймёт, кому зачислять
      const payload = JSON.stringify({ v: 1, tg: u.tg_id, n: n });
      try {
        const r = await fetch('https://api.telegram.org/bot' + BOT + '/createInvoiceLink', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'StarsHash: ' + n + ' ★',
            description: 'Пополнение счёта в StarsHash',
            payload: payload,
            currency: 'XTR',                       // Telegram Stars
            provider_token: '',                    // для XTR токен провайдера не нужен
            prices: [{ label: n + ' ★', amount: n }]
          })
        });
        const j = await r.json().catch(() => ({}));
        if (j && j.ok && j.result) { res.status(200).json({ ok: true, link: j.result }); return; }
        res.status(200).json({ ok: false, reason: 'invoice_failed', error: (j && j.description) || '' });
      } catch (e) {
        res.status(200).json({ ok: false, reason: 'invoice_failed', error: String(e && e.message).slice(0, 120) });
      }
      return;
    }

    // ── задание ──────────────────────────────────────────────────────
    // Телефон говорит только, какое задание закрылось. Сколько за него
    // причитается и не забирали ли уже — решает сервер.
    if (action === 'task') {
      await начислить(u);
      const id = String(body.id || '');
      const разовое = ЗАДАНИЯ[id], дневное = ЗАДАНИЯ_ДНЯ[id];
      if (!разовое && !дневное) { res.status(200).json({ ok: false, reason: 'no_task' }); return; }

      const сегодня = день(Date.now());
      const tk = u.tasks || {}, dt = (u.daily && u.daily.d === сегодня) ? u.daily : { d: сегодня };
      if (разовое ? tk[id] : dt[id]) { res.status(200).json({ ok: false, reason: 'already' }); return; }

      const сумма = разовое || дневное;
      u.bal = round6(Number(u.bal) + сумма);
      const патч = { bal: u.bal };
      if (разовое) { tk[id] = 1; u.tasks = tk; патч.tasks = tk; }
      else { dt[id] = 1; u.daily = dt; патч.daily = dt; }
      await sb('sh_users?tg_id=eq.' + u.tg_id, { method: 'PATCH', body: JSON.stringify(патч) });
      await движение(u, 'task', сумма, { id });
      res.status(200).json(наружу(u, { got: сумма }));
      return;
    }

    // ── заявка на вывод ──────────────────────────────────────────────
    // Деньги снимаем сразу и держим в заявке: иначе игрок оставит вывод и
    // тут же проиграет те же звёзды. Отказ админа их вернёт. Настоящую
    // выплату делает человек — сервер лишь ведёт учёт и держит удержание.
    if (action === 'withdraw') {
      await начислить(u);
      const method = String(body.method || 'stars');
      if (method !== 'stars' && method !== 'gram') { res.status(200).json({ ok: false, reason: 'bad_method' }); return; }
      const dest = String(body.dest || '').trim().slice(0, 128);
      if (!dest) { res.status(200).json({ ok: false, reason: 'no_dest' }); return; }
      const { сумма, fee, net } = расчётВывода(body.amount);
      if (!(сумма >= ВЫВОД.MIN)) { res.status(200).json({ ok: false, reason: 'below_min' }); return; }
      if (сумма > Number(u.bal)) { res.status(200).json({ ok: false, reason: 'not_enough' }); return; }
      u.bal = round6(Number(u.bal) - сумма);
      await sb('sh_users?tg_id=eq.' + u.tg_id, { method: 'PATCH', body: JSON.stringify({ bal: u.bal }) });
      await движение(u, 'withdraw', -сумма, { method, dest, fee, net });
      const заявка = один(await sb('sh_withdrawals', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ tg_id: u.tg_id, method, amount: сумма, fee, net, dest })
      }));
      res.status(200).json(наружу(u, { wd: заявка }));
      return;
    }

    // ── история выводов игрока ───────────────────────────────────────
    // Свои заявки со статусом: чтобы человек видел, что вывод в работе, а
    // не пропал. Только свои — чужие сюда не отдаём.
    if (action === 'withdrawals') {
      const rows = await sb('sh_withdrawals?tg_id=eq.' + u.tg_id +
        '&select=id,method,amount,fee,net,dest,status,note,created_at,decided_at&order=created_at.desc&limit=50');
      res.status(200).json({ ok: true, rows: rows || [] });
      return;
    }

    // ── игры ─────────────────────────────────────────────────────────
    // Общая часть: списать ставку, записать исход, обновить статистику.
    async function ставка(u, сумма, вид) {
      if (!(сумма > 0) || сумма > Number(u.bal)) return false;
      u.bal = round6(Number(u.bal) - сумма);
      u.plays += 1;
      u.wagered = round6(Number(u.wagered) + сумма);
      await sb('sh_users?tg_id=eq.' + u.tg_id, { method: 'PATCH',
        body: JSON.stringify({ bal: u.bal, plays: u.plays, wagered: u.wagered }) });
      await движение(u, 'bet', -сумма, { game: вид });
      return true;
    }
    async function выплата(u, сумма, вид, x) {
      const патч = {};
      if (сумма > 0) {
        u.bal = round6(Number(u.bal) + сумма);
        u.won = round6(Number(u.won) + сумма);
        u.wins += 1;
        патч.bal = u.bal; патч.won = u.won; патч.wins = u.wins;
        if (сумма > Number(u.best_win)) { u.best_win = сумма; патч.best_win = сумма; }
      }
      if (x && x > Number(u.best_x)) { u.best_x = x; патч.best_x = x; }
      if (Object.keys(патч).length)
        await sb('sh_users?tg_id=eq.' + u.tg_id, { method: 'PATCH', body: JSON.stringify(патч) });
      if (сумма > 0) await движение(u, 'win', сумма, x ? { game: вид, x } : { game: вид });
    }

    // Краш, ставка. Точка обрыва рождается здесь и наружу не уходит:
    // отдай её телефону — и игрок будет забирать за миг до обрыва всегда.
    if (action === 'crash_bet') {
      await начислить(u);
      const сумма = round6(Number(body.amount) || 0);
      if (!(сумма > 0)) { res.status(200).json({ ok: false, reason: 'bad_amount' }); return; }
      // незакрытый прошлый раунд считаем проигранным: игрок закрыл
      // приложение на взлёте, ставка уже списана, забирать нечего
      await sb('sh_rounds?tg_id=eq.' + u.tg_id, { method: 'DELETE' });
      if (!await ставка(u, сумма, 'crash')) { res.status(200).json({ ok: false, reason: 'not_enough' }); return; }
      let target = Math.min(КРАШ.ПОТОЛОК, КРАШ.ДОЛЯ / Math.max(1e-9, Math.random()));
      target = target < 1 ? 1 : +target.toFixed(2);
      const авто = Number(body.auto) > 1 ? +Number(body.auto).toFixed(2) : null;
      await sb('sh_rounds', { method: 'POST',
        body: JSON.stringify({ tg_id: u.tg_id, bet: сумма, target, auto: авто }) });
      res.status(200).json(наружу(u));
      return;
    }

    // Краш, расчёт. Телефон присылает множитель, на котором нажали. Ему
    // не верим дважды: он не должен превышать ни точку обрыва, ни то,
    // до чего дорос множитель по часам сервера.
    if (action === 'crash_settle') {
      const р = один(await sb('sh_rounds?tg_id=eq.' + u.tg_id + '&select=*'));
      if (!р) { res.status(200).json({ ok: false, reason: 'no_round' }); return; }
      await sb('sh_rounds?tg_id=eq.' + u.tg_id, { method: 'DELETE' });

      const цель = Number(р.target), ставк = Number(р.bet);
      const прошло = (Date.now() - new Date(р.started_at).getTime()) / 1000;
      // полсекунды на дорогу до сервера: без запаса честный вывод у
      // человека с медленной связью засчитывался бы как обрыв
      const потолокПоЧасам = крашX(прошло + 0.5);

      let x = Number(body.x) || 0;
      const авто = р.auto ? Number(р.auto) : 0;
      if (авто && авто <= цель && крашX(прошло) >= авто) x = авто;   // авто-вывод сработал бы сам

      const взял = x >= 1 && x < цель && x <= потолокПоЧасам;
      const выигрыш = взял ? Math.floor(ставк * x) : 0;
      await выплата(u, выигрыш, 'crash', взял ? x : 0);
      res.status(200).json(наружу(u, { busted: !взял, target: цель, x: взял ? x : цель, win: выигрыш }));
      return;
    }

    // Кейс. Приз выбирает сервер по тем же шансам, что написаны на
    // экране до открытия; лента в приложении только показывает результат.
    if (action === 'case_open') {
      await начислить(u);
      const к = КЕЙСЫ[String(body.id || '')];
      if (!к) { res.status(200).json({ ok: false, reason: 'no_case' }); return; }
      if (к.price > 0 && !await ставка(u, к.price, 'kase')) {
        res.status(200).json({ ok: false, reason: 'not_enough' }); return;
      }
      let r = Math.random() * 100, i = ШАНСЫ.length - 1, acc = 0;
      for (let j = 0; j < ШАНСЫ.length; j++) { acc += ШАНСЫ[j]; if (r < acc) { i = j; break; } }
      const приз = к.drops[i];
      await выплата(u, приз, 'kase', к.price ? +(приз / к.price).toFixed(2) : 0);
      res.status(200).json(наружу(u, { slot: i, prize: приз }));
      return;
    }

    // ПВП. Доля в банке равна шансу на победу, поэтому и соперников, и
    // победителя выбирает сервер: оставь это телефону — и «случайность»
    // станет управляемой.
    if (action === 'pvp') {
      await начислить(u);
      const ставк = round6(Number(body.stake) || 0);
      if (!(ставк > 0)) { res.status(200).json({ ok: false, reason: 'bad_amount' }); return; }
      if (!await ставка(u, ставк, 'pvp')) { res.status(200).json({ ok: false, reason: 'not_enough' }); return; }

      // соперники: три-пять, ставки того же порядка, что и у игрока
      const сколько = 3 + Math.floor(Math.random() * 3);
      const соперники = [];
      for (let i = 0; i < сколько; i++) {
        const k = 0.4 + Math.random() * 2.2;
        соперники.push(Math.max(10, Math.round(ставк * k / 5) * 5));
      }
      const банк = соперники.reduce((a, b) => a + b, ставк);
      let r = Math.random() * банк, победитель = -1, acc = ставк;   // -1 — игрок
      if (r >= acc) { for (let i = 0; i < соперники.length; i++) { acc += соперники[i]; if (r < acc) { победитель = i; break; } } }
      const приз = победитель === -1 ? Math.floor(банк * (1 - КОМИССИЯ)) : 0;
      await выплата(u, приз, 'pvp', приз ? +(приз / ставк).toFixed(2) : 0);
      res.status(200).json(наружу(u, { rivals: соперники, winner: победитель, pot: банк, win: приз }));
      return;
    }

    // ── таблица лидеров ──────────────────────────────────────────────
    // Настоящая: берём из журнала, а не рисуем ботами.
    if (action === 'top') {
      const p = String(body.period || 'day');
      const вид = p === 'all' ? 'sh_top_all' : p === 'week' ? 'sh_top_week' : 'sh_top_day';
      const rows = await sb(вид + '?select=tg_id,name,photo_url,v&limit=100');
      res.status(200).json({ ok: true, period: p, rows: rows || [] });
      return;
    }

    // ── админка: заявки на вывод ─────────────────────────────────────
    // Видит только админ (tg_id в SH_ADMIN_IDS). Обычному игроку — отказ,
    // даже если он подберёт имя действия: доступ проверяется по подписи, а
    // не по тому, что прислал клиент.
    if (action === 'admin_withdrawals') {
      if (!isAdmin) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const st = String(body.status || 'pending');
      const флаг = ['pending', 'done', 'rejected'].indexOf(st) !== -1 ? '&status=eq.' + st : '';
      const rows = await sb('sh_withdrawals?select=id,tg_id,method,amount,fee,net,dest,status,note,created_at,decided_at,decided_by' +
        флаг + '&order=created_at.desc&limit=200');
      // имена подтягиваем одним запросом — в списке видно, кому платить
      const имена = {};
      const ids = [...new Set((rows || []).map(r => r.tg_id))];
      if (ids.length) {
        const us = await sb('sh_users?tg_id=in.(' + ids.join(',') + ')&select=tg_id,name');
        (us || []).forEach(x => { имена[x.tg_id] = x.name; });
      }
      (rows || []).forEach(r => { r.name = имена[r.tg_id] || ''; });
      res.status(200).json({ ok: true, status: st, rows: rows || [] });
      return;
    }

    // ── админка: решение по заявке ───────────────────────────────────
    // done — выплачено (баланс уже списан при заявке); reject — возврат
    // суммы на баланс. Только из состояния pending и только один раз:
    // повторное решение ничего не двигает.
    if (action === 'admin_decide') {
      if (!isAdmin) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = Math.floor(Number(body.id) || 0);
      const decision = String(body.decision || '');
      if (!id || (decision !== 'done' && decision !== 'reject')) { res.status(200).json({ ok: false, reason: 'bad_request' }); return; }
      const з = один(await sb('sh_withdrawals?id=eq.' + id + '&select=*'));
      if (!з) { res.status(200).json({ ok: false, reason: 'no_wd' }); return; }
      if (з.status !== 'pending') { res.status(200).json({ ok: false, reason: 'already' }); return; }
      const note = String(body.note || '').trim().slice(0, 200) || null;
      const t = new Date().toISOString();
      if (decision === 'reject') {
        // возвращаем удержанное владельцу заявки — за отклонённую платить нельзя
        const вл = один(await sb('sh_users?tg_id=eq.' + з.tg_id + '&select=bal'));
        if (вл) {
          const бал = round6(Number(вл.bal) + Number(з.amount));
          await sb('sh_users?tg_id=eq.' + з.tg_id, { method: 'PATCH', body: JSON.stringify({ bal: бал }) });
          await sb('sh_tx', { method: 'POST', body: JSON.stringify({
            tg_id: з.tg_id, kind: 'admin', amount: round6(Number(з.amount)), bal_after: бал, meta: { wd: id, refund: true } }) });
        }
      }
      const итог = один(await sb('sh_withdrawals?id=eq.' + id, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ status: decision === 'done' ? 'done' : 'rejected', note, decided_by: me.id, decided_at: t }) }));
      res.status(200).json({ ok: true, wd: итог });
      return;
    }

    res.status(400).json({ ok: false, reason: 'unknown_action' });
  } catch (e) {
    res.status(500).json({ ok: false, reason: 'server', detail: String(e && e.message || e).slice(0, 200) });
  }
};

// Наружу — для проверок: подпись и экономика проверяются без базы и без
// Vercel, а расхождение ставок с index.html ловится сразу.
module.exports.verifyInitData = verifyInitData;
module.exports.rateFor = rateFor;
module.exports.BOOSTS = BOOSTS;
module.exports.BASE_YIELD = BASE_YIELD;
module.exports.DAILY = { first: DAILY_FIRST, rest: DAILY_REST, len: DAILY_LEN };
module.exports.КРАШ = КРАШ;
module.exports.крашX = крашX;
module.exports.крашСек = крашСек;
module.exports.ШАНСЫ = ШАНСЫ;
module.exports.КЕЙСЫ = КЕЙСЫ;
module.exports.КОМИССИЯ = КОМИССИЯ;
module.exports.ЗАДАНИЯ = ЗАДАНИЯ;
module.exports.ЗАДАНИЯ_ДНЯ = ЗАДАНИЯ_ДНЯ;
module.exports.ВЫВОД = ВЫВОД;
module.exports.расчётВывода = расчётВывода;
