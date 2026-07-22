// Serverless-функция (Vercel) — бэкенд SHARK.
//
// Личность пользователя — по подписи Telegram initData (HMAC токеном бота),
// поэтому подделать чужой tg_id нельзя. Доступ к БД — только отсюда, сервисным
// ключом Supabase (в браузер он не попадает).
//
// Главный принцип: ВСЁ, что касается денег (грн) и звёзд, считает сервер.
// Клиент присылает лишь намерение; награды, цены, каталог заданий, исходы игр —
// на сервере. Звёзды НЕ конвертируются в деньги ни одним действием.
//
// Запрос: POST { action, initData, ...params }
// Действия: state | task_claim | daily_case | wheel_spin | game_bet |
//           crash_bet | crash_cashout | buy_gift | buy_pro | withdraw_create |
//           history
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   SHARK_SUPABASE_URL / SUPABASE_URL
//   SHARK_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY   (секрет!)
//   SHARK_BOT_TOKEN / BOT_TOKEN                                   (токен бота)
//   SHARK_ADMIN_IDS         — tg_id админов через запятую (кому слать заявки на вывод)
//
// Если ключи не заданы — возвращаем { ok:false, reason:'not_configured' },
// и index.html мягко откатывается в локальный демо-режим.

const crypto = require('crypto');

function env(name) { return process.env['SHARK_' + name] || process.env[name] || ''; }

// ============================================================
//  Игровой конфиг — единый серверный источник (клиенту не доверяем)
// ============================================================
const ROUL_PRIZES = [
  { emoji: '🫧', name: 'Пузырь',  value: 5,   weight: 30 },
  { emoji: '🌊', name: 'Волна',   value: 10,  weight: 24 },
  { emoji: '🐚', name: 'Ракушка', value: 20,  weight: 18 },
  { emoji: '🐠', name: 'Рыбка',   value: 40,  weight: 12 },
  { emoji: '🪸', name: 'Коралл',  value: 60,  weight: 8  },
  { emoji: '⚓', name: 'Якорь',   value: 90,  weight: 5  },
  { emoji: '🦈', name: 'Акула',   value: 150, weight: 2.5 },
  { emoji: '💎', name: 'Жемчуг',  value: 300, weight: 0.5 }
];
const WHEEL = [5, 50, 10, 100, 20, 250, 15, 500];
const SHOP = [
  { emoji: '🦈', name: 'Shark NFT', value: 500 }, { emoji: '🐚', name: 'Ракушка', value: 331 },
  { emoji: '🪸', name: 'Коралл',   value: 344 }, { emoji: '🌊', name: 'Волна',   value: 360 },
  { emoji: '🐠', name: 'Рыбка',    value: 334 }, { emoji: '⚓', name: 'Якорь',   value: 356 },
  { emoji: '💎', name: 'Жемчуг',   value: 600 }, { emoji: '🔱', name: 'Трезубец', value: 358 }
];
const BET_OPTIONS = [50, 100, 250];
const WITHDRAW_METHODS = ['card_ua', 'usdt_trc20', 'usdt_ton', 'usdt_bep20'];

// множитель краша по времени полёта (в секундах) — совпадает с анимацией клиента
function crashMultAt(dt) { return 1 + 0.6 * dt * dt; }

// ============================================================
//  Утилиты
// ============================================================
function todayUTC() { return new Date().toISOString().slice(0, 10); }
function pickWeighted(list) {
  let total = 0; for (const p of list) total += p.weight;
  let r = Math.random() * total;
  for (const p of list) { r -= p.weight; if (r <= 0) return p; }
  return list[0];
}
function json(res, code, obj) { res.status(code).json(obj); }

// --- проверка подписи Telegram WebApp initData ---
function verifyInitData(initData, botToken) {
  try {
    if (!initData || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dcs = Array.from(params.entries())
      .map(([k, v]) => k + '=' + v).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (calc !== hash) return null;
    // защита от старых initData (переигрывание): не старше суток
    const authDate = Number(params.get('auth_date') || 0);
    if (authDate && (Date.now() / 1000 - authDate) > 86400) return null;
    const userRaw = params.get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    if (!user || !user.id) return null;
    return {
      id: Number(user.id),
      username: user.username || null,
      first_name: user.first_name || null,
      lang: user.language_code === 'uk' ? 'uk' : 'ru',
      start_param: params.get('start_param') || null
    };
  } catch (e) { return null; }
}

// ============================================================
//  Обработчик
// ============================================================
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { json(res, 405, { ok: false }); return; }
    const URL = env('SUPABASE_URL');
    const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
    const BOT = env('BOT_TOKEN');
    if (!URL || !SERVICE || !BOT) { json(res, 200, { ok: false, reason: 'not_configured' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const me = verifyInitData(body.initData, BOT);
    if (!me) { json(res, 200, { ok: false, reason: 'bad_init_data' }); return; }

    const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };

    // --- Supabase REST хелперы ---
    async function sb(path, opts) {
      const r = await fetch(URL + '/rest/v1/' + path, Object.assign({ headers: H }, opts || {}));
      const t = await r.text();
      let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
      return { ok: r.ok, status: r.status, data };
    }
    async function sbGet(path) { const r = await sb(path); return Array.isArray(r.data) ? r.data : []; }
    // RPC: атомарное движение средств; бросает при нехватке
    async function applyLedger(tg, currency, amount, kind, ref, idem, meta) {
      const r = await sb('rpc/shark_apply_ledger', {
        method: 'POST',
        headers: Object.assign({}, H),
        body: JSON.stringify({
          p_tg: tg, p_currency: currency, p_amount: amount, p_kind: kind,
          p_ref: ref || null, p_idem: idem || null, p_meta: meta || {}
        })
      });
      return r; // r.ok=false при нехватке средств (check_violation)
    }

    // --- конфиг ---
    const cfgRows = await sbGet('shark_config?id=eq.1&select=data');
    const CFG = Object.assign({
      usdt_rate: 45, min_withdraw: 100, referral_bonus: 10, referral_share: 0.10,
      pro_price: 99, pro_days: 30, daily_case_stars: 10
    }, (cfgRows[0] && cfgRows[0].data) || {});

    // --- убедиться что пользователь есть (upsert) ---
    async function ensureUser() {
      const rows = await sbGet('shark_users?tg_id=eq.' + me.id + '&select=*');
      if (rows[0]) {
        // обновим ник/имя при изменении
        await sb('shark_users?tg_id=eq.' + me.id, {
          method: 'PATCH',
          headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ username: me.username, first_name: me.first_name, last_seen: new Date().toISOString() })
        });
        return rows[0];
      }
      // новый пользователь: генерим ref_code, привязываем пригласившего из start_param (ref_XXXX)
      const refCode = 'r' + me.id.toString(36) + Math.random().toString(36).slice(2, 6);
      let refBy = null;
      const sp = body.startParam || me.start_param;
      if (sp && /^ref_/.test(sp)) {
        const inviter = sp.slice(4);
        const inv = await sbGet('shark_users?ref_code=eq.' + encodeURIComponent(inviter) + '&select=tg_id');
        if (inv[0] && Number(inv[0].tg_id) !== me.id) refBy = Number(inv[0].tg_id);
      }
      const ins = await sb('shark_users', {
        method: 'POST',
        headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({
          tg_id: me.id, username: me.username, first_name: me.first_name, lang: me.lang,
          ref_code: refCode, ref_by: refBy
        })
      });
      const u = Array.isArray(ins.data) ? ins.data[0] : ins.data;
      if (refBy) {
        await sb('shark_referrals', {
          method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal,resolution=ignore-duplicates' }),
          body: JSON.stringify({ inviter_tg: refBy, invited_tg: me.id })
        });
        // приветственный бонус пригласившему +referral_bonus грн (от «дома», не с юзера)
        await applyLedger(refBy, 'uah', CFG.referral_bonus, 'referral', 'signup:' + me.id, 'ref_signup:' + me.id, { invited: me.id });
        await sb('shark_referrals?inviter_tg=eq.' + refBy + '&invited_tg=eq.' + me.id, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ earned: CFG.referral_bonus })
        });
        tgNotify(BOT, refBy, '👥 Новый друг присоединился по вашей ссылке! +' + CFG.referral_bonus.toFixed(2) + ' грн');
      }
      return u;
    }

    // начислить грн + реферальную долю пригласившему (10% от начисления, от «дома»)
    async function creditMoney(user, amount, kind, ref, idem, meta) {
      const r = await applyLedger(user.tg_id, 'uah', amount, kind, ref, idem, meta || {});
      if (r.ok && user.ref_by) {
        const share = Math.round(amount * CFG.referral_share * 100) / 100;
        if (share > 0) {
          await applyLedger(user.ref_by, 'uah', share, 'referral', ref, (idem ? idem + ':share' : null), { from: user.tg_id });
        }
      }
      return r;
    }

    const user = await ensureUser();
    if (!user) { json(res, 200, { ok: false, reason: 'user_error' }); return; }
    if (user.banned) { json(res, 200, { ok: false, reason: 'banned' }); return; }

    const action = body.action;

    // ---------------------------------------------------------
    //  STATE — всё состояние для отрисовки
    // ---------------------------------------------------------
    if (action === 'state') {
      const tasks = await sbGet('shark_tasks?active=eq.true&order=sort.asc,reward.desc&select=*');
      const claims = await sbGet('shark_task_claims?tg_id=eq.' + me.id + '&select=task_id,status,day');
      const today = todayUTC();
      const claimMap = {};
      claims.forEach((c) => {
        // для daily учитываем только сегодняшние; для once/pro — любые
        if (c.day) { if (c.day === today) claimMap[c.task_id] = c.status; }
        else claimMap[c.task_id] = c.status;
      });
      const refs = await sbGet('shark_referrals?inviter_tg=eq.' + me.id + '&select=invited_tg,earned');
      const refEarned = refs.reduce((a, b) => a + Number(b.earned || 0), 0);

      json(res, 200, {
        ok: true,
        user: publicUser(user),
        config: {
          usdt_rate: CFG.usdt_rate, min_withdraw: CFG.min_withdraw,
          referral_bonus: CFG.referral_bonus, referral_share: CFG.referral_share,
          pro_price: CFG.pro_price, daily_case_stars: CFG.daily_case_stars
        },
        tasks: tasks.map((t) => ({
          id: t.id, type: t.type, title: t.title, desc: t.descr, reward: Number(t.reward),
          verify: t.verify, time: t.time_note || null, status: claimMap[t.id] || null
        })),
        daily: {
          case_ready: user.daily_case_at !== today,
          wheel_ready: user.wheel_at !== today
        },
        referrals: { count: refs.length, earned: refEarned },
        catalog: { roulette: ROUL_PRIZES, wheel: WHEEL, shop: SHOP, bets: BET_OPTIONS, methods: WITHDRAW_METHODS },
        refLink: botLink(BOT, user.ref_code)
      });
      return;
    }

    // ---------------------------------------------------------
    //  TASK_CLAIM — выполнить задание
    // ---------------------------------------------------------
    if (action === 'task_claim') {
      const taskId = Number(body.taskId);
      const trows = await sbGet('shark_tasks?id=eq.' + taskId + '&active=eq.true&select=*');
      const task = trows[0];
      if (!task) { json(res, 200, { ok: false, reason: 'no_task' }); return; }
      if (task.type === 'pro' && !isProActive(user)) { json(res, 200, { ok: false, reason: 'pro_required' }); return; }

      const day = task.type === 'daily' ? todayUTC() : null;
      // уже есть заявка?
      const q = 'shark_task_claims?tg_id=eq.' + me.id + '&task_id=eq.' + taskId +
        (day ? '&day=eq.' + day : '&day=is.null') + '&select=id,status';
      const exist = await sbGet(q);
      if (exist[0]) { json(res, 200, { ok: false, reason: 'already', status: exist[0].status }); return; }

      // авто-проверка подписки на канал
      if (task.verify === 'auto_sub') {
        const okSub = await checkSubscription(BOT, task.target, me.id);
        if (!okSub) { json(res, 200, { ok: false, reason: 'not_subscribed', target: task.target }); return; }
      }

      const status = task.verify === 'manual' ? 'pending' : 'approved';
      const claimIns = await sb('shark_task_claims', {
        method: 'POST',
        headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({
          tg_id: me.id, task_id: taskId, day, status, reward: Number(task.reward),
          proof: (body.proof || '').toString().slice(0, 500) || null,
          decided_at: status === 'approved' ? new Date().toISOString() : null
        })
      });
      if (!claimIns.ok) { json(res, 200, { ok: false, reason: 'claim_conflict' }); return; }
      const claim = Array.isArray(claimIns.data) ? claimIns.data[0] : claimIns.data;

      if (status === 'approved') {
        const idem = 'task:' + taskId + ':' + me.id + (day ? ':' + day : '');
        const r = await creditMoney(user, Number(task.reward), 'task', 'task:' + taskId, idem, { title: task.title });
        if (!r.ok) { json(res, 200, { ok: false, reason: 'credit_failed' }); return; }
        const fresh = await freshUser();
        json(res, 200, { ok: true, status: 'approved', reward: Number(task.reward), user: publicUser(fresh) });
      } else {
        // ручная проверка — уведомить админов
        notifyAdmins(BOT, adminIds(),
          '🕵️ Заявка на задание\n\n' +
          '👤 ' + userLabel(user) + '\n' +
          '📋 ' + task.title + '\n' +
          '💰 +' + Number(task.reward).toFixed(2) + ' грн\n' +
          (body.proof ? '📎 ' + String(body.proof).slice(0, 300) + '\n' : '') +
          '\nПодтвердить: /task_ok ' + claim.id + '   Отклонить: /task_no ' + claim.id,
          taskDecisionKb(claim.id));
        json(res, 200, { ok: true, status: 'pending' });
      }
      return;
    }

    // ---------------------------------------------------------
    //  DAILY_CASE — ежедневный кейс (раз в день)
    // ---------------------------------------------------------
    if (action === 'daily_case') {
      const today = todayUTC();
      if (user.daily_case_at === today) { json(res, 200, { ok: false, reason: 'already_today' }); return; }
      const upd = await sb('shark_users?tg_id=eq.' + me.id + '&daily_case_at=is.null&or=(daily_case_at.neq.' + today + ')', {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ daily_case_at: today })
      });
      // если гонка — строк не вернётся
      if (!Array.isArray(upd.data) || !upd.data.length) { json(res, 200, { ok: false, reason: 'already_today' }); return; }
      const reward = Number(CFG.daily_case_stars);
      await applyLedger(me.id, 'stars', reward, 'daily', 'case:' + today, 'daily_case:' + me.id + ':' + today, {});
      const fresh = await freshUser();
      json(res, 200, { ok: true, reward, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  WHEEL_SPIN — колесо фортуны (раз в день, исход на сервере)
    // ---------------------------------------------------------
    if (action === 'wheel_spin') {
      const today = todayUTC();
      if (user.wheel_at === today) { json(res, 200, { ok: false, reason: 'already_today' }); return; }
      const upd = await sb('shark_users?tg_id=eq.' + me.id + '&or=(wheel_at.is.null,wheel_at.neq.' + today + ')', {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ wheel_at: today })
      });
      if (!Array.isArray(upd.data) || !upd.data.length) { json(res, 200, { ok: false, reason: 'already_today' }); return; }
      const idx = Math.floor(Math.random() * WHEEL.length);
      const reward = WHEEL[idx];
      await applyLedger(me.id, 'stars', reward, 'wheel', 'wheel:' + today, 'wheel:' + me.id + ':' + today, { idx });
      await bumpStats(me.id, { won: reward });
      const fresh = await freshUser();
      json(res, 200, { ok: true, idx, reward, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  GAME_BET — рулетка (единый запрос: списываем ставку, исход на сервере)
    // ---------------------------------------------------------
    if (action === 'game_bet') {
      const game = body.game;
      const bet = Number(body.bet);
      if (!BET_OPTIONS.includes(bet)) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (game !== 'roulette') { json(res, 200, { ok: false, reason: 'bad_game' }); return; }
      if (Number(user.stars_balance) < bet) { json(res, 200, { ok: false, reason: 'no_stars' }); return; }

      // ставка
      const deb = await applyLedger(me.id, 'stars', -bet, 'bet', 'roulette', null, { bet });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_stars' }); return; }

      // исход
      const base = pickWeighted(ROUL_PRIZES);
      const betMult = bet / 50;                       // 50→x1, 100→x2, 250→x5
      const win = Math.round(base.value * betMult);
      await applyLedger(me.id, 'stars', win, 'win', 'roulette', null, { prize: base.name, bet });
      await sb('shark_bets', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ tg_id: me.id, game: 'roulette', bet_stars: bet, payout: win, detail: { prize: base.name, emoji: base.emoji, mult: betMult } })
      });
      await bumpStats(me.id, { played: 1, won: win });
      const fresh = await freshUser();
      json(res, 200, {
        ok: true,
        prize: { emoji: base.emoji, name: base.name, value: win, betMult },
        // индекс приза (для остановки барабана в нужной ячейке на клиенте)
        prizeIndex: ROUL_PRIZES.findIndex((p) => p.name === base.name),
        user: publicUser(fresh)
      });
      return;
    }

    // ---------------------------------------------------------
    //  CRASH_BET — поставить на раунд краша (сервер задаёт точку краша)
    // ---------------------------------------------------------
    if (action === 'crash_bet') {
      const bet = Number(body.bet);
      if (!BET_OPTIONS.includes(bet)) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (Number(user.stars_balance) < bet) { json(res, 200, { ok: false, reason: 'no_stars' }); return; }
      // закрыть возможные брошенные открытые ставки этого юзера (проигрыш)
      await sb('shark_bets?tg_id=eq.' + me.id + '&game=eq.crash&status=eq.open', {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'done' })
      });
      const deb = await applyLedger(me.id, 'stars', -bet, 'bet', 'crash', null, { bet });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_stars' }); return; }

      // provably-fair точка краша
      const seed = crypto.randomBytes(16).toString('hex');
      const seedHash = crypto.createHash('sha256').update(seed).digest('hex');
      const crashPoint = crashPointFromSeed(seed);
      const ins = await sb('shark_bets', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({
          tg_id: me.id, game: 'crash', bet_stars: bet, payout: 0, status: 'open',
          server_seed: seed, seed_hash: seedHash, crash_point: crashPoint,
          started_at: new Date().toISOString(),
          detail: { autoMult: Number(body.autoMult) || null }
        })
      });
      const round = Array.isArray(ins.data) ? ins.data[0] : ins.data;
      await bumpStats(me.id, { played: 1 });
      const fresh = await freshUser();
      // seed_hash отдаём заранее (доказуемая честность), crash_point — нет
      json(res, 200, { ok: true, roundId: round.id, seedHash, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  CRASH_CASHOUT — забрать; множитель считает сервер по времени
    // ---------------------------------------------------------
    if (action === 'crash_cashout') {
      const roundId = Number(body.roundId);
      const rows = await sbGet('shark_bets?id=eq.' + roundId + '&tg_id=eq.' + me.id + '&game=eq.crash&select=*');
      const round = rows[0];
      if (!round) { json(res, 200, { ok: false, reason: 'no_round' }); return; }
      if (round.status !== 'open') { json(res, 200, { ok: false, reason: 'closed' }); return; }

      const dt = (Date.now() - new Date(round.started_at).getTime()) / 1000;
      const mult = crashMultAt(dt);
      const crashPoint = Number(round.crash_point);

      if (mult >= crashPoint) {
        // не успел — краш
        await sb('shark_bets?id=eq.' + roundId, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ status: 'done', payout: 0, server_seed: round.server_seed })
        });
        json(res, 200, { ok: true, busted: true, crashPoint, seed: round.server_seed, user: publicUser(user) });
        return;
      }
      const cashMult = Math.floor(mult * 100) / 100;
      const win = Math.floor(round.bet_stars * cashMult);
      await applyLedger(me.id, 'stars', win, 'win', 'crash:' + roundId, 'crash_win:' + roundId, { mult: cashMult });
      await sb('shark_bets?id=eq.' + roundId, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'done', payout: win, detail: Object.assign({}, round.detail, { cashMult }) })
      });
      await bumpStats(me.id, { won: Math.max(win - round.bet_stars, 0) });
      const fresh = await freshUser();
      json(res, 200, { ok: true, busted: false, mult: cashMult, win, crashPoint, seed: round.server_seed, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  BUY_GIFT — купить подарок за звёзды
    // ---------------------------------------------------------
    if (action === 'buy_gift') {
      const item = SHOP.find((s) => s.name === body.name);
      if (!item) { json(res, 200, { ok: false, reason: 'no_item' }); return; }
      if (Number(user.stars_balance) < item.value) { json(res, 200, { ok: false, reason: 'no_stars' }); return; }
      const deb = await applyLedger(me.id, 'stars', -item.value, 'gift', item.name, null, { emoji: item.emoji });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_stars' }); return; }
      await sb('shark_gifts', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ tg_id: me.id, name: item.name, emoji: item.emoji, cost_stars: item.value })
      });
      notifyAdmins(BOT, adminIds(), '🎁 Куплен подарок «' + item.name + '» ' + item.emoji + '\n👤 ' + userLabel(user) + '\n⭐' + item.value + '\n\nОтправьте подарок вручную.');
      const fresh = await freshUser();
      json(res, 200, { ok: true, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  BUY_PRO — подписка PRO за грн с баланса
    // ---------------------------------------------------------
    if (action === 'buy_pro') {
      if (isProActive(user)) { json(res, 200, { ok: false, reason: 'already_pro' }); return; }
      const price = Number(CFG.pro_price);
      if (Number(user.money_balance) < price) { json(res, 200, { ok: false, reason: 'no_money' }); return; }
      const deb = await applyLedger(me.id, 'uah', -price, 'pro', 'pro', null, {});
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_money' }); return; }
      const until = new Date(Date.now() + CFG.pro_days * 86400000).toISOString();
      await sb('shark_users?tg_id=eq.' + me.id, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ is_pro: true, pro_until: until })
      });
      const fresh = await freshUser();
      json(res, 200, { ok: true, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  WITHDRAW_CREATE — заявка на вывод (ручное подтверждение админом)
    // ---------------------------------------------------------
    if (action === 'withdraw_create') {
      const method = body.method;
      const requisites = (body.requisites || '').toString().trim();
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (!WITHDRAW_METHODS.includes(method)) { json(res, 200, { ok: false, reason: 'bad_method' }); return; }
      if (!requisites) { json(res, 200, { ok: false, reason: 'no_requisites' }); return; }
      // валидация реквизитов
      if (method === 'card_ua') {
        const digits = requisites.replace(/[\s-]/g, '');
        if (!/^\d{16}$/.test(digits)) { json(res, 200, { ok: false, reason: 'bad_card' }); return; }
      } else if (requisites.length < 20) { json(res, 200, { ok: false, reason: 'bad_wallet' }); return; }
      if (!(amount >= CFG.min_withdraw)) { json(res, 200, { ok: false, reason: 'below_min', min: CFG.min_withdraw }); return; }
      if (amount > Number(user.money_balance)) { json(res, 200, { ok: false, reason: 'no_money' }); return; }

      // списываем сразу (деньги «заморожены» в заявке; вернём при отклонении)
      const deb = await applyLedger(me.id, 'uah', -amount, 'withdraw', 'pending', null, { method });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_money' }); return; }
      const usdt = method.indexOf('usdt') === 0 ? Math.round((amount / CFG.usdt_rate) * 100) / 100 : null;
      const ins = await sb('shark_withdrawals', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ tg_id: me.id, method, requisites: requisites.slice(0, 200), amount_uah: amount, amount_usdt: usdt })
      });
      const wd = Array.isArray(ins.data) ? ins.data[0] : ins.data;

      // уведомить админов карточкой с кнопками
      const text = '💸 Заявка на вывод #' + wd.id + '\n\n' +
        '👤 ' + userLabel(user) + '\n' +
        '💰 ' + amount.toFixed(2) + ' грн' + (usdt ? ' (≈ ' + usdt.toFixed(2) + ' USDT)' : '') + '\n' +
        '🏦 ' + method.replace(/_/g, ' ').toUpperCase() + '\n' +
        '📇 ' + requisites + '\n\n' +
        'Выплату отправьте ВРУЧНУЮ, затем подтвердите.';
      const sent = await notifyAdmins(BOT, adminIds(), text, withdrawDecisionKb(wd.id));
      if (sent && sent.messageId) {
        await sb('shark_withdrawals?id=eq.' + wd.id, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ admin_msg_id: sent.messageId })
        });
      }
      const fresh = await freshUser();
      json(res, 200, { ok: true, id: wd.id, amount, usdt, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  HISTORY — лента операций из леджера
    // ---------------------------------------------------------
    if (action === 'history') {
      const rows = await sbGet('shark_ledger?tg_id=eq.' + me.id + '&order=created_at.desc&limit=60&select=currency,amount,kind,ref,meta,created_at');
      json(res, 200, { ok: true, history: rows.map(mapHistory) });
      return;
    }

    json(res, 200, { ok: false, reason: 'unknown_action' });

    // ===== вложенные хелперы, которым нужен доступ к sb/me =====
    async function freshUser() { const r = await sbGet('shark_users?tg_id=eq.' + me.id + '&select=*'); return r[0] || user; }
    async function bumpStats(tg, d) {
      const u = await sbGet('shark_users?tg_id=eq.' + tg + '&select=played,won_stars');
      if (!u[0]) return;
      const patch = {};
      if (d.played) patch.played = Number(u[0].played || 0) + d.played;
      if (d.won) patch.won_stars = Number(u[0].won_stars || 0) + d.won;
      if (Object.keys(patch).length) {
        await sb('shark_users?tg_id=eq.' + tg, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(patch) });
      }
    }
  } catch (e) {
    json(res, 200, { ok: false, reason: 'server_error', error: String(e && e.message) });
  }
};

// ============================================================
//  Чистые хелперы (без замыканий на запрос)
// ============================================================
function adminIds() {
  return (env('ADMIN_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
}
function isProActive(u) { return !!u.is_pro && (!u.pro_until || new Date(u.pro_until).getTime() > Date.now()); }
function publicUser(u) {
  return {
    tg_id: u.tg_id, username: u.username, first_name: u.first_name, lang: u.lang,
    money: Number(u.money_balance), stars: Number(u.stars_balance),
    isPro: isProActive(u), played: Number(u.played || 0), wonStars: Number(u.won_stars || 0),
    refCode: u.ref_code
  };
}
function userLabel(u) {
  return (u.first_name || 'user') + (u.username ? ' @' + u.username : '') + ' (id ' + u.tg_id + ')';
}
function botLink(botToken, refCode) {
  // имя бота не знаем из токена — фронт подставит через BOT_USERNAME при желании
  return refCode ? ('?start=ref_' + refCode) : '';
}
function mapHistory(r) {
  const cur = r.currency === 'stars' ? '⭐' : ' грн';
  const amt = Number(r.amount);
  const sign = amt >= 0 ? '+' : '−';
  const val = r.currency === 'stars' ? (sign + '⭐' + Math.abs(amt)) : (sign + Math.abs(amt).toFixed(2) + ' грн');
  const titles = {
    task: '✅ Задание', referral: '👥 Реферал', bet: '🎮 Ставка', win: '🏆 Выигрыш',
    withdraw: '💸 Вывод', withdraw_refund: '↩️ Возврат вывода', daily: '🎁 Ежедневный кейс',
    wheel: '🎡 Колесо', pro: '⭐ PRO', gift: '🎁 Подарок', adjust: '⚙️ Коррекция'
  };
  return {
    icon: (titles[r.kind] || '•').split(' ')[0],
    title: (titles[r.kind] || r.kind).replace(/^\S+\s/, ''),
    sub: r.ref || '',
    val, cls: amt >= 0 ? (r.currency === 'stars' ? 'star' : 'plus') : 'minus',
    t: r.created_at
  };
}

// провабли-фейр точка краша из seed: медиана ~2x, дом-edge ~4%
function crashPointFromSeed(seed) {
  const h = crypto.createHash('sha256').update(seed).digest();
  const n = h.readUInt32BE(0) / 0xffffffff;      // 0..1
  if (n < 0.02) return 1.00;                      // 2% мгновенный краш
  const raw = 0.96 / (1 - n);                     // тяжёлый хвост
  return Math.max(1.00, Math.floor(raw * 100) / 100);
}

// ============================================================
//  Telegram
// ============================================================
async function tg(botToken, method, payload) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + botToken + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    return await r.json().catch(() => ({}));
  } catch (e) { return { ok: false }; }
}
function tgNotify(botToken, chatId, text) { return tg(botToken, 'sendMessage', { chat_id: chatId, text }); }
async function notifyAdmins(botToken, ids, text, replyMarkup) {
  let first = null;
  for (const id of ids) {
    const r = await tg(botToken, 'sendMessage', Object.assign({ chat_id: id, text }, replyMarkup ? { reply_markup: replyMarkup } : {}));
    if (!first && r && r.ok && r.result) first = { messageId: r.result.message_id, chatId: id };
  }
  return first;
}
function withdrawDecisionKb(id) {
  return { inline_keyboard: [[
    { text: '✅ Подтвердить', callback_data: 'wd_ok:' + id },
    { text: '❌ Отклонить', callback_data: 'wd_no:' + id }
  ]] };
}
function taskDecisionKb(id) {
  return { inline_keyboard: [[
    { text: '✅ Засчитать', callback_data: 'tk_ok:' + id },
    { text: '❌ Отклонить', callback_data: 'tk_no:' + id }
  ]] };
}
// проверка подписки на канал: бот должен быть админом канала target (@channel)
async function checkSubscription(botToken, target, userId) {
  if (!target) return true;
  const r = await tg(botToken, 'getChatMember', { chat_id: target, user_id: userId });
  if (!r || !r.ok || !r.result) return false;
  const st = r.result.status;
  return st === 'member' || st === 'administrator' || st === 'creator';
}

// экспорт для bot.js и тестов
module.exports.verifyInitData = verifyInitData;
module.exports.crashPointFromSeed = crashPointFromSeed;
