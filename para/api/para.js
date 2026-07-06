// Serverless-функция (Vercel) — бэкенд PARA: настоящая связь пары и «Вопрос дня».
//
// Идентификация пользователя — по подписи Telegram initData (проверяем HMAC
// токеном бота), поэтому подделать чужой tg_id нельзя. Доступ к базе — только
// отсюда, service-role ключом (в браузер не попадает).
//
// Действия (POST { action, initData, ... }):
//   state        → состояние пары + сегодняшний вопрос и (с разблокировкой) ответы
//   pair_create  → создать пару, вернуть код-приглашение
//   pair_join {code} → присоединиться к паре по коду
//   answer {text} → сохранить свой ответ на вопрос дня; партнёру уходит пуш
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   PARA_SUPABASE_URL              — URL отдельного проекта Supabase для PARA
//   PARA_SUPABASE_SERVICE_ROLE_KEY — service_role ключ этого проекта (секрет!)
//   PARA_BOT_TOKEN                 — токен Telegram-бота PARA (от @BotFather)
// (для удобства читаются и без префикса PARA_, если отдельные не заданы)
//
// Если ключи не заданы — возвращаем reason:"not_configured", а para.html
// мягко откатывается в локальный демо-режим и не ломается.

const crypto = require('crypto');

// ВАЖНО: список должен совпадать с QUESTIONS в para.html (единый источник смысла).
const QUESTIONS = [
  'Какой момент этой недели вдвоём был лучшим?',
  'За что ты благодарен/благодарна мне сегодня?',
  'О чём ты мечтаешь, но ещё не сказал(а) вслух?',
  'Что бы ты хотел(а) сделать вместе в эти выходные?',
  'Какая мелочь во мне тебя радует?'
];
function questionOfDay(day) {
  const epochDay = Math.floor(new Date(day + 'T00:00:00Z').getTime() / 86400000);
  const idx = ((epochDay % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
  return { idx: idx, text: QUESTIONS[idx] };
}
function todayUTC() { return new Date().toISOString().slice(0, 10); }

// ============================================================
//  КОНФИГ УРОВНЕЙ И ДОСТИЖЕНИЙ (data-driven; в Phase 3 → таблица + админка)
// ============================================================
const DEFAULT_CONFIG = {
  levels: [
    { key: 'rookie',    name: 'Новички',           emoji: '🌱', min: 0,    perks: ['Простые домашние квесты'] },
    { key: 'lovers',    name: 'Влюблённые',        emoji: '💕', min: 200,  perks: ['Романтические свидания', 'Совместная готовка', 'Мини-путешествия'] },
    { key: 'perfect',   name: 'Идеальная пара',    emoji: '💍', min: 600,  perks: ['Сложные челленджи', 'Квесты на доверие', 'Совместные цели'] },
    { key: 'soulmates', name: 'Soulmates',         emoji: '🔮', min: 1500, perks: ['Премиальные квесты', 'Особые события', 'Уникальные задания'] },
    { key: 'legend',    name: 'Легендарная пара',  emoji: '👑', min: 3500, perks: ['Самые редкие квесты', 'Ограниченные события', 'Эксклюзивные награды'] }
  ],
  achievements: [
    { key: 'first_quest', icon: '🥇', title: 'Первый квест',      desc: 'Выполнен первый совместный квест',      metric: 'questsDone',  gte: 1 },
    { key: 'streak_7',    icon: '❤️', title: '7 дней подряд',      desc: 'Отвечали на вопрос дня 7 дней подряд',   metric: 'streak',      gte: 7 },
    { key: 'quests_10',   icon: '🎬', title: '10 квестов',         desc: 'Выполнено 10 совместных квестов',        metric: 'questsDone',  gte: 10 },
    { key: 'wishes_20',   icon: '🍕', title: '20 желаний',         desc: 'Исполнено 20 желаний',                   metric: 'wishesDone',  gte: 20 },
    { key: 'streak_30',   icon: '🔥', title: 'Серия 30 дней',      desc: '30 дней активности подряд',              metric: 'streak',      gte: 30 },
    { key: 'soulmates',   icon: '👑', title: 'Soulmates',          desc: 'Достигнут уровень Soulmates',            metric: 'levelIndex',  gte: 3 }
  ],
  // Кастомизация (открывается по уровню = индекс). level — с какого уровня доступно.
  themes: [
    { key: 'rose',   name: 'Розовый рассвет', level: 0, grad: 'linear-gradient(135deg,#ff5e8a,#c026d3)', rose: '#ff5e8a', fuchsia: '#c026d3' },
    { key: 'sunset', name: 'Закат',           level: 1, grad: 'linear-gradient(135deg,#fb7185,#f59e0b)', rose: '#fb7185', fuchsia: '#f59e0b' },
    { key: 'ocean',  name: 'Океан',           level: 1, grad: 'linear-gradient(135deg,#22d3ee,#3b82f6)', rose: '#38bdf8', fuchsia: '#3b82f6' },
    { key: 'aurora', name: 'Сияние',          level: 2, grad: 'linear-gradient(135deg,#34d399,#22d3ee)', rose: '#34d399', fuchsia: '#22d3ee' },
    { key: 'grape',  name: 'Виноград',        level: 3, grad: 'linear-gradient(135deg,#a78bfa,#ec4899)', rose: '#a78bfa', fuchsia: '#ec4899' },
    { key: 'gold',   name: 'Золото',          level: 4, grad: 'linear-gradient(135deg,#fbbf24,#f97316)', rose: '#fbbf24', fuchsia: '#f97316' }
  ],
  frames: [
    { key: 'none',   name: 'Без рамки',     level: 0, css: '' },
    { key: 'glow',   name: 'Свечение 💫',    level: 1, css: 'box-shadow:0 0 0 3px rgba(255,255,255,.12),0 0 34px var(--rose)' },
    { key: 'ring',   name: 'Кольцо 💍',      level: 2, css: 'box-shadow:0 0 0 2px var(--rose),inset 0 0 0 1px rgba(255,255,255,.06)' },
    { key: 'gold',   name: 'Золотая 👑',     level: 3, css: 'box-shadow:0 0 0 2px #fbbf24,0 0 30px rgba(251,191,36,.4)' },
    { key: 'legend', name: 'Легендарная 🔮', level: 4, css: 'box-shadow:0 0 0 3px #a78bfa,0 0 44px rgba(167,139,250,.5)' }
  ]
};
function levelIndexFor(points, levels) {
  let idx = 0;
  for (let i = 0; i < levels.length; i++) if (points >= levels[i].min) idx = i;
  return idx;
}

function env(name) {
  return process.env['PARA_' + name] || process.env[name] || '';
}

// --- проверка подписи Telegram WebApp initData ---
function verifyInitData(initData, botToken) {
  try {
    if (!initData || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dcs = [...params.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (calc !== hash) return null;
    // (необязательно) свежесть подписи — сутки
    const authDate = Number(params.get('auth_date') || 0);
    if (authDate && (Date.now() / 1000 - authDate) > 86400) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return {
      id: Number(user.id),
      name: (user.first_name || '') + (user.last_name ? ' ' + user.last_name : ''),
      photo_url: user.photo_url || null
    };
  } catch (e) { return null; }
}

// проверка подписи Telegram Login Widget (вход в браузерную админку).
// Отличие от initData: секрет = SHA256(bot_token), а не HMAC('WebAppData').
function verifyLoginWidget(auth, botToken) {
  try {
    if (!auth || !auth.hash || !botToken) return null;
    const hash = auth.hash;
    const rest = {};
    Object.keys(auth).forEach((k) => { if (k !== 'hash' && auth[k] != null) rest[k] = auth[k]; });
    const dcs = Object.keys(rest).sort().map((k) => k + '=' + rest[k]).join('\n');
    const secret = crypto.createHash('sha256').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (calc !== hash) return null;
    if (auth.auth_date && (Date.now() / 1000 - Number(auth.auth_date)) > 86400) return null;
    return {
      id: Number(auth.id),
      name: (auth.first_name || '') + (auth.last_name ? ' ' + auth.last_name : ''),
      photo_url: auth.photo_url || null
    };
  } catch (e) { return null; }
}

function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

// Простой rate-limit по tg_id (best-effort, в памяти инстанса). Основная защита —
// подпись initData: без валидного Telegram-аккаунта до сюда не дойти. Это лишь
// глушит частые всплески запросов от одного пользователя.
const RL = new Map();
function rateLimited(id, max, windowMs) {
  max = max || 40; windowMs = windowMs || 60000;
  const now = Date.now();
  const arr = (RL.get(id) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  RL.set(id, arr);
  if (RL.size > 5000) RL.clear(); // страховка от роста памяти
  return arr.length > max;
}

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

    let me = verifyInitData(body.initData, BOT);
    if (!me && body.auth) me = verifyLoginWidget(body.auth, BOT); // вход в браузерную админку
    if (!me) { res.status(401).json({ ok: false, reason: 'bad_auth' }); return; }

    if (rateLimited(me.id)) { res.status(429).json({ ok: false, reason: 'rate_limited' }); return; }

    // Админы: список из ADMIN_TG_IDS + владелец по умолчанию (чтобы не настраивать env).
    const DEFAULT_ADMINS = ['6029995640'];
    const ADMINS = env('ADMIN_TG_IDS').split(',').map((s) => s.trim()).filter(Boolean).concat(DEFAULT_ADMINS);
    const isAdmin = ADMINS.indexOf(String(me.id)) !== -1;

    // ---- helpers к Supabase REST ----
    const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
    async function sbCount(path) {
      const r = await fetch(URL + '/rest/v1/' + path, { headers: Object.assign({}, H, { Prefer: 'count=exact', Range: '0-0' }) });
      const cr = r.headers.get('content-range') || '';
      const m = cr.match(/\/(\d+)$/);
      return m ? Number(m[1]) : 0;
    }
    async function sb(path, opts) {
      const r = await fetch(URL + '/rest/v1/' + path, Object.assign({ headers: H }, opts || {}));
      const t = await r.text();
      let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
      if (!r.ok) throw new Error('db ' + r.status + ' ' + String(t).slice(0, 200));
      return j;
    }
    async function myMembership() {
      // с last_active; если колонка ещё не создана (миграция не выполнена) — откат без неё,
      // чтобы приложение продолжало работать
      let rows;
      try { rows = await sb('para_members?tg_id=eq.' + me.id + '&select=couple_id,tg_id,name,photo_url,slot,last_active'); }
      catch (e) { rows = await sb('para_members?tg_id=eq.' + me.id + '&select=couple_id,tg_id,name,photo_url,slot'); }
      return (rows && rows[0]) || null;
    }
    async function logEvent(type, coupleId, amount) {
      try {
        await sb('para_events', { method: 'POST', body: JSON.stringify({ tg_id: me.id, couple_id: coupleId || null, type: type, amount: amount || 0 }) });
      } catch (e) { /* аналитика не должна ломать основной поток */ }
    }
    async function coupleMembers(coupleId) {
      return await sb('para_members?couple_id=eq.' + coupleId + '&select=tg_id,name,photo_url,slot&order=slot');
    }
    // прогресс пары: общие очки (из событий), уровень, серия, достижения
    async function coupleProgress(coupleId) {
      let ev = [], ans = [];
      try { ev = await sb('para_events?couple_id=eq.' + coupleId + '&select=type,amount,created_at'); } catch (e) {}
      try { ans = await sb('para_answers?couple_id=eq.' + coupleId + '&select=day'); } catch (e) {}
      ev = Array.isArray(ev) ? ev : []; ans = Array.isArray(ans) ? ans : [];
      const points = ev.filter((e) => e.type === 'points').reduce((s, e) => s + (e.amount || 0), 0);
      const questsDone = ev.filter((e) => e.type === 'quest').length;
      const wishesDone = ev.filter((e) => e.type === 'wish').length;
      const answersCount = ans.length;
      const daysSet = {}; ans.forEach((a) => { daysSet[a.day] = 1; });
      let streak = 0;
      for (let i = 0; i < 400; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); if (daysSet[d]) streak++; else break; }
      const levels = DEFAULT_CONFIG.levels;
      const idx = levelIndexFor(points, levels);
      const metrics = { points: points, questsDone: questsDone, wishesDone: wishesDone, answersCount: answersCount, streak: streak, levelIndex: idx };
      // достижения: фиксируем дату получения событием achv_<key>
      const earnedDates = {}; ev.forEach((e) => { if (e.type && e.type.indexOf('achv_') === 0) earnedDates[e.type.slice(5)] = e.created_at; });
      const achievements = DEFAULT_CONFIG.achievements.map((a) => {
        const met = (metrics[a.metric] || 0) >= a.gte;
        let date = earnedDates[a.key] || null;
        if (met && !date) { date = new Date().toISOString(); logEvent('achv_' + a.key, coupleId, 0); }
        return { key: a.key, icon: a.icon, title: a.title, desc: a.desc, earned: met, date: date };
      });
      return {
        points: points, questsDone: questsDone, wishesDone: wishesDone, answersCount: answersCount, streak: streak,
        levelIndex: idx,
        level: { index: idx, key: levels[idx].key, name: levels[idx].name, emoji: levels[idx].emoji, min: levels[idx].min },
        next: idx < levels.length - 1 ? { name: levels[idx + 1].name, emoji: levels[idx + 1].emoji, min: levels[idx + 1].min } : null,
        achievements: achievements
      };
    }
    async function todayState(coupleId) {
      const day = todayUTC();
      const q = questionOfDay(day);
      const ans = await sb('para_answers?couple_id=eq.' + coupleId + '&day=eq.' + day + '&select=tg_id,answer');
      const byId = {};
      (ans || []).forEach((a) => { byId[a.tg_id] = a.answer; });
      const members = await coupleMembers(coupleId);
      const partner = members.find((m) => Number(m.tg_id) !== me.id) || null;
      const myAns = byId[me.id] || null;
      const partnerHas = partner ? !!byId[partner.tg_id] : false;
      const both = !!myAns && partnerHas;
      return {
        day: day,
        question: q.text,
        me: { tg_id: me.id, name: me.name },
        partner: partner ? { name: partner.name } : null,
        myAnswer: myAns,
        // разблокировка: ответ партнёра виден только если я уже ответил
        partnerAnswer: both ? byId[partner.tg_id] : null,
        partnerAnswered: partnerHas,
        bothAnswered: both
      };
    }
    function coupleView(coupleId, code, members) {
      const partner = members.find((m) => Number(m.tg_id) !== me.id) || null;
      return {
        id: coupleId,
        inviteCode: code,
        me: { name: me.name },
        partner: partner ? { name: partner.name } : null,
        linked: members.length >= 2
      };
    }

    const action = body.action;

    // -------- STATS (только для админов из ADMIN_TG_IDS) --------
    if (action === 'stats') {
      if (!isAdmin) { res.status(200).json({ ok: false, reason: 'forbidden', yourId: me.id }); return; }
      const day = todayUTC();
      const couples = await sbCount('para_couples?select=id');
      const members = await sbCount('para_members?select=tg_id');
      const answersToday = await sbCount('para_answers?day=eq.' + day + '&select=tg_id');
      const answersTotal = await sbCount('para_answers?select=tg_id');
      res.status(200).json({ ok: true, stats: { couples: couples, members: members, linked: Math.max(0, members - couples), answersToday: answersToday, answersTotal: answersTotal } });
      return;
    }

    // -------- ADMIN DASHBOARD (только для админов) --------
    if (action === 'admin_dash') {
      if (!isAdmin) { res.status(200).json({ ok: false, reason: 'forbidden', yourId: me.id }); return; }
      const DAY = 86400000;
      const today = todayUTC();
      const ago = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
      const since30 = new Date(Date.now() - 29 * DAY).toISOString();

      const couples = await sb('para_couples?select=id,invite_code,created_at,para_members(name,slot)&order=created_at.desc');
      const membersRows = await sb('para_members?select=tg_id,joined_at');
      const answers = await sb('para_answers?select=day');
      let events; try { events = await sb('para_events?created_at=gte.' + encodeURIComponent(since30) + '&select=type,tg_id,amount,created_at'); } catch (e) { events = []; }
      const cs = Array.isArray(couples) ? couples : [];
      const ms = Array.isArray(membersRows) ? membersRows : [];
      const as = Array.isArray(answers) ? answers : [];
      const ev = Array.isArray(events) ? events : [];
      const memCount = (c) => (c.para_members ? c.para_members.length : 0);
      const d10 = (s) => String(s || '').slice(0, 10);

      const evToday = ev.filter((e) => d10(e.created_at) === today);
      const totals = {
        users: ms.length,
        couples: cs.length,
        active: cs.filter((c) => memCount(c) >= 2).length,
        waiting: cs.filter((c) => memCount(c) === 1).length,
        newToday: ms.filter((m) => d10(m.joined_at) === today).length,
        new7d: ms.filter((m) => d10(m.joined_at) >= ago(6)).length,
        questsToday: evToday.filter((e) => e.type === 'quest').length,
        pointsToday: evToday.filter((e) => e.type === 'points').reduce((s, e) => s + (e.amount || 0), 0),
        answersToday: as.filter((a) => a.day === today).length,
        answersTotal: as.length,
        dau: new Set(evToday.map((e) => e.tg_id)).size
      };

      // серии за 30 дней
      const days = []; for (let i = 29; i >= 0; i--) days.push(ago(i));
      const bucket = (fn) => { const m = {}; days.forEach((d) => m[d] = 0); fn(m); return days.map((d) => ({ date: d, v: m[d] || 0 })); };
      const activeSets = {}; days.forEach((d) => activeSets[d] = new Set());
      ev.forEach((e) => { const d = d10(e.created_at); if (activeSets[d]) activeSets[d].add(e.tg_id); });
      const series = {
        users: bucket((m) => ms.forEach((r) => { const d = d10(r.joined_at); if (d in m) m[d]++; })),
        couples: bucket((m) => cs.forEach((c) => { const d = d10(c.created_at); if (d in m) m[d]++; })),
        answers: bucket((m) => as.forEach((a) => { if (a.day in m) m[a.day]++; })),
        quests: bucket((m) => ev.forEach((e) => { if (e.type === 'quest') { const d = d10(e.created_at); if (d in m) m[d]++; } })),
        activity: days.map((d) => ({ date: d, v: activeSets[d].size }))
      };

      const list = cs.slice(0, 80).map((c) => ({
        code: c.invite_code,
        created: d10(c.created_at),
        members: (c.para_members || []).map((m) => m.name || '—'),
        linked: memCount(c) >= 2
      }));
      res.status(200).json({ ok: true, admin: { name: me.name }, totals: totals, series: series, couples: list });
      return;
    }

    // -------- TRACK (клиентские события для аналитики) --------
    if (action === 'track') {
      const type = String(body.type || '');
      if (['quest', 'points', 'wish'].indexOf(type) === -1) { res.status(200).json({ ok: false, reason: 'bad_type' }); return; }
      const mem = await myMembership();
      await logEvent(type, mem && mem.couple_id, Number(body.amount) || 0);
      res.status(200).json({ ok: true });
      return;
    }

    // -------- STATE --------
    if (action === 'state') {
      const mem = await myMembership();
      if (!mem) { res.status(200).json({ ok: true, couple: null }); return; }
      // отметка активности (для DAU и графика активности) — раз в день на пользователя
      const dNow = todayUTC();
      if (!mem.last_active || String(mem.last_active).slice(0, 10) !== dNow) {
        try { await sb('para_members?tg_id=eq.' + me.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ last_active: new Date().toISOString() }) }); } catch (e) {}
        await logEvent('active', mem.couple_id, 0);
      }
      const members = await coupleMembers(mem.couple_id);
      const cRows = await sb('para_couples?id=eq.' + mem.couple_id + '&select=invite_code');
      const code = (cRows && cRows[0] && cRows[0].invite_code) || null;
      const today = await todayState(mem.couple_id);
      const progress = await coupleProgress(mem.couple_id);
      res.status(200).json({ ok: true, couple: coupleView(mem.couple_id, code, members), today: today, progress: progress, config: DEFAULT_CONFIG });
      return;
    }

    // -------- PAIR CREATE --------
    if (action === 'pair_create') {
      const existing = await myMembership();
      if (existing) { // уже в паре — просто вернём её
        const members = await coupleMembers(existing.couple_id);
        const cRows = await sb('para_couples?id=eq.' + existing.couple_id + '&select=invite_code');
        res.status(200).json({ ok: true, couple: coupleView(existing.couple_id, cRows[0] && cRows[0].invite_code, members) });
        return;
      }
      // создать пару с уникальным кодом (пара попыток на случай коллизии)
      let couple = null;
      for (let i = 0; i < 5 && !couple; i++) {
        try {
          const rows = await sb('para_couples', {
            method: 'POST',
            headers: Object.assign({}, H, { Prefer: 'return=representation' }),
            body: JSON.stringify({ invite_code: makeCode() })
          });
          couple = rows && rows[0];
        } catch (e) { if (String(e).indexOf('409') === -1) throw e; }
      }
      if (!couple) { res.status(200).json({ ok: false, reason: 'code_collision' }); return; }
      await sb('para_members', {
        method: 'POST',
        body: JSON.stringify({ couple_id: couple.id, tg_id: me.id, name: me.name, photo_url: me.photo_url, slot: 'a' })
      });
      const members = await coupleMembers(couple.id);
      res.status(200).json({ ok: true, couple: coupleView(couple.id, couple.invite_code, members) });
      return;
    }

    // -------- PAIR JOIN --------
    if (action === 'pair_join') {
      const code = String(body.code || '').toUpperCase().trim();
      if (code.length < 4) { res.status(200).json({ ok: false, reason: 'bad_code' }); return; }
      const existing = await myMembership();
      if (existing) { res.status(200).json({ ok: false, reason: 'already_paired' }); return; }
      const cRows = await sb('para_couples?invite_code=eq.' + encodeURIComponent(code) + '&select=id,invite_code');
      const couple = cRows && cRows[0];
      if (!couple) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      const members = await coupleMembers(couple.id);
      if (members.length >= 2) { res.status(200).json({ ok: false, reason: 'couple_full' }); return; }
      await sb('para_members', {
        method: 'POST',
        body: JSON.stringify({ couple_id: couple.id, tg_id: me.id, name: me.name, photo_url: me.photo_url, slot: 'b' })
      });
      // уведомим первого партнёра, что пара собралась
      const first = members[0];
      if (first) sendPush(BOT, first.tg_id, '💞 ' + me.name + ' присоединился(ась) к вашей паре в PARA!').catch(() => {});
      const all = await coupleMembers(couple.id);
      res.status(200).json({ ok: true, couple: coupleView(couple.id, couple.invite_code, all) });
      return;
    }

    // -------- ANSWER --------
    if (action === 'answer') {
      const text = String(body.text || '').trim();
      if (!text) { res.status(200).json({ ok: false, reason: 'empty' }); return; }
      const mem = await myMembership();
      if (!mem) { res.status(200).json({ ok: false, reason: 'no_couple' }); return; }
      const day = todayUTC();
      // был ли уже мой ответ (чтобы не слать повторный пуш)
      const prev = await sb('para_answers?couple_id=eq.' + mem.couple_id + '&day=eq.' + day + '&tg_id=eq.' + me.id + '&select=tg_id');
      const firstTime = !(prev && prev.length);
      await sb('para_answers?on_conflict=couple_id,day,tg_id', {
        method: 'POST',
        headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify({ couple_id: mem.couple_id, day: day, tg_id: me.id, answer: text })
      });
      // пуш партнёру: «ответь, чтобы открыть» — только если он ещё не отвечал
      if (firstTime) {
        const members = await coupleMembers(mem.couple_id);
        const partner = members.find((m) => Number(m.tg_id) !== me.id);
        if (partner) {
          const pAns = await sb('para_answers?couple_id=eq.' + mem.couple_id + '&day=eq.' + day + '&tg_id=eq.' + partner.tg_id + '&select=tg_id');
          if (!(pAns && pAns.length)) {
            sendPush(BOT, partner.tg_id, '💬 ' + me.name + ' ответил(а) на вопрос дня. Ответь и ты — и увидишь ответ друг друга 💞').catch(() => {});
          }
        }
      }
      const today = await todayState(mem.couple_id);
      res.status(200).json({ ok: true, today: today });
      return;
    }

    res.status(400).json({ ok: false, reason: 'unknown_action' });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'error', error: String(e && e.message).slice(0, 300) });
  }
};

// экспорт для юнит-тестов (на Vercel не мешает — это свойство функции-обработчика)
module.exports._verifyInitData = verifyInitData;
module.exports._questionOfDay = questionOfDay;

async function sendPush(botToken, chatId, text) {
  return fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}
