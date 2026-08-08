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

    // ── таблица лидеров ──────────────────────────────────────────────
    // Настоящая: берём из журнала, а не рисуем ботами.
    if (action === 'top') {
      const p = String(body.period || 'day');
      const вид = p === 'all' ? 'sh_top_all' : p === 'week' ? 'sh_top_week' : 'sh_top_day';
      const rows = await sb(вид + '?select=tg_id,name,photo_url,v&limit=100');
      res.status(200).json({ ok: true, period: p, rows: rows || [] });
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
