// Serverless-функция (Vercel) — бэкенд SHARK.
//
// Личность пользователя — по подписи Telegram initData (HMAC токеном бота),
// поэтому подделать чужой tg_id нельзя. Доступ к БД — только отсюда, сервисным
// ключом Supabase (в браузер он не попадает).
//
// Главный принцип: ВСЁ, что касается денег, считает сервер. Клиент присылает
// лишь намерение; ставки, цены, исходы игр — на сервере.
//
// Валюта одна — TON: ей играют, её пополняют и выводят. Telegram Stars на
// балансе не хранятся вообще: ими покупаются только кейсы с подарками, счётом
// в момент покупки. Поэтому операции «звёзды → деньги» не существует.
//
// Запрос: POST { action, initData, ...params }
// Действия: state | game_bet | pvp_state | pvp_join | crash_bet |
//           crash_cashout | case_open | case_result | gifts |
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
// Рулетка на TON: приз — МНОЖИТЕЛЬ к ставке, а не фиксированная сумма.
// Прежняя таблица (фиксированные звёзды) давала дому 46.3% — на игровых
// звёздах это терпимо, на реальных деньгах это грабёж. Новая настроена на тот
// же рейк, что и PVP: матожидание игрока 0.958, дому 4.2%, каждый четвёртый
// спин в плюс. Лестница редкости и названия сохранены.
// Инвариант проверяется тестом: если кто-то поправит веса, edge не уплывёт молча.
const ROUL_PRIZES = [
  { emoji: '🫧', name: 'Пузырь',  mult: 0.2, weight: 34  },
  { emoji: '🌊', name: 'Волна',   mult: 0.4, weight: 24  },
  { emoji: '🐚', name: 'Ракушка', mult: 0.8, weight: 18  },
  { emoji: '🐠', name: 'Рыбка',   mult: 1.5, weight: 10  },
  { emoji: '🪸', name: 'Коралл',  mult: 2,   weight: 7   },
  { emoji: '⚓', name: 'Якорь',   mult: 3,   weight: 4   },
  { emoji: '🦈', name: 'Акула',   mult: 5,   weight: 2.4 },
  { emoji: '💎', name: 'Жемчуг',  mult: 20,  weight: 0.6 }
];
// ============================================================
//  🎁 Кейсы с подарками Telegram — покупаются за Telegram Stars
// ============================================================
//  Звёзды на балансе НЕ хранятся: кейс оплачивается счётом в XTR в момент
//  покупки, звёзды проходят насквозь и оседают у Telegram. Поэтому операции
//  «звёзды → деньги» не существует, и игровая экономика на TON с этим не
//  пересекается ни в одной точке.
//
//  У кейса, в отличие от игр на TON, выплата — настоящий подарок со своей
//  ценой в звёздах. Значит маржа считается не по рейку, а по разнице цены
//  кейса и ожидаемой стоимости выпадения. Тест держит её в коридоре 15–35%:
//  ниже — кейсы работают в убыток, выше — их не станут открывать второй раз.
//  value — цена подарка в звёздах, weight — вес в таблице выпадений.
const CASE_RARITY = ['common', 'common', 'rare', 'epic', 'legendary', 'legendary'];
const CASES = {
  reef: {
    key: 'reef', emoji: '🐚', name: 'Риф', price: 50,
    drops: [
      { emoji: '🫧', name: 'Пузырь',   value: 15,   weight: 55  },
      { emoji: '🌊', name: 'Волна',    value: 25,   weight: 25  },
      { emoji: '🐚', name: 'Ракушка',  value: 50,   weight: 13  },
      { emoji: '🐠', name: 'Рыбка',    value: 100,  weight: 5   },
      { emoji: '🪸', name: 'Коралл',   value: 500,  weight: 1.7 },
      { emoji: '⚓', name: 'Якорь',    value: 1000, weight: 0.3 }
    ]
  },
  deep: {
    key: 'deep', emoji: '🌊', name: 'Глубина', price: 150,
    drops: [
      { emoji: '🌊', name: 'Волна',    value: 25,   weight: 42  },
      { emoji: '🐚', name: 'Ракушка',  value: 50,   weight: 28  },
      { emoji: '🐠', name: 'Рыбка',    value: 100,  weight: 18  },
      { emoji: '🪸', name: 'Коралл',   value: 200,  weight: 8   },
      { emoji: '⚓', name: 'Якорь',    value: 1000, weight: 3.4 },
      { emoji: '🦈', name: 'Акула',    value: 2500, weight: 0.6 }
    ]
  },
  abyss: {
    key: 'abyss', emoji: '🦈', name: 'Бездна', price: 500,
    drops: [
      { emoji: '🐠', name: 'Рыбка',    value: 100,   weight: 36  },
      { emoji: '🪸', name: 'Коралл',   value: 200,   weight: 32  },
      { emoji: '⚓', name: 'Якорь',    value: 500,   weight: 21  },
      { emoji: '🦈', name: 'Акула',    value: 1000,  weight: 8   },
      { emoji: '💎', name: 'Жемчуг',   value: 2500,  weight: 2.5 },
      { emoji: '🔱', name: 'Трезубец', value: 10000, weight: 0.3 }
    ]
  }
};
// Выпадение по seed — так же, как победитель PVP: seed зафиксирован до оплаты,
// раскрывается после, и любой может пересчитать результат сам.
function caseRoll(seed, drops) {
  const roll = parseInt(crypto.createHash('sha256').update('case:' + seed).digest('hex').slice(0, 8), 16) / 0xffffffff;
  const total = drops.reduce((a, d) => a + d.weight, 0);
  let acc = 0;
  for (let i = 0; i < drops.length; i++) {
    acc += drops[i].weight / total;
    if (roll <= acc) return i;
  }
  return drops.length - 1;
}
function casePublic(c) {
  const total = c.drops.reduce((a, d) => a + d.weight, 0);
  return {
    key: c.key, emoji: c.emoji, name: c.name, price: c.price,
    drops: c.drops.map((d, i) => ({
      emoji: d.emoji, name: d.name, value: d.value,
      chance: Math.round((d.weight / total) * 1000) / 10,
      rarity: CASE_RARITY[i] || 'common'
    }))
  };
}

const SHOP = [
  { emoji: '🦈', name: 'Shark NFT', value: 500 }, { emoji: '🐚', name: 'Ракушка', value: 331 },
  { emoji: '🪸', name: 'Коралл',   value: 344 }, { emoji: '🌊', name: 'Волна',   value: 360 },
  { emoji: '🐠', name: 'Рыбка',    value: 334 }, { emoji: '⚓', name: 'Якорь',   value: 356 },
  { emoji: '💎', name: 'Жемчуг',   value: 600 }, { emoji: '🔱', name: 'Трезубец', value: 358 }
];
const BET_OPTIONS = [50, 100, 250];          // историческое (звёзды), уходит вместе с игрой на звёздах

// ============================================================
//  💎 TON — единственная игровая валюта
// ============================================================
//  Все денежные расчёты внутри кода идут в НАНОТОНАХ (целых числах), и только
//  на границе с базой превращаются в десятичные TON. Причина простая: ставки —
//  доли TON, а в JS 0.1 + 0.2 !== 0.3. На банке PVP из нескольких таких долей
//  ошибка становится видимой и накапливается от раунда к раунду. Целые числа
//  убирают её полностью: 1 TON = 1e9 нанотон, а Number точен до 2^53, то есть
//  до ~9 миллионов TON — с запасом на любые балансы этого приложения.
const NANO = 1e9;
function toNano(ton) {                        // 0.1 -> 100000000
  const n = Math.round(Number(ton) * NANO);
  return Number.isFinite(n) ? n : 0;
}
function fromNano(nano) {                     // 100000000 -> 0.1
  return Math.round(Number(nano) || 0) / NANO;
}
// строка для базы: без экспоненциальной записи и без хвоста нулей
function nanoToDb(nano) {
  const neg = nano < 0, a = Math.abs(Math.round(nano));
  const whole = Math.floor(a / NANO), frac = String(a % NANO).padStart(9, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '');
}
const TON_BETS_DEFAULT = [0.1, 0.5, 1];
const TON_MIN_BET_NANO = toNano(0.1);         // минимальная ставка — 0.1 TON
// Вывод только в TON, на кошелёк. Прежние методы (карта, USDT в трёх сетях)
// ушли вместе с гривной: валюта в приложении одна.
const WITHDRAW_METHODS = ['ton'];
const TON_TOPUPS_DEFAULT = [1, 5, 10, 25];   // быстрые суммы пополнения
const TON_MIN_TOPUP = 0.5;

// Адрес TON: дружественный (48 символов base64url), сырой (workchain:hex)
// или доменное имя .ton. Выплату делает человек, поэтому задача проверки —
// отсечь опечатки и мусор, а не заменить собой глаза админа.
function isTonAddress(a) {
  const v = String(a || '').trim();
  if (/^[A-Za-z0-9_-]{48}$/.test(v)) return true;
  if (/^-?\d{1,10}:[0-9a-fA-F]{64}$/.test(v)) return true;
  if (/^[a-z0-9][a-z0-9-]{2,124}\.ton$/i.test(v)) return true;
  return false;
}

// Пакеты STAR_PACKS и CRYPTOBOT_PACKS удалены. Пополнение теперь в TON один
// к одному: сколько пришло, столько и зачислено. Ни курса, ни бонусов за
// объём — а значит и арбитража «занёс дешевле, вывел дороже» не существует.
const CRYPTOBOT_API = 'https://pay.crypt.bot/api/';

// PVP-джекпот: комиссия «дома» (house edge) с банка при выплате победителю.
// Ожидание для игрока = ставка * (1 - PVP_RAKE) — как честная лотерея с рейком.
const PVP_RAKE = 0.05;
const PVP_DURATION_S = 15;       // длительность отсчёта раунда после первой ставки
const PVP_BOT_NAMES = ['sea_wolf', 'krd_777', 'blue_fin', 'reef_king', 'aqua_max', 'tide_88',
  'kraken_x', 'pearl', 'marlin', 'orca_pro', 'deep_one', 'ota_try', 'molodoywq', 'cakt0'];
const PVP_BOT_AV = ['🐙', '🐡', '🐠', '🦑', '🦀', '🐬', '🐳', '🦈', '🐚', '🪼', '🦞', '🐟'];

// ВАЖНО: эти константы живут в области модуля, а не внутри обработчика.
// Внутри они объявлялись ниже обработчиков действий, а те возвращают ответ
// раньше — const до своего объявления недоступна (temporal dead zone), и
// ensurePvpRound падал с ReferenceError, как только раунд становился done.
// Снаружи клиент видел вечно крутящуюся ленту вместо победителя.
//
//  • ANIM_GRACE — сколько держим завершённый раунд, чтобы клиенты доиграли
//    анимацию: поллинг (1.5 с) + вращение (5 с) + развязка (4.6 с) с запасом.
//  • STUCK — резолв двухфазный (countdown -> resolving -> done); если между
//    фазами оборвался вызов, раунд остаётся в resolving. Через столько секунд
//    его можно переклеймить и дорешать.
//  • GIVEUP — если выплата раз за разом не проходит, всё же закрываем раунд:
//    одна сломанная выплата не должна останавливать режим навсегда.
const PVP_ANIM_GRACE_S = 12;
const PVP_STUCK_S = 25;
const PVP_GIVEUP_S = 300;

// Админка. Права определяет ТОЛЬКО сервер по ADMIN_PANEL_IDS — клиент на них не влияет.
//  • ADMIN_SCAN — верхняя граница выборки для агрегатов (суммы балансов, оборот
//    по леджеру считаются в памяти, без изменения схемы БД). Сколько строк реально
//    просмотрено — возвращаем клиенту, чтобы цифра не выглядела точной, когда она
//    упёрлась в потолок.
//  • ADMIN_GRANT_MAX_TON — потолок одного ручного начисления, в TON.
const ADMIN_SCAN = 5000;
const ADMIN_GRANT_MAX_TON = 1000;
function pvpMakeBots(n, betsTon) {
  const used = {}, bots = [];
  for (let i = 0; i < n; i++) {
    let nm; do { nm = PVP_BOT_NAMES[Math.floor(Math.random() * PVP_BOT_NAMES.length)]; } while (used[nm]);
    used[nm] = 1;
    bots.push({
      name: nm, av: PVP_BOT_AV[Math.floor(Math.random() * PVP_BOT_AV.length)],
      stake: toNano(betsTon[Math.floor(Math.random() * betsTon.length)]) * (Math.random() < 0.15 ? 4 : 1)
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

    // Ставка приходит с клиента в TON. Принимаем только значения из серверного
    // списка — клиенту сумму не доверяем, как и всему остальному. Возвращаем
    // нанотоны: дальше все расчёты идут целыми числами.
    function betNano(v, betsTon) {
      const n = toNano(v);
      if (!n || n < TON_MIN_BET_NANO) return 0;
      return betsTon.some((b) => toNano(b) === n) ? n : 0;
    }
    // хватает ли на балансе (баланс из базы — десятичный TON)
    function hasTon(u, nano) { return toNano(u.ton_balance) >= nano; }

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
      min_withdraw_ton: 1, min_topup_ton: TON_MIN_TOPUP, withdraw_hours: 24,
      ton_bets: TON_BETS_DEFAULT, ton_topups: TON_TOPUPS_DEFAULT,
      referral_bonus_ton: 0.05, referral_share: 0.10
    }, (cfgRows[0] && cfgRows[0].data) || {});
    // Список ставок берём из конфига, но чиним: только числа не ниже минимума,
    // без дублей, по возрастанию. Кривая правка в базе иначе открыла бы ставку
    // в ноль или отрицательную — а это прямой путь к печати денег.
    const TON_BETS = (function () {
      const src = Array.isArray(CFG.ton_bets) ? CFG.ton_bets : TON_BETS_DEFAULT;
      const seen = {}, out = [];
      src.map(Number).filter((v) => toNano(v) >= TON_MIN_BET_NANO)
        .sort((a, b) => a - b)
        .forEach((v) => { if (!seen[v]) { seen[v] = 1; out.push(v); } });
      return out.length ? out : TON_BETS_DEFAULT;
    })();
    const TON_TOPUPS = (function () {
      const src = Array.isArray(CFG.ton_topups) ? CFG.ton_topups : TON_TOPUPS_DEFAULT;
      const min = toNano(CFG.min_topup_ton), seen = {}, out = [];
      src.map(Number).filter((v) => toNano(v) >= min).sort((a, b) => a - b)
        .forEach((v) => { if (!seen[v]) { seen[v] = 1; out.push(v); } });
      return out.length ? out : TON_TOPUPS_DEFAULT;
    })();

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
        // Бонус за друга НЕ платим за сам факт перехода по ссылке. Раньше это
        // были игровые гривны, теперь — реальные деньги, а значит регистрация
        // одноразовых аккаунтов ради выплаты становится выгодной. Платим при
        // первом пополнении друга: см. payReferrer().
        tgNotify(BOT, refBy, '👥 Новый друг по вашей ссылке! Бонус придёт, когда он пополнит баланс.');
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
      // заработок с рефералов — только TON: старые строки в грн и звёздах
      // остаются в истории, но в текущий счёт не идут
      const led = await sbGet('shark_ledger?tg_id=eq.' + me.id + '&kind=eq.referral&select=currency,amount');
      let earnedNano = 0;
      led.forEach((l) => { if (l.currency === 'ton') earnedNano += toNano(l.amount); });
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
          minWithdrawTon: Number(CFG.min_withdraw_ton), minTopupTon: Number(CFG.min_topup_ton),
          withdrawHours: Number(CFG.withdraw_hours) || 24,
          referralShare: Number(CFG.referral_share), referralBonusTon: Number(CFG.referral_bonus_ton)
        },
        referrals: {
          count: refs.length, earnedTon: fromNano(earnedNano),
          sharePct: Math.round(CFG.referral_share * 100),
          bonusTon: Number(CFG.referral_bonus_ton), friends
        },
        catalog: {
          roulette: ROUL_PRIZES, shop: SHOP,
          cases: Object.keys(CASES).map((k) => casePublic(CASES[k])),
          bets: TON_BETS, minBet: fromNano(TON_MIN_BET_NANO),
          topups: TON_TOPUPS, minTopup: Number(CFG.min_topup_ton),
          methods: WITHDRAW_METHODS
        },
        refLink: botLink(BOT, user.ref_code)
      });
      return;
    }

    // ---------------------------------------------------------
    //  GAME_BET — рулетка (единый запрос: списываем ставку, исход на сервере)
    // ---------------------------------------------------------
    if (action === 'game_bet') {
      if (body.game !== 'roulette') { json(res, 200, { ok: false, reason: 'bad_game' }); return; }
      const nano = betNano(body.bet, TON_BETS);
      if (!nano) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (!hasTon(user, nano)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      const deb = await applyLedger(me.id, 'ton', nanoToDb(-nano), 'bet', 'roulette', null, { bet: fromNano(nano) });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      // исход: приз — множитель к ставке. Округление вниз, чтобы дом не
      // терял доли нанотона на каждом спине.
      const base = pickWeighted(ROUL_PRIZES);
      const winNano = Math.floor(nano * base.mult);
      if (winNano > 0) {
        await applyLedger(me.id, 'ton', nanoToDb(winNano), 'win', 'roulette', null, { prize: base.name, mult: base.mult, bet: fromNano(nano) });
      }
      await sb('shark_bets', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ tg_id: me.id, game: 'roulette', bet_nano: nano, payout_nano: winNano,
          detail: { prize: base.name, emoji: base.emoji, mult: base.mult } })
      });
      await bumpStats(me.id, { played: 1, wonNano: Math.max(winNano - nano, 0) });
      const fresh = await freshUser();
      json(res, 200, {
        ok: true,
        prize: { emoji: base.emoji, name: base.name, mult: base.mult, win: fromNano(winNano), bet: fromNano(nano) },
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
      const nano = betNano(body.bet, TON_BETS);
      if (!nano) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (!hasTon(user, nano)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

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
      // причина разная для двух сторон: админу нужно настоящее объяснение,
      // обычному игроку незачем знать про админские аккаунты
      if (mixed) { json(res, 200, { ok: false, reason: IS_ADMIN ? 'round_mixed_admin' : 'round_mixed' }); return; }

      // вставляем ставку ПЕРВОЙ — уникальный индекс (round_id, tg_id) защищает
      // от двойного входа при быстром двойном тапе; списываем только если строка
      // реально создалась (не дубликат)
      const betIns = await sb('shark_pvp_bets', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation,resolution=ignore-duplicates' }),
        body: JSON.stringify({ round_id: round.id, tg_id: me.id, name: user.first_name || 'Игрок', av: '🙂', stake: nano })
      });
      const betRow = Array.isArray(betIns.data) ? betIns.data[0] : null;
      if (!betRow) { const st = await pvpRoundState(round); json(res, 200, { ok: false, reason: 'already_joined', round: st, user: publicUser(user) }); return; }
      // списываем ставку; при нехватке средств откатываем вставленную ставку
      const deb = await applyLedger(me.id, 'ton', nanoToDb(-nano), 'bet', 'pvp:' + round.id, null, { bet: fromNano(nano) });
      if (!deb.ok) {
        await sb('shark_pvp_bets?id=eq.' + betRow.id, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
        json(res, 200, { ok: false, reason: 'no_funds' }); return;
      }
      // если это первая ставка — запускаем отсчёт и подсаживаем ботов для оживления
      if (round.status === 'waiting') {
        const bots = pvpMakeBots(1 + Math.floor(Math.random() * 3), TON_BETS);
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
      const nano = betNano(body.bet, TON_BETS);
      if (!nano) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (!hasTon(user, nano)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }
      // закрыть возможные брошенные открытые ставки этого юзера (проигрыш)
      await sb('shark_bets?tg_id=eq.' + me.id + '&game=eq.crash&status=eq.open', {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'done' })
      });
      const deb = await applyLedger(me.id, 'ton', nanoToDb(-nano), 'bet', 'crash', null, { bet: fromNano(nano) });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      // provably-fair точка краша
      const seed = crypto.randomBytes(16).toString('hex');
      const seedHash = crypto.createHash('sha256').update(seed).digest('hex');
      const crashPoint = crashPointFromSeed(seed);
      const ins = await sb('shark_bets', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({
          tg_id: me.id, game: 'crash', bet_nano: nano, payout_nano: 0, status: 'open',
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
          body: JSON.stringify({ status: 'done', payout_nano: 0, server_seed: round.server_seed })
        });
        json(res, 200, { ok: true, busted: true, crashPoint, seed: round.server_seed, user: publicUser(user) });
        return;
      }
      const cashMult = Math.floor(mult * 100) / 100;
      const betNanoVal = Number(round.bet_nano || 0);
      const winNano = Math.floor(betNanoVal * cashMult);      // вниз: доли нанотона остаются дому
      await applyLedger(me.id, 'ton', nanoToDb(winNano), 'win', 'crash:' + roundId, 'crash_win:' + roundId, { mult: cashMult });
      await sb('shark_bets?id=eq.' + roundId, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'done', payout_nano: winNano, detail: Object.assign({}, round.detail, { cashMult }) })
      });
      await bumpStats(me.id, { wonNano: Math.max(winNano - betNanoVal, 0) });
      const fresh = await freshUser();
      json(res, 200, { ok: true, busted: false, mult: cashMult, win: fromNano(winNano), crashPoint, seed: round.server_seed, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  BUY_GIFT — купить подарок за звёзды
    // ---------------------------------------------------------
    if (action === 'buy_gift') {
      // Покупка за звёзды с баланса больше невозможна: баланса в звёздах нет.
      // Подарки переезжают в кейсы, которые оплачиваются счётом в Stars в
      // момент покупки — это Э4. Отвечаем честной причиной, а не «не хватает
      // звёзд»: молчаливо неработающий экран хуже, чем явно закрытый.
      json(res, 200, { ok: false, reason: 'moved_to_cases' });
      return;
    }

    // CREATE_STARS_INVOICE удалён: Telegram Stars больше не пополняют баланс.
    // Звёздами покупаются только кейсы с подарками, и покупка идёт счётом в
    // момент нажатия — баланса в звёздах не существует (см. Э4).

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
      const nano = toNano(body.amount);
      if (!nano || nano < toNano(CFG.min_topup_ton)) {
        json(res, 200, { ok: false, reason: 'below_min', min: Number(CFG.min_topup_ton) }); return;
      }
      const amount = fromNano(nano);
      const r = await fetch(CRYPTOBOT_API + 'createInvoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Token': CB_TOKEN },
        body: JSON.stringify({
          asset: 'TON', amount: String(amount),
          description: 'Shark · пополнение ' + amount + ' TON',
          payload: JSON.stringify({ tg: me.id }), expires_in: 1800
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || !d.result) { json(res, 200, { ok: false, reason: 'invoice_failed' }); return; }
      json(res, 200, {
        ok: true, invoiceId: d.result.invoice_id,
        payUrl: d.result.bot_invoice_url || d.result.pay_url, amount
      });
      return;
    }

    // ---------------------------------------------------------
    //  CRYPTOBOT_CHECK — опрос статуса счёта; при первой оплате зачисляет TON
    //  и платит пригласившему. Идемпотентность по invoice_id: повторные опросы
    //  после зачисления просто возвращают текущий статус.
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
      if (Number(pl.tg) !== me.id) { json(res, 200, { ok: true, status: 'paid', credited: false }); return; }
      // Зачисляем то, что РЕАЛЬНО пришло, а не то, что просили в счёте: если
      // сумма разойдётся, правда на стороне платежа, а не наших ожиданий.
      if (inv.asset !== 'TON') { json(res, 200, { ok: false, reason: 'bad_asset' }); return; }
      const paidNano = toNano(inv.amount);
      if (paidNano <= 0) { json(res, 200, { ok: false, reason: 'bad_amount' }); return; }

      const cr = await applyLedger(me.id, 'ton', nanoToDb(paidNano), 'topup', 'cryptobot', idemKey,
        { amount: fromNano(paidNano), asset: 'TON', invoice: inv.invoice_id });
      if (!cr.ok) { json(res, 200, { ok: false, reason: 'credit_failed' }); return; }
      await payReferrer(user, paidNano, inv.invoice_id);
      const fresh = await freshUser();
      json(res, 200, { ok: true, status: 'paid', credited: true, amount: fromNano(paidNano), user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  WITHDRAW_CREATE — заявка на вывод (ручное подтверждение админом)
    // ---------------------------------------------------------
    if (action === 'withdraw_create') {
      const address = (body.requisites || body.address || '').toString().trim();
      const nano = toNano(body.amount);
      const minNano = toNano(CFG.min_withdraw_ton);
      if (!isTonAddress(address)) { json(res, 200, { ok: false, reason: 'bad_wallet' }); return; }
      if (!nano || nano < minNano) { json(res, 200, { ok: false, reason: 'below_min', min: Number(CFG.min_withdraw_ton) }); return; }
      if (nano > toNano(user.ton_balance)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      // списываем сразу: деньги «заморожены» в заявке, вернём при отклонении
      const deb = await applyLedger(me.id, 'ton', nanoToDb(-nano), 'withdraw', 'pending', null, { address });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      const amount = fromNano(nano);
      const ins = await sb('shark_withdrawals', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ tg_id: me.id, method: 'ton', requisites: address.slice(0, 200), amount_ton: nanoToDb(nano) })
      });
      const wd = Array.isArray(ins.data) ? ins.data[0] : ins.data;

      // карточка админу с кнопками — выплату он делает вручную
      const text = '💸 Заявка на вывод #' + wd.id + '\n\n' +
        '👤 ' + userLabel(user) + '\n' +
        '💎 ' + amount + ' TON\n' +
        '📇 ' + address + '\n\n' +
        'Выплату отправьте ВРУЧНУЮ, затем подтвердите.';
      const sent = await notifyAdmins(BOT, adminIds(), text, withdrawDecisionKb(wd.id));
      if (sent && sent.messageId) {
        await sb('shark_withdrawals?id=eq.' + wd.id, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ admin_msg_id: sent.messageId })
        });
      }
      const fresh = await freshUser();
      json(res, 200, { ok: true, id: wd.id, amount, hours: Number(CFG.withdraw_hours) || 24, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  CASE_OPEN — счёт в Telegram Stars на покупку кейса.
    //  Баланса в звёздах нет: платёж идёт напрямую в Telegram, а мы лишь
    //  заводим заказ. Исход фиксируем ЗДЕСЬ, до оплаты — иначе его можно было
    //  бы подобрать, увидев, кто именно платит. Клиенту сразу отдаём только
    //  хэш seed; сам seed раскроется после оплаты.
    // ---------------------------------------------------------
    if (action === 'case_open') {
      const c = CASES[body.case];
      if (!c) { json(res, 200, { ok: false, reason: 'bad_case' }); return; }

      const seed = crypto.randomBytes(16).toString('hex');
      const seedHash = crypto.createHash('sha256').update(seed).digest('hex');
      const ins = await sb('shark_case_orders', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ tg_id: me.id, case_key: c.key, star_price: c.price, seed, seed_hash: seedHash })
      });
      const order = Array.isArray(ins.data) ? ins.data[0] : ins.data;
      if (!order) { json(res, 200, { ok: false, reason: 'order_failed' }); return; }

      const r = await fetch('https://api.telegram.org/bot' + BOT + '/createInvoiceLink', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Shark · кейс «' + c.name + '»',
          description: 'Открыть кейс и получить подарок Telegram',
          payload: JSON.stringify({ order: order.id, tg: me.id }),
          currency: 'XTR',
          prices: [{ label: 'Кейс «' + c.name + '»', amount: c.price }]
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || !d.result) {
        await sb('shark_case_orders?id=eq.' + order.id, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ status: 'failed' })
        });
        json(res, 200, { ok: false, reason: 'invoice_failed' }); return;
      }
      json(res, 200, { ok: true, orderId: order.id, link: d.result, price: c.price, seedHash });
      return;
    }

    // ---------------------------------------------------------
    //  CASE_RESULT — опрос исхода заказа. Оплату подтверждает Telegram
    //  вебхуком в api/bot.js; клиент просто ждёт, когда заказ станет paid.
    // ---------------------------------------------------------
    if (action === 'case_result') {
      const rows = await sbGet('shark_case_orders?id=eq.' + Number(body.orderId) + '&tg_id=eq.' + me.id + '&select=*');
      const o = rows[0];
      if (!o) { json(res, 200, { ok: false, reason: 'no_order' }); return; }
      if (o.status !== 'paid') { json(res, 200, { ok: true, status: o.status }); return; }

      const c = CASES[o.case_key];
      const idx = c ? caseRoll(o.seed, c.drops) : -1;
      const g = await sbGet('shark_gifts?id=eq.' + Number(o.gift_id) + '&select=*');
      json(res, 200, {
        ok: true, status: 'paid',
        gift: g[0] ? { name: g[0].name, emoji: g[0].emoji, value: g[0].star_value, rarity: g[0].rarity } : null,
        // раскрываем seed: теперь выпадение можно пересчитать самому
        seed: o.seed, seedHash: o.seed_hash, index: idx
      });
      return;
    }

    // ---------------------------------------------------------
    //  GIFTS — инвентарь подарков пользователя
    // ---------------------------------------------------------
    if (action === 'gifts') {
      const rows = await sbGet('shark_gifts?tg_id=eq.' + me.id + '&order=created_at.desc&limit=100&select=id,name,emoji,star_value,rarity,status,case_key,created_at,sent_at');
      json(res, 200, {
        ok: true,
        gifts: rows.map((g) => ({
          id: g.id, name: g.name, emoji: g.emoji, value: Number(g.star_value || 0),
          rarity: g.rarity || 'common', status: g.status, caseKey: g.case_key,
          at: g.created_at, sentAt: g.sent_at
        })),
        totalValue: rows.reduce((a, g) => a + Number(g.star_value || 0), 0)
      });
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
    //  Начисляется TON — единственная валюта приложения. Чужой баланс из
    //  панели не трогаем: цель инструмента — тестировать на своём аккаунте.
    // ---------------------------------------------------------
    if (action === 'admin_grant') {
      if (!IS_ADMIN) { json(res, 200, { ok: false, reason: 'forbidden' }); return; }
      const target = Number(body.tg || me.id);
      const nano = toNano(body.amount);
      if (body.currency && body.currency !== 'ton') { json(res, 200, { ok: false, reason: 'bad_currency' }); return; }
      if (!nano || Math.abs(nano) > toNano(ADMIN_GRANT_MAX_TON)) {
        json(res, 200, { ok: false, reason: 'bad_amount' }); return;
      }
      if (!panelIds().includes(target)) { json(res, 200, { ok: false, reason: 'target_not_admin' }); return; }
      const dst = await sbGet('shark_users?tg_id=eq.' + target + '&select=tg_id');
      if (!dst[0]) { json(res, 200, { ok: false, reason: 'no_user' }); return; }

      // идемпотентность: ключ приходит с клиента, повтор того же ключа не двигает баланс
      const key = String(body.key || '').replace(/[^\w:.-]/g, '').slice(0, 48) || crypto.randomBytes(8).toString('hex');
      const idem = 'admin_grant:' + me.id + ':' + target + ':' + key;
      const r = await applyLedger(target, 'ton', nanoToDb(nano), 'adjust', 'admin:' + me.id, idem,
        { admin_grant: 1, by: Number(me.id), note: String(body.note || '').slice(0, 120) });
      if (!r.ok) { json(res, 200, { ok: false, reason: 'ledger_failed' }); return; }

      const after = await sbGet('shark_users?tg_id=eq.' + target + '&select=*');
      const out = { ok: true, target, amount: fromNano(nano), balance: Number((after[0] && after[0].ton_balance) || 0) };
      if (target === Number(me.id) && after[0]) out.user = publicUser(after[0]);
      json(res, 200, out);
      return;
    }

    json(res, 200, { ok: false, reason: 'unknown_action' });

    // ===== вложенные хелперы, которым нужен доступ к sb/me =====

    // Заплатить пригласившему при пополнении друга: разовый бонус за друга
    // (только с первого пополнения) плюс доля с суммы. Оба начисления
    // идемпотентны по своим ключам, поэтому повторный опрос статуса счёта
    // ничего не задваивает.
    async function payReferrer(invited, paidNano, invoiceId) {
      const inviter = invited && invited.ref_by;
      if (!inviter) return;
      let bonusNano = 0, shareNano = 0;

      // разовый бонус: ключ привязан к другу, а не к счёту — значит платится
      // ровно один раз за всю жизнь этой пары
      const bonusIdem = 'ref_bonus:' + invited.tg_id;
      const seen = await sbGet('shark_ledger?idem=eq.' + encodeURIComponent(bonusIdem) + '&select=id&limit=1');
      if (!seen[0]) {
        bonusNano = toNano(CFG.referral_bonus_ton);
        if (bonusNano > 0) {
          const b = await applyLedger(inviter, 'ton', nanoToDb(bonusNano), 'referral', 'friend:' + invited.tg_id, bonusIdem, { invited: invited.tg_id });
          if (!b.ok) bonusNano = 0;
        }
      }

      shareNano = Math.floor(paidNano * Number(CFG.referral_share || 0));
      if (shareNano > 0) {
        const sr = await applyLedger(inviter, 'ton', nanoToDb(shareNano), 'referral', 'topup:' + invited.tg_id,
          'ref_share:' + invoiceId, { from: invited.tg_id });
        if (!sr.ok) shareNano = 0;
      }

      const total = bonusNano + shareNano;
      if (total <= 0) return;
      await sb('shark_referrals?inviter_tg=eq.' + inviter + '&invited_tg=eq.' + invited.tg_id, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ earned: fromNano(total) })
      });
      tgNotify(BOT, inviter, '💎 Друг пополнил баланс — вам +' + fromNano(total) + ' TON'
        + (bonusNano ? ' (включая бонус за друга)' : ''));
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
    async function ensurePvpRound(forJoin) {
      for (let attempt = 0; attempt < 4; attempt++) {
        let rows = await sbGet('shark_pvp_rounds?order=id.desc&limit=1&select=*');
        let r = rows[0];
        // истёкший отсчёт — разыграть, затем перечитать (станет done)
        if (r && r.status === 'countdown' && r.resolve_at && Date.now() >= new Date(r.resolve_at).getTime()) {
          await resolvePvpRound(r, false);
          rows = await sbGet('shark_pvp_rounds?order=id.desc&limit=1&select=*');
          r = rows[0];
        }
        // зависший resolving — дорешать
        if (r && r.status === 'resolving' && pvpStuckFor(r) > PVP_STUCK_S) {
          await resolvePvpRound(r, true);
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

    // сколько секунд раунд висит в resolving (resolve_at обновляется на каждом клейме)
    function pvpStuckFor(r) {
      const t = Date.parse(r.resolve_at || r.created_at);
      return t ? (Date.now() - t) / 1000 : Infinity;
    }

    // Застолбить право дорешать раунд — ровно одному вызову.
    //  • обычный заход: countdown -> resolving, статус и служит замком;
    //  • повторный по зависшему: статус у всех уже resolving, поэтому замок —
    //    сравнение-и-замена resolve_at (кто первым его сдвинул, тот и решает).
    async function pvpClaim(round, stale) {
      const now = new Date().toISOString();
      let q, body;
      if (stale) {
        q = '&status=eq.resolving' + (round.resolve_at
          ? '&resolve_at=eq.' + encodeURIComponent(round.resolve_at) : '&resolve_at=is.null');
        body = { resolve_at: now };
      } else {
        q = '&status=eq.countdown';
        body = { status: 'resolving', resolve_at: now };
      }
      const c = await sb('shark_pvp_rounds?id=eq.' + round.id + q, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify(body)
      });
      return (Array.isArray(c.data) && c.data[0]) || null;
    }

    // атомарно разыграть истёкший раунд (защита от двойного резолва)
    async function resolvePvpRound(round, stale) {
      const r = await pvpClaim(round, stale);
      if (!r) return;                        // уже кто-то разыгрывает/разыграл
      // всё в нанотонах — целые числа, банк из долей TON складывается точно
      const bets = await sbGet('shark_pvp_bets?round_id=eq.' + r.id + '&order=id.asc&select=*');
      const pot = bets.reduce((a, b) => a + Number(b.stake), 0);
      let winner = null, payout = 0;
      if (bets.length && pot > 0) {
        const wi = pvpWinnerIndex(r.seed, bets, pot);
        const w = bets[wi];
        payout = Math.floor(pot * (1 - Number(r.rake)));
        winner = { name: w.name, av: w.av, tg_id: w.tg_id, stake: Number(w.stake), pct: Math.round((w.stake / pot) * 1000) / 10, payout };
        if (w.tg_id) {
          const cr = await applyLedger(w.tg_id, 'ton', nanoToDb(payout), 'win', 'pvp:' + r.id, 'pvp_win:' + r.id, { pot: fromNano(pot) });
          // Выплата не прошла — раунд не закрываем, следующий проход повторит
          // (ключ идемпотентности не даст заплатить дважды). Но если ломается
          // раз за разом, через PVP_GIVEUP_S всё же закрываем: одна сломанная
          // выплата не должна навсегда останавливать режим. Провал остаётся
          // в winner.payout_failed — видно и в леджере, и в карточке раунда.
          if (!cr.ok) {
            const total = (Date.now() - Date.parse(r.created_at)) / 1000;
            if (total < PVP_GIVEUP_S) return;
            winner.payout_failed = true; winner.payout = 0; payout = 0;
          } else {
            await bumpStats(w.tg_id, { wonNano: Math.max(payout - Number(w.stake), 0) });
          }
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
        stake: fromNano(b.stake), me: Number(b.tg_id) === me.id,
        pct: pot ? Math.round((Number(b.stake) / pot) * 1000) / 10 : 0
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
      const u = await sbGet('shark_users?tg_id=eq.' + tg + '&select=played,won_ton');
      if (!u[0]) return;
      const patch = {};
      if (d.played) patch.played = Number(u[0].played || 0) + d.played;
      // копим чистый выигрыш в TON; won_stars больше не растёт — звёзд в игре нет
      if (d.wonNano) patch.won_ton = nanoToDb(toNano(u[0].won_ton) + d.wonNano);
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
    ton: Number(u.ton_balance || 0), wonTon: Number(u.won_ton || 0),
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
