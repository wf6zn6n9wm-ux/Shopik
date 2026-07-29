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
//           topup_start | topup_check | claim_create | claims | history
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

// ---------------------------------------------------------------------------
//  ИНВЕНТАРЬ ПОДАРКОВ
//
//  Жизненный цикл записи: held → sending → sent. Промежуточное `sending`
//  существует не ради красоты — выдача ручная, и между «админ взял в работу»
//  и «подарок ушёл» проходит время, за которое игрок успевает открыть экран.
//  Без этого состояния ему пришлось бы гадать, забыли о нём или нет.
//
//  Переходы описаны таблицей, а не разбросаны по коду: когда появится
//  автоматическая отправка, добавится источник перехода, а не новая ветка
//  в трёх местах. Назад подарок не откатывается — отправленное не отзывают.
const GIFT_FLOW = { held: ['sending', 'sent'], sending: ['sent'], sent: [] };
function giftCanGo(from, to) { return (GIFT_FLOW[from] || []).includes(to); }

//  Что игрок сможет делать с подарком. Сейчас всё выключено: отправку делает
//  админ вручную, обмена и коллекций ещё нет. Флаги приходят с сервера, а не
//  зашиты в клиент, чтобы включение функции было релизом сервера, а не сборкой
//  приложения — и чтобы старый клиент не показывал кнопку, которой нет.
const GIFT_FEATURES = { send: false, exchange: false, collect: false };

function giftPublic(g) {
  const c = CASES[g.case_key];
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    value: Number(g.star_value || 0),
    rarity: g.rarity || 'common',
    status: g.status,
    caseKey: g.case_key,
    caseName: c ? c.name : null,
    at: g.created_at,
    sentAt: g.sent_at
  };
}


// ============================================================
//  💎 TON — единственная игровая валюта
// ============================================================
//  Все денежные расчёты внутри кода идут в НАНОТОНАХ (целых числах), и только
//  на границе с базой превращаются в десятичные TON. Причина простая: ставки —
//  доли TON, а в JS 0.1 + 0.2 !== 0.3. На банке PVP из нескольких таких долей
//  ошибка становится видимой и накапливается от раунда к раунду. Целые числа
//  убирают её полностью: 1 TON = 1e9 нанотон, а Number точен до 2^53, то есть
//  до ~9 миллионов TON — с запасом на любые балансы этого приложения.
// Игровая валюта — Telegram Stars (⭐), целое число. Дробных звёзд не бывает,
// поэтому весь денежный слой — обычные целые: ни нанотонов, ни округлений на
// границе с базой. Выплата всегда floor: если множитель дал 37.4 ⭐, игрок
// получает 37, а остаток — доход платформы, а не полузвезда в базе.
function starInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}
const STAR_BETS_DEFAULT = [25, 50, 100];
const STAR_MIN_BET = 10;                      // минимальный вход в игру, ⭐

// Наборы звёзд. Продаём НАБОРЫ, а не суммы, и в трёх способах оплаты сразу:
// так у игрока нет ни поля «сколько внести», ни курса на экране — он выбирает
// товар из прайса, как в любой игре. Цена в каждом способе задана вручную,
// поэтому «обмена» с плавающим курсом здесь нет по построению.
//   stars — сколько зачислим; xtr — цена в Telegram Stars; ton/usdt — в @CryptoBot.
const STAR_PACKS = {
  s:  { key: 's',  emoji: '🐚', name: 'Ракушка',  stars: 250,   xtr: 250,   ton: 0.9,  usdt: 4  },
  m:  { key: 'm',  emoji: '🐠', name: 'Стайка',   stars: 750,   xtr: 750,   ton: 2.6,  usdt: 12 },
  l:  { key: 'l',  emoji: '🦈', name: 'Акула',    stars: 2000,  xtr: 2000,  ton: 6.8,  usdt: 31 },
  xl: { key: 'xl', emoji: '💎', name: 'Сокровище', stars: 5000, xtr: 5000,  ton: 16.5, usdt: 75 }
};
const PAY_METHODS = ['xtr', 'ton', 'usdt'];
function packPublic(p) {
  return { key: p.key, emoji: p.emoji, name: p.name, stars: p.stars,
           price: { xtr: p.xtr, ton: p.ton, usdt: p.usdt } };
}

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
//  • ADMIN_GRANT_MAX — потолок одного ручного начисления, в ⭐.
const ADMIN_SCAN = 5000;
const ADMIN_GRANT_MAX = 100000;
function pvpMakeBots(n, bets) {
  const used = {}, bots = [];
  for (let i = 0; i < n; i++) {
    let nm; do { nm = PVP_BOT_NAMES[Math.floor(Math.random() * PVP_BOT_NAMES.length)]; } while (used[nm]);
    used[nm] = 1;
    bots.push({
      name: nm, av: PVP_BOT_AV[Math.floor(Math.random() * PVP_BOT_AV.length)],
      stake: bets[Math.floor(Math.random() * bets.length)] * (Math.random() < 0.15 ? 4 : 1)
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

    // Вход в игру приходит с клиента в ⭐. Принимаем только значения из
    // серверного списка — клиенту сумму не доверяем, как и всему остальному.
    function betStars(v, bets) {
      const n = Number(v);
      // Дробное значение отклоняем, а не округляем: молча списать 25 вместо
      // запрошенных 25.5 — это взять не то, о чём договорились с игроком.
      if (!Number.isInteger(n) || n < STAR_MIN_BET) return 0;
      return bets.includes(n) ? n : 0;
    }
    function hasStars(u, n) { return starInt(u.stars_balance) >= n; }

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
      star_bets: STAR_BETS_DEFAULT,
      claim_min_stars: 500,          // с какого выигрыша можно оставить заявку
      claim_hours: 24,               // за сколько разбираем заявки
      referral_bonus_stars: 50, referral_share_percent: 10
    }, (cfgRows[0] && cfgRows[0].data) || {});
    // Процент реферального вознаграждения от дохода платформы. Зажимаем в
    // 0..100: опечатка в базе (скажем, 1000 вместо 10) иначе платила бы
    // больше, чем платформа заработала, — то есть печатала бы деньги.
    const REF_PCT = Math.min(100, Math.max(0, Number(CFG.referral_share_percent) || 0));
    // Список ставок берём из конфига, но чиним: только числа не ниже минимума,
    // без дублей, по возрастанию. Кривая правка в базе иначе открыла бы ставку
    // в ноль или отрицательную — а это прямой путь к печати денег.
    const STAR_BETS = (function () {
      const src = Array.isArray(CFG.star_bets) ? CFG.star_bets : STAR_BETS_DEFAULT;
      const seen = {}, out = [];
      src.map(starInt).filter((v) => v >= STAR_MIN_BET).sort((a, b) => a - b)
        .forEach((v) => { if (!seen[v]) { seen[v] = 1; out.push(v); } });
      return out.length ? out : STAR_BETS_DEFAULT;
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
      let earnedStars = 0;
      led.forEach((l) => { if (l.currency === 'stars') earnedStars += starInt(l.amount); });
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
          referralSharePercent: REF_PCT, referralBonusTon: Number(CFG.referral_bonus_ton)
        },
        referrals: {
          count: refs.length, earnedStars,
          sharePct: REF_PCT, bonusTon: Number(CFG.referral_bonus_ton), friends
        },
        catalog: {
          roulette: ROUL_PRIZES,
          cases: Object.keys(CASES).map((k) => casePublic(CASES[k])),
          bets: STAR_BETS, minBet: STAR_MIN_BET,
          packs: Object.keys(STAR_PACKS).map((k) => packPublic(STAR_PACKS[k])),
          payMethods: PAY_METHODS
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
      const bet = betStars(body.bet, STAR_BETS);
      if (!bet) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (!hasStars(user, bet)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      const deb = await applyLedger(me.id, 'stars', -bet, 'bet', 'roulette', null, { bet });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      // исход: приз — множитель к ставке. Округление вниз: полузвёзд не бывает.
      const base = pickWeighted(ROUL_PRIZES);
      const win = Math.floor(bet * base.mult);
      if (win > 0) {
        await applyLedger(me.id, 'stars', win, 'win', 'roulette', null, { prize: base.name, mult: base.mult, bet });
      }
      const rIns = await sb('shark_bets', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ tg_id: me.id, game: 'roulette', bet_stars: bet, payout: win,
          detail: { prize: base.name, emoji: base.emoji, mult: base.mult } })
      });
      const rRow = Array.isArray(rIns.data) ? rIns.data[0] : rIns.data;
      await bumpStats(me.id, { played: 1, won: Math.max(win - bet, 0) });
      // доход платформы по спину = ставка − выплата; ключ привязан к строке
      // ставки, поэтому повторить начисление невозможно
      if (rRow) await settleGameRevenue(user, bet, win, 'ref_rev:roul:' + rRow.id, { game: 'roulette' });
      const fresh = await freshUser();
      json(res, 200, {
        ok: true,
        prize: { emoji: base.emoji, name: base.name, mult: base.mult, win, bet },
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
      const bet = betStars(body.bet, STAR_BETS);
      if (!bet) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (!hasStars(user, bet)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

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
        body: JSON.stringify({ round_id: round.id, tg_id: me.id, name: user.first_name || 'Игрок', av: '🙂', stake: bet })
      });
      const betRow = Array.isArray(betIns.data) ? betIns.data[0] : null;
      if (!betRow) { const st = await pvpRoundState(round); json(res, 200, { ok: false, reason: 'already_joined', round: st, user: publicUser(user) }); return; }
      // списываем ставку; при нехватке средств откатываем вставленную ставку
      const deb = await applyLedger(me.id, 'stars', -bet, 'bet', 'pvp:' + round.id, null, { bet });
      if (!deb.ok) {
        await sb('shark_pvp_bets?id=eq.' + betRow.id, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
        json(res, 200, { ok: false, reason: 'no_funds' }); return;
      }
      // если это первая ставка — запускаем отсчёт и подсаживаем ботов для оживления
      if (round.status === 'waiting') {
        const bots = pvpMakeBots(1 + Math.floor(Math.random() * 3), STAR_BETS);
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
      const bet = betStars(body.bet, STAR_BETS);
      if (!bet) { json(res, 200, { ok: false, reason: 'bad_bet' }); return; }
      if (!hasStars(user, bet)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }
      // Закрыть брошенные открытые ставки: игрок ушёл, не забрав — ставка
      // осталась платформе, значит это тоже завершённая сессия с доходом.
      const abandoned = await sbGet('shark_bets?tg_id=eq.' + me.id + '&game=eq.crash&status=eq.open&select=id,bet_stars');
      if (abandoned.length) {
        await sb('shark_bets?tg_id=eq.' + me.id + '&game=eq.crash&status=eq.open', {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ status: 'done' })
        });
        for (const ab of abandoned) {
          await settleGameRevenue(user, starInt(ab.bet_stars), 0, 'ref_rev:crash:' + ab.id, { game: 'crash', abandoned: true });
        }
      }
      const deb = await applyLedger(me.id, 'stars', -bet, 'bet', 'crash', null, { bet });
      if (!deb.ok) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

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
        // не успел — ставка целиком остаётся платформе
        await settleGameRevenue(user, starInt(round.bet_stars), 0, 'ref_rev:crash:' + roundId, { game: 'crash', busted: true });
        json(res, 200, { ok: true, busted: true, crashPoint, seed: round.server_seed, user: publicUser(user) });
        return;
      }
      const cashMult = Math.floor(mult * 100) / 100;
      const betVal = starInt(round.bet_stars);
      const win = Math.floor(betVal * cashMult);              // вниз: полузвёзд не бывает
      await applyLedger(me.id, 'stars', win, 'win', 'crash:' + roundId, 'crash_win:' + roundId, { mult: cashMult });
      await sb('shark_bets?id=eq.' + roundId, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'done', payout: win, detail: Object.assign({}, round.detail, { cashMult }) })
      });
      await bumpStats(me.id, { won: Math.max(win - betVal, 0) });
      // забрал по множителю: доход платформы = ставка − выплата, обычно минус,
      // тогда рефереру не идёт ничего
      await settleGameRevenue(user, betVal, win, 'ref_rev:crash:' + roundId, { game: 'crash', mult: cashMult });
      const fresh = await freshUser();
      json(res, 200, { ok: true, busted: false, mult: cashMult, win, crashPoint, seed: round.server_seed, user: publicUser(fresh) });
      return;
    }

    // CREATE_STARS_INVOICE удалён: Telegram Stars больше не пополняют баланс.
    // Звёздами покупаются только кейсы с подарками, и покупка идёт счётом в
    // момент нажатия — баланса в звёздах не существует (см. Э4).

    // ---------------------------------------------------------
    //  TOPUP_START — купить набор звёзд. Способ оплаты выбирает игрок, но
    //  зачисляется всегда одно и то же: звёзды из набора. Курса нет, потому
    //  что нет пересчёта — у набора просто три цены, как у товара в трёх
    //  валютах. Значит и арбитража «занёс дешевле, забрал дороже» не бывает.
    // ---------------------------------------------------------
    if (action === 'topup_start') {
      const pack = STAR_PACKS[String(body.pack || '')];
      const method = PAY_METHODS.includes(body.method) ? body.method : null;
      if (!pack) { json(res, 200, { ok: false, reason: 'bad_pack' }); return; }
      if (!method) { json(res, 200, { ok: false, reason: 'bad_method' }); return; }

      // Оплата звёздами Telegram: счёт в XTR, зачисление — вебхуком бота.
      if (method === 'xtr') {
        const ins = await sb('shark_topups', {
          method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
          body: JSON.stringify({ tg_id: me.id, pack_key: pack.key, stars: pack.stars, method: 'xtr', price: pack.xtr })
        });
        const order = Array.isArray(ins.data) ? ins.data[0] : ins.data;
        if (!order) { json(res, 200, { ok: false, reason: 'order_failed' }); return; }
        const r = await fetch('https://api.telegram.org/bot' + BOT + '/createInvoiceLink', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Shark · ' + pack.name,
            description: pack.stars + ' ⭐ на игровой баланс',
            payload: JSON.stringify({ topup: order.id, tg: me.id }),
            currency: 'XTR',
            prices: [{ label: pack.name, amount: pack.xtr }]
          })
        });
        const d = await r.json().catch(() => ({}));
        if (!d || !d.ok || !d.result) {
          await sb('shark_topups?id=eq.' + order.id, {
            method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
            body: JSON.stringify({ status: 'failed' })
          });
          json(res, 200, { ok: false, reason: 'invoice_failed' }); return;
        }
        json(res, 200, { ok: true, method: 'xtr', orderId: order.id, link: d.result, stars: pack.stars });
        return;
      }

      // Оплата через @CryptoBot (TON или USDT): счёт там, зачисление — ленивой
      // проверкой статуса, как резолв PVP-раундов.
      const CB_TOKEN = env('CRYPTOBOT_TOKEN');
      if (!CB_TOKEN) { json(res, 200, { ok: false, reason: 'not_configured' }); return; }
      const asset = method === 'ton' ? 'TON' : 'USDT';
      const price = method === 'ton' ? pack.ton : pack.usdt;
      const r = await fetch(CRYPTOBOT_API + 'createInvoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Token': CB_TOKEN },
        body: JSON.stringify({
          asset, amount: String(price),
          description: 'Shark · ' + pack.name + ' (' + pack.stars + ' ⭐)',
          // pack в payload, чтобы зачислить именно то, что купили, даже если
          // прайс на сервере поменяется, пока счёт висит неоплаченным
          payload: JSON.stringify({ tg: me.id, pack: pack.key, stars: pack.stars }),
          expires_in: 1800
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || !d.result) { json(res, 200, { ok: false, reason: 'invoice_failed' }); return; }
      json(res, 200, {
        ok: true, method, invoiceId: d.result.invoice_id,
        payUrl: d.result.bot_invoice_url || d.result.pay_url,
        stars: pack.stars
      });
      return;
    }

    // ---------------------------------------------------------
    //  TOPUP_CHECK — опрос счёта @CryptoBot; при первой оплате зачисляет
    //  звёзды набора. Идемпотентность по invoice_id.
    // ---------------------------------------------------------
    if (action === 'topup_check') {
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
      if (already[0]) { const fr = await freshUser(); json(res, 200, { ok: true, status: 'paid', credited: true, user: publicUser(fr) }); return; }

      let pl = {}; try { pl = JSON.parse(inv.payload || '{}'); } catch (e) {}
      if (Number(pl.tg) !== me.id) { json(res, 200, { ok: true, status: 'paid', credited: false }); return; }
      // Сколько звёзд начислить, берём из payload, а не из текущего прайса:
      // счёт мог висеть, пока цены менялись, и игрок должен получить купленное.
      const stars = starInt(pl.stars);
      if (stars <= 0) { json(res, 200, { ok: false, reason: 'bad_amount' }); return; }

      const cr = await applyLedger(me.id, 'stars', stars, 'topup', 'pack:' + (pl.pack || '?'), idemKey,
        { stars, paid: inv.amount, asset: inv.asset, invoice: inv.invoice_id });
      if (!cr.ok) { json(res, 200, { ok: false, reason: 'credit_failed' }); return; }
      await payReferrer(user, stars, inv.invoice_id);
      const fresh = await freshUser();
      json(res, 200, { ok: true, status: 'paid', credited: true, stars, user: publicUser(fresh) });
      return;
    }

    // ---------------------------------------------------------
    //  CLAIM_CREATE — заявка на получение выигрыша.
    //
    //  Здесь НЕ происходит никакой выплаты и никакого списания «в обмен»:
    //  действие только фиксирует обращение и возвращает ссылку на бота, где
    //  заявку разбирает человек. Приложение потом показывает лишь статус.
    //
    //  Звёзды при этом резервируются, а не «конвертируются»: пока заявка на
    //  рассмотрении, ими нельзя играть, иначе один и тот же выигрыш можно
    //  было бы предъявить дважды. Отказ по заявке возвращает резерв.
    // ---------------------------------------------------------
    if (action === 'claim_create') {
      const amount = starInt(body.amount);
      const min = starInt(CFG.claim_min_stars) || 500;
      if (!amount || amount < min) { json(res, 200, { ok: false, reason: 'below_min', min }); return; }
      if (!hasStars(user, amount)) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      // одна открытая заявка за раз: две параллельные — верный способ запутать
      // и игрока, и того, кто их разбирает
      const open = await sbGet('shark_claims?tg_id=eq.' + me.id + '&status=in.(new,in_review)&select=id&limit=1');
      if (open[0]) { json(res, 200, { ok: false, reason: 'already_open', id: open[0].id }); return; }

      const res1 = await applyLedger(me.id, 'stars', -amount, 'claim_hold', 'pending', null, { amount });
      if (!res1.ok) { json(res, 200, { ok: false, reason: 'no_funds' }); return; }

      const ins = await sb('shark_claims', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify({ tg_id: me.id, stars: amount, note: String(body.note || '').slice(0, 200) })
      });
      const cl = Array.isArray(ins.data) ? ins.data[0] : ins.data;
      if (!cl) {
        // не смогли записать заявку — резерв возвращаем сразу, молча терять нельзя
        await applyLedger(me.id, 'stars', amount, 'claim_return', 'failed', null, { reason: 'insert_failed' });
        json(res, 200, { ok: false, reason: 'create_failed' }); return;
      }

      const text = '🏆 Заявка на выигрыш #' + cl.id + '\n\n' +
        '👤 ' + userLabel(user) + '\n' +
        '⭐ ' + amount + '\n' +
        (cl.note ? '📝 ' + cl.note + '\n' : '') +
        '\nРазберите вручную, затем отметьте.';
      const sent = await notifyAdmins(BOT, adminIds(), text, claimDecisionKb(cl.id));
      if (sent && sent.messageId) {
        await sb('shark_claims?id=eq.' + cl.id, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ admin_msg_id: sent.messageId })
        });
      }
      const fresh = await freshUser();
      json(res, 200, {
        ok: true, id: cl.id, stars: amount,
        hours: starInt(CFG.claim_hours) || 24,
        botLink: 'https://t.me/' + (env('BOT_USERNAME') || '') + '?start=claim_' + cl.id,
        user: publicUser(fresh)
      });
      return;
    }

    // ---------------------------------------------------------
    //  CLAIMS — статус и история заявок игрока (только чтение)
    // ---------------------------------------------------------
    if (action === 'claims') {
      const rows = await sbGet('shark_claims?tg_id=eq.' + me.id + '&order=created_at.desc&limit=50&select=id,stars,status,note,created_at,decided_at');
      json(res, 200, {
        ok: true,
        minStars: starInt(CFG.claim_min_stars) || 500,
        hours: starInt(CFG.claim_hours) || 24,
        claims: rows.map((c) => ({
          id: c.id, stars: starInt(c.stars), status: c.status,
          note: c.note || '', at: c.created_at, decidedAt: c.decided_at
        }))
      });
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
      const rows = await sbGet('shark_gifts?tg_id=eq.' + me.id + '&order=created_at.desc&limit=200&select=id,name,emoji,star_value,rarity,status,case_key,created_at,sent_at');
      const gifts = rows.map(giftPublic);
      // Счётчики считаем здесь, а не на клиенте: список обрезан лимитом, и
      // клиентская сумма по видимым карточкам врала бы у активного игрока.
      const counts = { total: gifts.length, held: 0, sending: 0, sent: 0 };
      let waiting = 0;
      for (const g of gifts) {
        if (counts[g.status] != null) counts[g.status]++;
        if (g.status !== 'sent') waiting++;
      }
      json(res, 200, {
        ok: true,
        gifts,
        counts,
        waiting,
        features: GIFT_FEATURES,
        totalValue: gifts.reduce((a, g) => a + g.value, 0),
        // ценность того, что ещё у нас на руках — это и есть наш долг игроку
        pendingValue: gifts.reduce((a, g) => a + (g.status === 'sent' ? 0 : g.value), 0)
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

      // Суммы балансов — на месте, ограниченной выборкой (без изменения схемы).
      // Складываем в нанотонах: 20 000 десятичных балансов в double дали бы
      // расхождение с базой уже в третьем знаке.
      const bal = await sbGet('shark_users?select=stars_balance&limit=' + ADMIN_SCAN);
      let held = 0;
      bal.forEach((u) => { held += starInt(u.stars_balance); });

      // Оборот за 7 дней: только TON. Строки старой экономики в леджере
      // остались, но в сводку не идут — иначе валюты разных эпох сложатся.
      const led = await sbGet('shark_ledger?created_at=gte.' + d7 + '&currency=eq.stars&select=amount,kind&order=created_at.desc&limit=' + ADMIN_SCAN);
      const flow = {};
      led.forEach((l) => { const k = l.kind || 'adjust'; flow[k] = (flow[k] || 0) + starInt(l.amount); });
      const betsSum = -(flow.bet || 0);                       // ставки уходят минусом
      const winsSum = flow.win || 0;

      // Звёзды, зарезервированные в открытых заявках: с баланса уже сняты,
      // но ещё принадлежат игроку — пока заявку не разобрали.
      const cl = await sbGet('shark_claims?status=in.(new,in_review)&select=stars&limit=' + ADMIN_SCAN);
      let heldInClaims = 0;
      cl.forEach((c) => { heldInClaims += starInt(c.stars); });

      json(res, 200, {
        ok: true,
        stats: {
          users, new24h, new7d, active24h,
          openClaims: cl.length,
          starsHeld: held,
          starsInClaims: heldInClaims,
          bets7d: betsSum,
          wins7d: winsSum,
          rake7d: betsSum - winsSum,                          // что осталось платформе
          topups7d: flow.topup || 0,
          grants7d: flow.adjust || 0,                         // ручные начисления
          referral7d: flow.referral || 0,                     // начислено рефералам
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
      const base = 'shark_users?select=tg_id,username,first_name,lang,stars_balance,won_stars,played,banned,created_at,last_seen' + filter;
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
          stars: starInt(u.stars_balance),
          wonStars: starInt(u.won_stars),
          played: Number(u.played || 0),
          banned: !!u.banned,
          isAdmin: adm.includes(Number(u.tg_id)),
          createdAt: u.created_at,
          lastSeen: u.last_seen
        }))
      });
      return;
    }

    // ---------------------------------------------------------
    //  ADMIN_GIFTS — очередь ручной выдачи подарков
    //  По умолчанию показываем только невыданные: это рабочий список, а не
    //  архив. Архив доступен явным фильтром, чтобы можно было проверить,
    //  что именно и когда ушло игроку.
    // ---------------------------------------------------------
    if (action === 'admin_gifts') {
      if (!IS_ADMIN) { json(res, 200, { ok: false, reason: 'forbidden' }); return; }
      const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100);
      const offset = Math.max(Number(body.offset) || 0, 0);
      // pending — held + sending: всё, что ещё должно уйти игроку
      const scope = body.scope === 'sent' ? 'sent' : body.scope === 'all' ? 'all' : 'pending';
      const filter = scope === 'sent' ? '&status=eq.sent'
        : scope === 'all' ? ''
          : '&status=in.(held,sending)';
      // невыданные — по возрастанию: первым разбираем то, что ждёт дольше всех
      const order = scope === 'pending' ? 'created_at.asc' : 'created_at.desc';

      const base = 'shark_gifts?select=id,tg_id,name,emoji,star_value,rarity,status,case_key,created_at,sent_at' + filter;
      const total = await sbCount(base);
      const rows = await sbGet(base + '&order=' + order + '&limit=' + limit + '&offset=' + offset);
      const pending = await sbCount('shark_gifts?select=id&status=in.(held,sending)');

      // одним запросом на всю страницу, а не по игроку на карточку
      const ids = Array.from(new Set(rows.map((g) => Number(g.tg_id)).filter(Boolean)));
      const owners = ids.length
        ? await sbGet('shark_users?tg_id=in.(' + ids.join(',') + ')&select=tg_id,username,first_name')
        : [];
      const byId = {};
      for (const u of owners) byId[Number(u.tg_id)] = u;

      json(res, 200, {
        ok: true, total, pending, limit, offset, scope,
        gifts: rows.map((g) => {
          const u = byId[Number(g.tg_id)];
          return Object.assign(giftPublic(g), {
            tg_id: Number(g.tg_id),
            player: (u && u.first_name) || '',
            username: (u && u.username) || ''
          });
        })
      });
      return;
    }

    // ---------------------------------------------------------
    //  ADMIN_GIFT_STATUS — отметить ход ручной выдачи
    //  Переход делаем условным PATCH'ем по текущему статусу: если админ успел
    //  нажать «отправлен» из бота, второе нажатие из панели не перезапишет
    //  время выдачи и не пошлёт игроку второе уведомление.
    // ---------------------------------------------------------
    if (action === 'admin_gift_status') {
      if (!IS_ADMIN) { json(res, 200, { ok: false, reason: 'forbidden' }); return; }
      const id = Number(body.id);
      const to = String(body.status || '');
      if (!id) { json(res, 200, { ok: false, reason: 'bad_id' }); return; }
      if (!GIFT_FLOW[to]) { json(res, 200, { ok: false, reason: 'bad_status' }); return; }

      const cur = await sbGet('shark_gifts?id=eq.' + id + '&select=*');
      const g = cur[0];
      if (!g) { json(res, 200, { ok: false, reason: 'no_gift' }); return; }
      if (g.status === to) { json(res, 200, { ok: true, gift: giftPublic(g), changed: false }); return; }
      if (!giftCanGo(g.status, to)) { json(res, 200, { ok: false, reason: 'bad_transition', status: g.status }); return; }

      const patch = { status: to, sent_by: Number(me.id) };
      if (to === 'sent') patch.sent_at = new Date().toISOString();
      const upd = await sb('shark_gifts?id=eq.' + id + '&status=eq.' + g.status, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
        body: JSON.stringify(patch)
      });
      const row = Array.isArray(upd.data) ? upd.data[0] : null;
      // фильтр не совпал — статус увели из-под нас; отдаём то, что стало
      if (!row) {
        const now = await sbGet('shark_gifts?id=eq.' + id + '&select=*');
        json(res, 200, now[0]
          ? { ok: true, gift: giftPublic(now[0]), changed: false }
          : { ok: false, reason: 'no_gift' });
        return;
      }

      if (to === 'sent') await notifyGiftSent(row);
      json(res, 200, { ok: true, gift: giftPublic(row), changed: true });
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
      const amount = starInt(body.amount);
      if (!amount || Math.abs(amount) > ADMIN_GRANT_MAX) {
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
      const out = { ok: true, target, amount, balance: starInt(after[0] && after[0].stars_balance) };
      if (target === Number(me.id) && after[0]) out.user = publicUser(after[0]);
      json(res, 200, out);
      return;
    }

    json(res, 200, { ok: false, reason: 'unknown_action' });

    // ===== вложенные хелперы, которым нужен доступ к sb/me =====

    // Сообщить игроку, что подарок ушёл. Объявлено function, а не const:
    // хелперы живут ниже обработчиков, и стрелка в const попала бы в мёртвую
    // зону — ровно та ошибка, что однажды уронила PVP.
    async function notifyGiftSent(g) {
      if (!BOT || !g || !g.tg_id) return;
      const c = CASES[g.case_key];
      await tgNotify(BOT, g.tg_id,
        '🎁 Подарок отправлен!\n\n' + (g.emoji || '') + ' ' + g.name +
        (c ? '\nКейс «' + c.name + '»' : '') +
        '\n\nЗаберите его в чате с Telegram.');
    }

    // Заплатить пригласившему долю от ДОХОДА ПЛАТФОРМЫ, который принёс
    // приглашённый игрок. Источник выплаты — рейк, а не депозит: платим из
    // того, что заработали, поэтому реферальная программа не может уйти в
    // минус независимо от поведения игрока.
    //
    //  revenue — доход платформы по конкретной завершённой сессии, в ⭐.
    //  Ноль или минус (игрок выиграл) — не платим ничего.
    //  idem — ключ, привязанный к самой сессии, поэтому повторная обработка
    //  того же раунда не начисляет второй раз.
    //
    //  Инвариант: выплата = floor(доход × процент / 100) при проценте не выше
    //  100, значит она НИКОГДА не превышает доход по этой сессии.
    async function payRefRevenue(invitedTg, inviterTg, revenue, idem, meta) {
      if (!inviterTg || !(revenue > 0) || REF_PCT <= 0) return 0;
      const cut = Math.floor(revenue * REF_PCT / 100);
      if (cut <= 0 || cut > revenue) return 0;          // страховка на случай кривого процента
      const r = await applyLedger(inviterTg, 'stars', cut, 'referral',
        'revenue:' + invitedTg, idem, Object.assign({ from: invitedTg, revenue, pct: REF_PCT }, meta || {}));
      return r.ok ? cut : 0;
    }

    // Заплатить разовый бонус за друга при его первом пополнении. Сам процент
    // с пополнений больше не платится: он шёл из депозита, то есть из денег,
    // которые платформа ещё не заработала.
    async function payReferrer(invited, paidStars, invoiceId) {
      const inviter = invited && invited.ref_by;
      if (!inviter) return;
      let bonus = 0;

      // разовый бонус: ключ привязан к другу, а не к счёту — значит платится
      // ровно один раз за всю жизнь этой пары
      const bonusIdem = 'ref_bonus:' + invited.tg_id;
      const seen = await sbGet('shark_ledger?idem=eq.' + encodeURIComponent(bonusIdem) + '&select=id&limit=1');
      if (!seen[0]) {
        bonus = starInt(CFG.referral_bonus_stars);
        if (bonus > 0) {
          const b = await applyLedger(inviter, 'stars', bonus, 'referral', 'friend:' + invited.tg_id, bonusIdem, { invited: invited.tg_id });
          if (!b.ok) bonus = 0;
        }
      }

      if (bonus <= 0) return;
      await bumpRefEarned(inviter, invited.tg_id, bonus);
      tgNotify(BOT, inviter, '⭐ Друг первый раз пополнил баланс — вам бонус +' + bonus);
    }

    // накопленный заработок пары в карточке реферала
    async function bumpRefEarned(inviterTg, invitedTg, add) {
      if (!(add > 0)) return;
      const rows = await sbGet('shark_referrals?inviter_tg=eq.' + inviterTg + '&invited_tg=eq.' + invitedTg + '&select=earned');
      const cur = rows[0] ? starInt(rows[0].earned) : 0;
      await sb('shark_referrals?inviter_tg=eq.' + inviterTg + '&invited_tg=eq.' + invitedTg, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ earned: cur + add })
      });
    }

    // Выплата рефереру по завершённой игровой сессии одного игрока.
    // Один вход для краша и рулетки: обе считают доход одинаково —
    // ставка минус выплата.
    async function settleGameRevenue(u, bet, payout, idem, meta) {
      if (!u || !u.ref_by) return 0;
      const revenue = bet - payout;
      const paid = await payRefRevenue(u.tg_id, u.ref_by, revenue, idem, meta);
      if (paid > 0) await bumpRefEarned(u.ref_by, u.tg_id, paid);
      return paid;
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
          const cr = await applyLedger(w.tg_id, 'stars', payout, 'win', 'pvp:' + r.id, 'pvp_win:' + r.id, { pot });
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
            await bumpStats(w.tg_id, { won: Math.max(payout - starInt(w.stake), 0) });
          }
        }
      }
      // всем реальным участникам +1 к «сыграно»
      for (const b of bets) { if (b.tg_id) await bumpStats(b.tg_id, { played: 1 }); }

      // Реферальные выплаты по раунду. Доход платформы здесь — удержанный
      // рейк (банк минус выплата победителю). Между участниками он делится
      // пропорционально ставкам: чей вклад в банк больше, тот и принёс больше
      // рейка. Сумма долей не превышает удержанного, потому что доли — части
      // одного и того же числа.
      const rakeKept = pot - payout;
      if (rakeKept > 0 && pot > 0) {
        const real = bets.filter((b) => b.tg_id);
        if (real.length) {
          const us = await sbGet('shark_users?tg_id=in.(' + real.map((b) => b.tg_id).join(',') + ')&select=tg_id,ref_by');
          const refOf = {}; us.forEach((u) => { if (u.ref_by) refOf[u.tg_id] = u.ref_by; });
          for (const b of real) {
            const inviter = refOf[b.tg_id];
            if (!inviter) continue;
            const mine = Math.floor(rakeKept * starInt(b.stake) / pot);
            const paidRef = await payRefRevenue(b.tg_id, inviter, mine, 'ref_rev:pvp:' + r.id + ':' + b.tg_id,
              { game: 'pvp', round: r.id });
            if (paidRef > 0) await bumpRefEarned(inviter, b.tg_id, paidRef);
          }
        }
      }
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
        stake: starInt(b.stake), me: Number(b.tg_id) === me.id,
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
      const u = await sbGet('shark_users?tg_id=eq.' + tg + '&select=played,won_stars');
      if (!u[0]) return;
      const patch = {};
      if (d.played) patch.played = Number(u[0].played || 0) + d.played;
      // копим чистый выигрыш в TON; won_stars больше не растёт — звёзд в игре нет
      if (d.won) patch.won_stars = starInt(u[0].won_stars) + d.won;
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
// Наружу отдаём ровно одну валюту. Старые money/stars убраны намеренно:
// пока они приходили, любой экран мог их случайно показать.
function publicUser(u) {
  return {
    tg_id: u.tg_id, username: u.username, first_name: u.first_name, lang: u.lang,
    stars: starInt(u.stars_balance), wonStars: starInt(u.won_stars),
    played: Number(u.played || 0),
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
// Кнопки на карточке заявки на выигрыш. Решение принимает человек — здесь
// только отметка результата, никакой автоматической выдачи.
function claimDecisionKb(id) {
  return { inline_keyboard: [[
    { text: '✅ Выдано', callback_data: 'cl_ok:' + id },
    { text: '❌ Отклонить', callback_data: 'cl_no:' + id }
  ]] };
}

// экспорт для bot.js и тестов
module.exports.verifyInitData = verifyInitData;
module.exports.crashPointFromSeed = crashPointFromSeed;
