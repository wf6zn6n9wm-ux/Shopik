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
// Действия: state | game_bet | pvp_state | pvp_join | crash_bet |
//           crash_cashout | buy_gift | create_stars_invoice |
//           create_cryptobot_invoice | cryptobot_check | withdraw_create |
//           history
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   SHARK_SUPABASE_URL / SUPABASE_URL
//   SHARK_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY   (секрет!)
//   SHARK_BOT_TOKEN / BOT_TOKEN                                   (токен бота)
//   SHARK_ADMIN_IDS         — tg_id админов через запятую (кому слать заявки на вывод)
//   SHARK_ADMIN_PANEL_IDS   — tg_id, кому доступна админ-панель (отдельно от уведомлений).
//                             Не задан = панель закрыта для всех.
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
const SHOP = [
  { emoji: '🦈', name: 'Shark NFT', value: 500 }, { emoji: '🐚', name: 'Ракушка', value: 331 },
  { emoji: '🪸', name: 'Коралл',   value: 344 }, { emoji: '🌊', name: 'Волна',   value: 360 },
  { emoji: '🐠', name: 'Рыбка',    value: 334 }, { emoji: '⚓', name: 'Якорь',   value: 356 },
  { emoji: '💎', name: 'Жемчуг',   value: 600 }, { emoji: '🔱', name: 'Трезубец', value: 358 }
];
const BET_OPTIONS = [50, 100, 250];
const WITHDRAW_METHODS = ['card_ua', 'usdt_trc20', 'usdt_ton', 'usdt_bep20'];

// Пакеты пополнения игровых звёзд через Telegram Stars (валюта XTR).
// price — сколько Telegram Stars платит пользователь; stars — сколько игровых
// звёзд зачисляем (в больших пакетах — бонус). Источник цен — сервер.
const STAR_PACKS = {
  s100:  { stars: 100,  price: 100,  title: '100 звёзд' },
  s550:  { stars: 550,  price: 500,  title: '550 звёзд · +10%' },
  s1150: { stars: 1150, price: 1000, title: '1150 звёзд · +15%' },
  s6000: { stars: 6000, price: 5000, title: '6000 звёзд · +20%' }
};

// Те же тиры звёзд, но оплата через @CryptoBot (USDT). usd — сумма в USDT.
const CRYPTOBOT_PACKS = {
  cb100:  { stars: 100,  usd: 1,  title: '100 звёзд' },
  cb550:  { stars: 550,  usd: 5,  title: '550 звёзд · +10%' },
  cb1150: { stars: 1150, usd: 10, title: '1150 звёзд · +15%' },
  cb6000: { stars: 6000, usd: 50, title: '6000 звёзд · +20%' }
};
const CRYPTOBOT_API = 'https://pay.crypt.bot/api/';

// PVP-джекпот: комиссия «дома» (house edge) с банка при выплате победителю.
// Ожидание для игрока = ставка * (1 - PVP_RAKE) — как честная лотерея с рейком.
const PVP_RAKE = 0.05;
const PVP_DURATION_S = 15;       // длительность отсчёта раунда после первой ставки
const PVP_BOT_NAMES = ['sea_wolf', 'krd_777', 'blue_fin', 'reef_king', 'aqua_max', 'tide_88',
  'kraken_x', 'pearl', 'marlin', 'orca_pro', 'deep_one', 'ota_try', 'molodoywq', 'cakt0'];
const PVP_BOT_AV = ['🐙', '🐡', '🐠', '🦑', '🦀', '🐬', '🐳', '🦈', '🐚', '🪼', '🦞', '🐟'];

// Админка. Права определяет ТОЛЬКО сервер по ADMIN_PANEL_IDS — клиент на них не влияет.
//  • ADMIN_SCAN — верхняя граница выборки для агрегатов (суммы балансов, оборот
//    по леджеру считаются в памяти, без изменения схемы БД). Сколько строк реально
//    просмотрено — возвращаем клиенту, чтобы цифра не выглядела точной, когда она
//    упёрлась в потолок.
//  • ADMIN_GRANT_MAX — потолок одного ручного начисления.
const ADMIN_SCAN = 5000;
const ADMIN_GRANT_MAX = 1000000;
function pvpMakeBots(n) {
  const used = {}, bots = [];
  for (let i = 0; i < n; i++) {
    let nm; do { nm = PVP_BOT_NAMES[Math.floor(Math.random() * PVP_BOT_NAMES.length)]; } while (used[nm]);
    used[nm] = 1;
    bots.push({
      name: nm, av: PVP_BOT_AV[Math.floor(Math.random() * PVP_BOT_AV.length)],
      stake: BET_OPTIONS[Math.floor(Math.random() * BET_OPTIONS.length)] * (Math.random() < 0.15 ? 4 : 1)
    });
  }
  return bots;
}
// победитель по seed, взвешенно по ставке (bets отсортированы по id)
function pvpWinnerIndex(seed, bets, pot) {
  const roll = parseInt(crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) / 0xffffffff;
  let acc = 0;
  for (let i = 0; i < bets.length; i++) {
    acc += Number(bets[i].stake) / pot;
    if (roll <= acc) return i;
  }
  return bets.length - 1;
}

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

    // Права админа. Считаются здесь, после проверки подписи initData: me.id —
    // это подтверждённый Telegram id, подделать его клиент не может.
    const IS_ADMIN = panelIds().includes(Number(me.id));

    // --- Supabase REST хелперы ---
    async function sb(path, opts) {
      const r = await fetch(URL + '/rest/v1/' + path, Object.assign({ headers: H }, opts || {}));
      const t = await r.text();
      let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
      return { ok: r.ok, status: r.status, data };
    }
    async function sbGet(path) { const r = await sb(path); return Array.isArray(r.data) ? r.data : []; }
    // COUNT без выгрузки строк: PostgREST отдаёт итог в заголовке Content-Range
    async function sbCount(path) {
      try {
        const r = await fetch(URL + '/rest/v1/' + path, {
          headers: Object.assign({}, H, { Prefer: 'count=exact', Range: '0-0' })
        });
        const n = Number(String(r.headers.get('content-range') || '').split('/')[1]);
        return Number.isFinite(n) ? n : 0;
      } catch (e) { return 0; }
    }
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
      ref_stars_per_friend: 5, ref_stars_daily_cap: 50
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
        // приветственный бонус пригласившему: +referral_bonus грн (на вывод) и
        // +ref_stars_per_friend ⭐ (с суточным лимитом ref_stars_daily_cap)
        await applyLedger(refBy, 'uah', CFG.referral_bonus, 'referral', 'signup:' + me.id, 'ref_signup:' + me.id, { invited: me.id });
        await sb('shark_referrals?inviter_tg=eq.' + refBy + '&invited_tg=eq.' + me.id, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ earned: CFG.referral_bonus })
        });
        const gs = await awardRefStars(refBy, CFG.ref_stars_per_friend, 'refstars_signup:' + me.id);
        tgNotify(BOT, refBy, '👥 Новый друг по вашей ссылке! +' + CFG.referral_bonus.toFixed(2) + ' грн' + (gs > 0 ? ' и +' + gs + ' ⭐' : ''));
      }
      return u;
    }

    const user = await ensureUser();
    if (!user) { json(res, 200, { ok: false, reason: 'user_error' }); return; }
    if (user.banned) { json(res, 200, { ok: false, reason: 'banned' }); return; }

    const action = body.action;

    // ---------------------------------------------------------
    //  STATE — всё состояние для отрисовки
    // ---------------------------------------------------------
    if (action === 'state') {
      const refs = await sbGet('shark_referrals?inviter_tg=eq.' + me.id + '&order=created_at.desc&select=invited_tg,earned,created_at');
      // заработок с рефералов из леджера (грн — вывод, звёзды — игра)
      const led = await sbGet('shark_ledger?tg_id=eq.' + me.id + '&kind=eq.referral&select=currency,amount');
      let earnedUah = 0, earnedStars = 0;
      led.forEach((l) => { if (l.currency === 'uah') earnedUah += Number(l.amount); else earnedStars += Number(l.amount); });
      const today = todayUTC();
      const todayStars = (user.ref_day === today) ? Number(user.ref_stars_today || 0) : 0;
      // имена приглашённых
      let friends = [];
      const ids = refs.map((r) => r.invited_tg).filter(Boolean);
      if (ids.length) {
        const us = await sbGet('shark_users?tg_id=in.(' + ids.join(',') + ')&select=tg_id,first_name,username,created_at');
        const nameOf = {}; us.forEach((u) => { nameOf[u.tg_id] = u.first_name || (u.username ? '@' + u.username : 'id' + u.tg_id); });
        friends = refs.slice(0, 50).map((r) => ({ name: nameOf[r.invited_tg] || ('id' + r.invited_tg), at: r.created_at }));
      }

      json(res, 200, {
        ok: true,
        user: publicUser(user),
        isAdmin: IS_ADMIN,
        config: {
          usdt_rate: CFG.usdt_rate, min_withdraw: CFG.min_withdraw,
          referral_bonus: CFG.referral_bonus, referral_share: CFG.referral_share
        },
        referrals: {
          count: refs.length, earnedUah: Math.round(earnedUah * 100) / 100, earnedStars,
          todayStars, capStars: CFG.ref_stars_daily_cap, perFriend: CFG.ref_stars_per_friend,
          sharePct: Math.round(CFG.referral_share * 100), bonusUah: CFG.referral_bonus, friends
        },
        catalog: { roulette: ROUL_PRIZES, shop: SHOP, bets: BET_OPTIONS, methods: WITHDRAW_METHODS, packs: STAR_PACKS, cryptoPacks: CRYPTOBOT_PACKS },
        refLink: botLink(BOT, user.ref_code)
      });
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
    //  PVP_STATE — состояние текущего общего раунда (для поллинга)
    // ---------------------------------------------------------
    if (action === 'pvp_state') {
      const round = await ensurePvpRound(false);
      const st = await pvpRoundState(round);
      json(res, 200, { ok: true, round: st, user: publicUser(user), duration: PVP_DURATION_S });
      return;
    }

    // ---------------------------------------------------------
    //  PVP_JOIN — войти в текущий общий раунд (ставка в общий банк)
    // ---------------------------------------------------------
    if (action === 'pvp_join') {
      const bet = Number(body.bet);
      if (!BET_OPTIONS.includes(bet)) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (Number(user.stars_balance) < bet) { json(res, 200, { ok: false, reason: 'no_stars' }); return; }

      let round = await ensurePvpRound(true);
      // принимаем ставки только пока идёт набор/отсчёт
      if (round.status !== 'waiting' && round.status !== 'countdown') {
        json(res, 200, { ok: false, reason: 'round_closed' }); return;
      }
      // Админ-аккаунт пополняется вручную, поэтому не садится за один стол с
      // живыми игроками — и наоборот. Проверка симметричная: конфликт, если в
      // раунде уже есть реальная ставка «другого класса». Боты (tg_id = null)
      // не в счёт, они и есть спарринг для админского аккаунта.
      const seated = await sbGet('shark_pvp_bets?round_id=eq.' + round.id + '&tg_id=not.is.null&select=tg_id');
      const adm = panelIds();
      const mixed = seated.some((b) => b.tg_id != null && Number(b.tg_id) !== Number(me.id) && adm.includes(Number(b.tg_id)) !== IS_ADMIN);
      if (mixed) { json(res, 200, { ok: false, reason: 'round_mixed' }); return; }

      // вставляем ставку ПЕРВОЙ — уникальный индекс (round_id, tg_id) защищает
      // от двойного входа при быстром двойном тапе; списываем только если строка
      // реально создалась (не дубликат)
      const betIns = await sb('shark_pvp_bets', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation,resolution=ignore-duplicates' }),
        body: JSON.stringify({ round_id: round.id, tg_id: me.id, name: user.first_name || 'Игрок', av: '🙂', stake: bet })
      });
      const betRow = Array.isArray(betIns.data) ? betIns.data[0] : null;
      if (!betRow) { const st = await pvpRoundState(round); json(res, 200, { ok: false, reason: 'already_joined', round: st, user: publicUser(user) }); return; }
      // списываем ставку; при нехватке средств откатываем вставленную ставку
      const deb = await applyLedger(me.id, 'stars', -bet, 'bet', 'pvp:' + round.id, null, { bet });
      if (!deb.ok) {
        await sb('shark_pvp_bets?id=eq.' + betRow.id, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
        json(res, 200, { ok: false, reason: 'no_stars' }); return;
      }
      // если это первая ставка — запускаем отсчёт и подсаживаем ботов для оживления
      if (round.status === 'waiting') {
        const bots = pvpMakeBots(1 + Math.floor(Math.random() * 3));
        if (bots.length) {
          await sb('shark_pvp_bets', {
            method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
            body: JSON.stringify(bots.map((b) => ({ round_id: round.id, tg_id: null, name: b.name, av: b.av, stake: b.stake })))
          });
        }
        const resolveAt = new Date(Date.now() + PVP_DURATION_S * 1000).toISOString();
        const upd = await sb('shark_pvp_rounds?id=eq.' + round.id + '&status=eq.waiting', {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
          body: JSON.stringify({ status: 'countdown', resolve_at: resolveAt })
        });
        if (Array.isArray(upd.data) && upd.data[0]) round = upd.data[0];
      }
      const fresh = await freshUser();
      const st = await pvpRoundState(round);
      json(res, 200, { ok: true, round: st, user: publicUser(fresh) });
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
    //  CREATE_STARS_INVOICE — счёт на пополнение звёзд через Telegram Stars
    //  Зачисление делает бот в successful_payment (idempotent по charge_id).
    // ---------------------------------------------------------
    if (action === 'create_stars_invoice') {
      const pack = STAR_PACKS[body.pack];
      if (!pack) { json(res, 200, { ok: false, reason: 'bad_pack' }); return; }
      const payload = JSON.stringify({ tg: me.id, pack: body.pack });
      const r = await fetch('https://api.telegram.org/bot' + BOT + '/createInvoiceLink', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Shark · ' + pack.title,
          description: 'Пополнение игрового баланса на ' + pack.stars + ' звёзд',
          payload, currency: 'XTR',
          prices: [{ label: pack.title, amount: pack.price }]
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || !d.result) { json(res, 200, { ok: false, reason: 'invoice_failed' }); return; }
      json(res, 200, { ok: true, link: d.result, stars: pack.stars, price: pack.price });
      return;
    }

    // ---------------------------------------------------------
    //  CREATE_CRYPTOBOT_INVOICE — счёт на пополнение звёзд через @CryptoBot
    //  (оплата в USDT). Зачисление — не по webhook, а ленивой проверкой
    //  (cryptobot_check), как резолв PVP-раундов: клиент опрашивает статус
    //  инвойса напрямую через getInvoices нашим секретным токеном — это
    //  безопаснее вебхука на serverless (не нужно проверять подпись на raw body).
    // ---------------------------------------------------------
    if (action === 'create_cryptobot_invoice') {
      const CB_TOKEN = env('CRYPTOBOT_TOKEN');
      if (!CB_TOKEN) { json(res, 200, { ok: false, reason: 'not_configured' }); return; }
      const pack = CRYPTOBOT_PACKS[body.pack];
      if (!pack) { json(res, 200, { ok: false, reason: 'bad_pack' }); return; }
      const payload = JSON.stringify({ tg: me.id, pack: body.pack });
      const r = await fetch(CRYPTOBOT_API + 'createInvoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Token': CB_TOKEN },
        body: JSON.stringify({
          asset: 'USDT', amount: String(pack.usd),
          description: 'Shark · ' + pack.title, payload, expires_in: 1800
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || !d.result) { json(res, 200, { ok: false, reason: 'invoice_failed' }); return; }
      json(res, 200, {
        ok: true, invoiceId: d.result.invoice_id,
        payUrl: d.result.bot_invoice_url || d.result.pay_url,
        stars: pack.stars, usd: pack.usd
      });
      return;
    }

    // ---------------------------------------------------------
    //  CRYPTOBOT_CHECK — опрос статуса инвойса @CryptoBot; при первой оплате
    //  начисляет звёзды и реферальную долю (идемпотентно по invoice_id —
    //  повторные опросы после зачисления просто возвращают текущий статус).
    // ---------------------------------------------------------
    if (action === 'cryptobot_check') {
      const CB_TOKEN = env('CRYPTOBOT_TOKEN');
      if (!CB_TOKEN) { json(res, 200, { ok: false, reason: 'not_configured' }); return; }
      const invoiceId = Number(body.invoiceId);
      if (!invoiceId) { json(res, 200, { ok: false, reason: 'bad_invoice' }); return; }
      const r = await fetch(CRYPTOBOT_API + 'getInvoices?invoice_ids=' + invoiceId, {
        headers: { 'Crypto-Pay-API-Token': CB_TOKEN }
      });
      const d = await r.json().catch(() => ({}));
      const inv = d && d.ok && d.result && d.result.items && d.result.items[0];
      if (!inv) { json(res, 200, { ok: false, reason: 'not_found' }); return; }
      if (inv.status !== 'paid') { json(res, 200, { ok: true, status: inv.status }); return; }

      const idemKey = 'cb_pay:' + inv.invoice_id;
      const already = await sbGet('shark_ledger?idem=eq.' + encodeURIComponent(idemKey) + '&select=id&limit=1');
      if (already[0]) { const fresh = await freshUser(); json(res, 200, { ok: true, status: 'paid', credited: true, user: publicUser(fresh) }); return; }

      let pl = {}; try { pl = JSON.parse(inv.payload || '{}'); } catch (e) {}
      const pack = CRYPTOBOT_PACKS[pl.pack];
      if (!pack || Number(pl.tg) !== me.id) { json(res, 200, { ok: true, status: 'paid', credited: false }); return; }

      const cr = await applyLedger(me.id, 'stars', pack.stars, 'topup', 'cryptobot', idemKey, { amount: inv.amount, asset: inv.asset });
      if (!cr.ok) { json(res, 200, { ok: false, reason: 'credit_failed' }); return; }
      if (user.ref_by) {
        const share = Math.floor(pack.stars * CFG.referral_share);
        if (share > 0) {
          const rr = await applyLedger(user.ref_by, 'stars', share, 'referral', 'topup:' + me.id, 'reftop_cb:' + inv.invoice_id, { from: me.id });
          if (rr.ok) tgNotify(BOT, user.ref_by, '💜 Ваш друг пополнил баланс — вам +' + share + ' ⭐ (' + Math.round(CFG.referral_share * 100) + '%)');
        }
      }
      const fresh = await freshUser();
      json(res, 200, { ok: true, status: 'paid', credited: true, stars: pack.stars, user: publicUser(fresh) });
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

    // ---------------------------------------------------------
    //  ADMIN_STATS — сводка по игрокам и обороту
    // ---------------------------------------------------------
    if (action === 'admin_stats') {
      if (!IS_ADMIN) { json(res, 200, { ok: false, reason: 'forbidden' }); return; }
      const now = Date.now();
      const d1 = new Date(now - 24 * 3600 * 1000).toISOString();
      const d7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

      const [users, new24h, new7d, active24h, pendingWithdrawals] = await Promise.all([
        sbCount('shark_users?select=tg_id'),
        sbCount('shark_users?select=tg_id&created_at=gte.' + d1),
        sbCount('shark_users?select=tg_id&created_at=gte.' + d7),
        sbCount('shark_users?select=tg_id&last_seen=gte.' + d1),
        sbCount('shark_withdrawals?select=id&status=eq.pending')
      ]);

      // суммы балансов — считаем на месте, ограниченной выборкой (без изменения схемы)
      const bal = await sbGet('shark_users?select=stars_balance,money_balance&limit=' + ADMIN_SCAN);
      let starsHeld = 0, moneyHeld = 0;
      bal.forEach((u) => { starsHeld += Number(u.stars_balance || 0); moneyHeld += Number(u.money_balance || 0); });

      // оборот за 7 дней: складываем леджер по (валюта, вид операции)
      const led = await sbGet('shark_ledger?created_at=gte.' + d7 + '&select=currency,amount,kind&order=created_at.desc&limit=' + ADMIN_SCAN);
      const flow = {};
      led.forEach((l) => {
        const k = (l.currency === 'stars' ? 's:' : 'm:') + (l.kind || 'adjust');
        flow[k] = (flow[k] || 0) + Number(l.amount || 0);
      });
      const bets7d = Math.round(-(flow['s:bet'] || 0));      // ставки уходят минусом
      const wins7d = Math.round(flow['s:win'] || 0);

      json(res, 200, {
        ok: true,
        stats: {
          users, new24h, new7d, active24h, pendingWithdrawals,
          starsHeld: Math.round(starsHeld),
          moneyHeld: Math.round(moneyHeld * 100) / 100,
          bets7d, wins7d,
          rake7d: bets7d - wins7d,                            // что осталось «дому»
          topups7d: Math.round(flow['s:topup'] || 0),
          grants7d: Math.round(flow['s:adjust'] || 0),         // ручные начисления
          giftsSpent7d: Math.round(-(flow['s:gift'] || 0)),
          // прозрачность выборки: если упёрлись в потолок — цифра неполная
          scan: { cap: ADMIN_SCAN, users: bal.length, ledger: led.length, capped: bal.length >= ADMIN_SCAN || led.length >= ADMIN_SCAN }
        }
      });
      return;
    }

    // ---------------------------------------------------------
    //  ADMIN_PLAYERS — список игроков с поиском и постраничностью
    // ---------------------------------------------------------
    if (action === 'admin_players') {
      if (!IS_ADMIN) { json(res, 200, { ok: false, reason: 'forbidden' }); return; }
      const q = String(body.q || '').trim().slice(0, 60);
      const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const sort = body.sort === 'stars' ? 'stars_balance.desc'
        : body.sort === 'new' ? 'created_at.desc'
          : body.sort === 'played' ? 'played.desc'
            : 'last_seen.desc';

      let filter = '';
      if (q) {
        if (/^\d+$/.test(q)) filter = '&tg_id=eq.' + q;
        else {
          // Значение берём в двойные кавычки — так запятые и скобки в имени не
          // ломают синтаксис or=(...). Внутри кавычек экранируем \ и ".
          const like = encodeURIComponent('"*' + q.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '*"');
          filter = '&or=(first_name.ilike.' + like + ',username.ilike.' + like + ')';
        }
      }
      const base = 'shark_users?select=tg_id,username,first_name,lang,stars_balance,money_balance,played,won_stars,banned,created_at,last_seen' + filter;
      const total = await sbCount(base);
      const rows = await sbGet(base + '&order=' + sort + '&limit=' + limit + '&offset=' + offset);
      const adm = panelIds();

      json(res, 200, {
        ok: true, total, limit, offset,
        players: rows.map((u) => ({
          tg_id: Number(u.tg_id),
          name: u.first_name || '',
          username: u.username || '',
          lang: u.lang || 'ru',
          stars: Number(u.stars_balance || 0),
          money: Number(u.money_balance || 0),
          played: Number(u.played || 0),
          wonStars: Number(u.won_stars || 0),
          banned: !!u.banned,
          isAdmin: adm.includes(Number(u.tg_id)),
          createdAt: u.created_at,
          lastSeen: u.last_seen
        }))
      });
      return;
    }

    // ---------------------------------------------------------
    //  ADMIN_GRANT — ручное начисление ⭐ на админский аккаунт
    //  Только звёзды и только админам: грн — выводимые деньги, их нельзя
    //  рисовать; чужой баланс из панели не трогаем.
    // ---------------------------------------------------------
    if (action === 'admin_grant') {
      if (!IS_ADMIN) { json(res, 200, { ok: false, reason: 'forbidden' }); return; }
      const target = Number(body.tg || me.id);
      const amount = Math.trunc(Number(body.amount));
      if (body.currency && body.currency !== 'stars') { json(res, 200, { ok: false, reason: 'bad_currency' }); return; }
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > ADMIN_GRANT_MAX) {
        json(res, 200, { ok: false, reason: 'bad_amount' }); return;
      }
      if (!panelIds().includes(target)) { json(res, 200, { ok: false, reason: 'target_not_admin' }); return; }
      const dst = await sbGet('shark_users?tg_id=eq.' + target + '&select=tg_id');
      if (!dst[0]) { json(res, 200, { ok: false, reason: 'no_user' }); return; }

      // идемпотентность: ключ приходит с клиента, повтор того же ключа не двигает баланс
      const key = String(body.key || '').replace(/[^\w:.-]/g, '').slice(0, 48) || crypto.randomBytes(8).toString('hex');
      const idem = 'admin_grant:' + me.id + ':' + target + ':' + key;
      const r = await applyLedger(target, 'stars', amount, 'adjust', 'admin:' + me.id, idem,
        { admin_grant: 1, by: Number(me.id), note: String(body.note || '').slice(0, 120) });
      if (!r.ok) { json(res, 200, { ok: false, reason: 'ledger_failed' }); return; }

      const after = await sbGet('shark_users?tg_id=eq.' + target + '&select=*');
      const out = { ok: true, target, amount, balance: Number((after[0] && after[0].stars_balance) || 0) };
      if (target === Number(me.id) && after[0]) out.user = publicUser(after[0]);
      json(res, 200, out);
      return;
    }

    json(res, 200, { ok: false, reason: 'unknown_action' });

    // ===== вложенные хелперы, которым нужен доступ к sb/me =====

    // начислить пригласившему звёзды за друга с суточным лимитом (idempotent)
    async function awardRefStars(inviterTg, want, idemKey) {
      const ex = await sbGet('shark_ledger?idem=eq.' + encodeURIComponent(idemKey) + '&select=id&limit=1');
      if (ex[0]) return 0;                                    // уже начисляли
      const inv = await sbGet('shark_users?tg_id=eq.' + inviterTg + '&select=ref_day,ref_stars_today');
      if (!inv[0]) return 0;
      const today = todayUTC();
      const todayCount = (inv[0].ref_day === today) ? Number(inv[0].ref_stars_today || 0) : 0;
      const give = Math.min(Number(want), Math.max(0, Number(CFG.ref_stars_daily_cap) - todayCount));
      if (give <= 0) return 0;
      const r = await applyLedger(inviterTg, 'stars', give, 'referral', 'friend', idemKey, {});
      if (!r.ok) return 0;
      await sb('shark_users?tg_id=eq.' + inviterTg, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ ref_day: today, ref_stars_today: todayCount + give })
      });
      return give;
    }

    // Вернуть «текущий» раунд PVP.
    //  • forJoin=false (опрос состояния): истёкший countdown разыгрываем и
    //    ВОЗВРАЩАЕМ завершённый раунд, чтобы клиенты успели проиграть анимацию
    //    (в течение PVP_ANIM_GRACE_S). Только по истечении грейса создаём новый.
    //    Окно = поллинг (до 1.5 с) + вращение ленты (5 с) + показ развязки
    //    (4.6 с) с запасом. Механики раунда не касается — только когда сервер
    //    заводит следующий.
    //  • forJoin=true (ставка): истёкший/завершённый раунд не годится — сразу
    //    заводим свежий waiting и играем в нём.
    const PVP_ANIM_GRACE_S = 12;
    async function ensurePvpRound(forJoin) {
      for (let attempt = 0; attempt < 4; attempt++) {
        let rows = await sbGet('shark_pvp_rounds?order=id.desc&limit=1&select=*');
        let r = rows[0];
        // истёкший отсчёт — разыграть, затем перечитать (станет done)
        if (r && r.status === 'countdown' && r.resolve_at && Date.now() >= new Date(r.resolve_at).getTime()) {
          await resolvePvpRound(r);
          rows = await sbGet('shark_pvp_rounds?order=id.desc&limit=1&select=*');
          r = rows[0];
        }
        if (r && (r.status === 'waiting' || r.status === 'countdown' || r.status === 'resolving')) return r;
        if (r && r.status === 'done') {
          const age = (Date.now() - new Date(r.resolved_at || r.created_at).getTime()) / 1000;
          if (!forJoin && age < PVP_ANIM_GRACE_S) return r;   // отдаём done — клиент анимирует
          // иначе — заводим новый раунд ниже
        }
        const seed = crypto.randomBytes(16).toString('hex');
        const seedHash = crypto.createHash('sha256').update(seed).digest('hex');
        const ins = await sb('shark_pvp_rounds', {
          method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
          body: JSON.stringify({ status: 'waiting', seed, seed_hash: seedHash, rake: PVP_RAKE })
        });
        const nw = Array.isArray(ins.data) ? ins.data[0] : ins.data;
        if (nw) return nw;
      }
      return null;
    }

    // атомарно разыграть истёкший раунд (защита от двойного резолва)
    async function resolvePvpRound(round) {
      // застолбить право резолвить: countdown -> resolving получает ровно один вызов
      const claim = await sb('shark_pvp_rounds?id=eq.' + round.id + '&status=eq.countdown', {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'resolving' })
      });
      if (!Array.isArray(claim.data) || !claim.data[0]) return; // уже кто-то разыгрывает/разыграл
      const r = claim.data[0];
      const bets = await sbGet('shark_pvp_bets?round_id=eq.' + r.id + '&order=id.asc&select=*');
      const pot = bets.reduce((a, b) => a + Number(b.stake), 0);
      let winner = null, payout = 0;
      if (bets.length && pot > 0) {
        const wi = pvpWinnerIndex(r.seed, bets, pot);
        const w = bets[wi];
        payout = Math.floor(pot * (1 - Number(r.rake)));
        winner = { name: w.name, av: w.av, tg_id: w.tg_id, stake: Number(w.stake), pct: Math.round((w.stake / pot) * 1000) / 10, payout };
        if (w.tg_id) {
          await applyLedger(w.tg_id, 'stars', payout, 'win', 'pvp:' + r.id, 'pvp_win:' + r.id, { pot });
          await bumpStats(w.tg_id, { won: Math.max(payout - Number(w.stake), 0) });
        }
      }
      // всем реальным участникам +1 к «сыграно»
      for (const b of bets) { if (b.tg_id) await bumpStats(b.tg_id, { played: 1 }); }
      await sb('shark_pvp_rounds?id=eq.' + r.id, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'done', pot, winner, resolved_at: new Date().toISOString() })
      });
    }

    // собрать состояние раунда для клиента
    async function pvpRoundState(round) {
      const bets = await sbGet('shark_pvp_bets?round_id=eq.' + round.id + '&order=id.asc&select=*');
      const pot = bets.reduce((a, b) => a + Number(b.stake), 0) || Number(round.pot) || 0;
      const players = bets.map((b) => ({
        name: b.tg_id && Number(b.tg_id) === me.id ? 'Вы' : b.name, av: b.av || '🙂',
        stake: Number(b.stake), me: Number(b.tg_id) === me.id,
        pct: pot ? Math.round((b.stake / pot) * 1000) / 10 : 0
      }));
      const done = round.status === 'done';
      let secondsLeft = 0;
      if (round.status === 'countdown' && round.resolve_at) {
        secondsLeft = Math.max(0, Math.ceil((new Date(round.resolve_at).getTime() - Date.now()) / 1000));
      }
      let winnerIdx = -1;
      if (done && round.winner) {
        winnerIdx = bets.findIndex((b) => b.name === round.winner.name && Number(b.stake) === Number(round.winner.stake));
        players.forEach((p, i) => { p.winner = (i === winnerIdx); });
      }
      const iJoined = bets.some((b) => Number(b.tg_id) === me.id);
      const iWon = done && round.winner && Number(round.winner.tg_id) === me.id;
      return {
        id: round.id, status: round.status, secondsLeft, pot, rake: Number(round.rake),
        seedHash: round.seed_hash, seed: done ? round.seed : null,
        players, winnerIdx, winner: done ? round.winner : null, iJoined, iWon,
        myPayout: iWon ? Number(round.winner.payout) : 0
      };
    }

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
// Кому доступна админ-панель. Отдельный список от ADMIN_IDS: тот отвечает лишь
// за уведомления в Telegram (выводы, подарки), и добавить туда человека ради
// уведомлений не должно открывать ему панель. Пока ADMIN_PANEL_IDS не задан,
// панель не доступна никому — включается явной установкой переменной.
function panelIds() {
  return (env('ADMIN_PANEL_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
}
function publicUser(u) {
  return {
    tg_id: u.tg_id, username: u.username, first_name: u.first_name, lang: u.lang,
    money: Number(u.money_balance), stars: Number(u.stars_balance),
    played: Number(u.played || 0), wonStars: Number(u.won_stars || 0),
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
  // title/currency label формируются на клиенте (i18n) — сервер отдаёт только kind + сырые числа
  return {
    kind: r.kind || 'adjust',
    currency: r.currency, amount: Number(r.amount),
    sub: r.ref || '',
    cls: Number(r.amount) >= 0 ? (r.currency === 'stars' ? 'star' : 'plus') : 'minus',
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

// экспорт для bot.js и тестов
module.exports.verifyInitData = verifyInitData;
module.exports.crashPointFromSeed = crashPointFromSeed;
