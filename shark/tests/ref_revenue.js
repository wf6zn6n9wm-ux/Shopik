// Рефералка от дохода платформы: PVP-рейк, краш, рулетка.
// Главный инвариант — выплата рефереру никогда не больше дохода по сессии.
const { app } = require('./paths');
const crypto = require('crypto');
const BOT = 'test:BOTTOKEN';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.BOT_TOKEN = BOT;
process.env.ADMIN_IDS = '';
process.env.ADMIN_PANEL_IDS = '';

const NANO = 1e9;
const nano = (t) => Math.round(t * NANO);
const ton = (n) => Math.round(n) / NANO;

function initData(u) {
  const p = new URLSearchParams();
  p.set('user', JSON.stringify(u));
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const dcs = Array.from(p.entries()).map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

// PLAYER 101 приглашён рефером 900. PLAYER 102 — без реферера.
let DB, LEDGER, CFG_DATA;
function reset(cfg) {
  LEDGER = []; CFG_DATA = cfg || {};
  const mk = (id, refBy) => ({ tg_id: id, first_name: 'U' + id, username: 'u' + id, lang: 'ru',
    stars_balance: 100000, won_stars: 0, played: 0,
    banned: false, ref_by: refBy, ref_code: 'r' + id,
    created_at: new Date().toISOString(), last_seen: new Date().toISOString() });
  DB = { users: [mk(101, 900), mk(102, null), mk(900, null)],
         rounds: [], bets: [], gameBets: [], refs: [{ inviter_tg: 900, invited_tg: 101, earned: 0 }],
         nextRound: 1, nextBet: 1, nextGb: 1 };
}
const balOf = (id) => Number(DB.users.find((u) => u.tg_id === id).stars_balance);
const refPays = () => LEDGER.filter((l) => l.kind === 'referral');
const refTotal = () => refPays().reduce((a, l) => a + (l.amount), 0);

globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: new Headers() });
  if (url.startsWith('https://api.telegram.org/')) return J({ ok: true, result: { message_id: 1 } });

  const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), qs = u.searchParams;
  if (path === 'shark_config') return J([{ data: CFG_DATA }]);
  if (path === 'shark_ledger') {
    const idem = qs.get('idem');
    if (idem) { const w = decodeURIComponent(idem.replace('eq.', '')); return J(LEDGER.filter((l) => l.idem === w).map(() => ({ id: 1 }))); }
    return J([]);
  }
  if (path === 'shark_referrals') {
    if (opts.method === 'POST') { DB.refs.push(JSON.parse(opts.body)); return J([]); }
    if (opts.method === 'PATCH') {
      const inv = (qs.get('inviter_tg') || '').replace('eq.', ''), ivd = (qs.get('invited_tg') || '').replace('eq.', '');
      const b = JSON.parse(opts.body || '{}');
      DB.refs.filter((r) => String(r.inviter_tg) === inv && String(r.invited_tg) === ivd).forEach((r) => Object.assign(r, b));
      return J([]);
    }
    const inv = (qs.get('inviter_tg') || '').replace('eq.', ''), ivd = (qs.get('invited_tg') || '').replace('eq.', '');
    return J(DB.refs.filter((r) => (!inv || String(r.inviter_tg) === inv) && (!ivd || String(r.invited_tg) === ivd)));
  }
  if (path === 'shark_users') {
    if (opts.method === 'PATCH') {
      const id = (qs.get('tg_id') || '').replace('eq.', ''); const b = JSON.parse(opts.body || '{}');
      const x = DB.users.find((v) => String(v.tg_id) === id); if (x) Object.assign(x, b); return J([]);
    }
    if (opts.method === 'POST') return J([]);
    let rows = DB.users.slice();
    const id = qs.get('tg_id');
    if (id && id.startsWith('eq.')) rows = rows.filter((x) => String(x.tg_id) === id.slice(3));
    if (id && id.startsWith('in.')) { const set = id.slice(4, -1).split(','); rows = rows.filter((x) => set.includes(String(x.tg_id))); }
    return J(rows.map((r) => Object.assign({}, r)));
  }
  if (path === 'shark_bets') {
    if (opts.method === 'POST') { const b = Object.assign({ id: DB.nextGb++ }, JSON.parse(opts.body)); DB.gameBets.push(b); return J([b]); }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const st = (qs.get('status') || '').replace('eq.', '');
      const b = JSON.parse(opts.body || '{}');
      DB.gameBets.filter((x) => (!id || x.id === id) && (!st || x.status === st)).forEach((x) => Object.assign(x, b));
      return J([]);
    }
    const id = Number((qs.get('id') || '').replace('eq.', ''));
    const st = (qs.get('status') || '').replace('eq.', '');
    const tg = (qs.get('tg_id') || '').replace('eq.', '');
    return J(DB.gameBets.filter((x) => (!id || x.id === id) && (!st || x.status === st) && (!tg || String(x.tg_id) === tg))
      .map((x) => Object.assign({}, x)));
  }
  if (path === 'shark_pvp_rounds') {
    if (opts.method === 'POST') {
      const r = Object.assign({ id: DB.nextRound++, status: 'waiting', resolve_at: null, seed: 'sd' + DB.nextRound,
        seed_hash: 'h', rake: 0.05, pot: 0, winner: null, created_at: new Date().toISOString(), resolved_at: null },
        JSON.parse(opts.body));
      DB.rounds.push(r); return J([r]);
    }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const want = (qs.get('status') || '').replace('eq.', '');
      let rows = DB.rounds.filter((r) => r.id === id);
      if (want) rows = rows.filter((r) => r.status === want);
      const b = JSON.parse(opts.body || '{}'); rows.forEach((r) => Object.assign(r, b));
      return J(rows.map((r) => Object.assign({}, r)));
    }
    let rows = DB.rounds.slice();
    if (qs.get('order') === 'id.desc') rows.sort((a, b) => b.id - a.id);
    return J(rows.slice(0, Number(qs.get('limit') || 99)).map((r) => Object.assign({}, r)));
  }
  if (path === 'shark_pvp_bets') {
    if (opts.method === 'POST') {
      let b = JSON.parse(opts.body); if (!Array.isArray(b)) b = [b];
      const made = b.map((x) => Object.assign({ id: DB.nextBet++ }, x));
      if (DB.bets.some((e) => made.some((m) => e.round_id === m.round_id && e.tg_id != null && e.tg_id === m.tg_id))) return J([]);
      DB.bets.push(...made); return J(made);
    }
    if (opts.method === 'DELETE') { const id = Number((qs.get('id') || '').replace('eq.', '')); DB.bets = DB.bets.filter((b) => b.id !== id); return J([]); }
    const rid = Number((qs.get('round_id') || '').replace('eq.', ''));
    let rows = DB.bets.filter((b) => b.round_id === rid);
    if (qs.get('tg_id') === 'not.is.null') rows = rows.filter((b) => b.tg_id != null);
    return J(rows.map((r) => Object.assign({}, r)));
  }
  if (path === 'rpc/shark_apply_ledger') {
    const b = JSON.parse(opts.body);
    if (b.p_idem && LEDGER.some((l) => l.idem === b.p_idem)) return new Response('0', { status: 200 });
    const usr = DB.users.find((x) => Number(x.tg_id) === Number(b.p_tg));
    if (!usr) return new Response('{}', { status: 400 });
    if (b.p_currency === 'stars') {
      const next = Number(usr.stars_balance) + Number(b.p_amount);
      if (next < 0) return new Response('{"message":"insufficient"}', { status: 400 });
      usr.stars_balance = next;
    }
    LEDGER.push({ tg: b.p_tg, cur: b.p_currency, amount: Number(b.p_amount), kind: b.p_kind,
                  ref: b.p_ref, idem: b.p_idem, meta: b.p_meta });
    return new Response('0', { status: 200 });
  }
  return J([]);
};

const api = require(app('api/shark.js'));
const cron = require(app('api/cron.js'));
const U101 = { id: 101, first_name: 'U101' }, U102 = { id: 102, first_name: 'U102' };
async function call(who, body) {
  let out = null;
  await api({ method: 'POST', body: Object.assign({ initData: initData(who) }, body) },
            { status: () => ({ json: (o) => { out = o; } }) });
  return out;
}
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();

let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok  ' + n); else { fails++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

// Разыграть раунд PVP с заданными ставками; boters — сколько ботов оставить
async function pvpRound(stakes) {
  const first = stakes[0];
  await call(first.who, { action: 'pvp_join', bet: first.bet });
  DB.bets = DB.bets.filter((b) => b.tg_id != null);          // ботов вон
  for (const s of stakes.slice(1)) {
    if (s.who) await call(s.who, { action: 'pvp_join', bet: s.bet });
    else DB.bets.push({ id: 800 + DB.bets.length, round_id: DB.rounds[0].id, tg_id: null, name: 'bot', av: '🐙', stake: s.bet });
  }
  DB.rounds[0].resolve_at = ago(1);
  await call(first.who, { action: 'pvp_state' });
  return DB.rounds[0];
}

(async () => {
  console.log('\n— доля с депозита больше не платится —');
  reset();
  // прямой вызов пополнения не нужен: проверяем, что в коде нет доли с суммы
  {
    const src = require('fs').readFileSync(app('api/shark.js'), 'utf8');
    ok('в коде нет referral_share от депозита', !/referral_share\b/.test(src));
    ok('процент задан параметром referral_share_percent', /referral_share_percent/.test(src));
    ok('процент зажат в 0..100', /Math\.min\(100, Math\.max\(0/.test(src));
  }

  console.log('\n— рулетка: доля от входа, независимо от исхода —');
  // Ключевая смена модели: доля считается от входа, а не от разницы. Проверяем
  // на выигрышном И на проигрышном множителе — результат должен быть один.
  for (const forceMult of [0.2, 20]) {
    let r;
    do { reset(); r = await call(U101, { action: 'game_bet', game: 'roulette', bet: 100 }); }
    while (r.prize.mult !== forceMult);
    ok('множитель ×' + forceMult + ': реферал = 10% от входа', refTotal() === 10,
      { paid: refTotal(), bet: 100, win: r.prize.win });
  }
  {
    // И прямое следствие, которое надо знать: на крупном выигрыше выплата
    // рефереру превышает доход платформы по этой сессии.
    let r;
    do { reset(); r = await call(U101, { action: 'game_bet', game: 'roulette', bet: 100 }); }
    while (r.prize.mult !== 20);
    const rev = 100 - r.prize.win;
    ok('доход платформы отрицательный, а выплата всё равно есть', rev < 0 && refTotal() === 10,
      { rev, paid: refTotal() });
  }
  {
    let r; do { reset(); r = await call(U101, { action: 'game_bet', game: 'roulette', bet: 100 }); }
    while (r.prize.mult <= 1);
    ok('игрок выиграл (×' + r.prize.mult + ') — доля всё равно 10% от входа',
      refTotal() === 10, refPays());
  }

  console.log('\n— рулетка: игрок без реферера —');
  reset();
  await call(U102, { action: 'game_bet', game: 'roulette', bet: 100 });
  ok('начислений нет', refTotal() === 0, refPays());

  console.log('\n— краш —');
  reset();
  let r = await call(U101, { action: 'crash_bet', bet: 100 });
  let gb = DB.gameBets.find((b) => b.id === r.roundId);
  gb.crash_point = 1.01; gb.started_at = ago(5);
  await call(U101, { action: 'crash_cashout', roundId: r.roundId });
  ok('разбился: реферал 10% от входа', refTotal() === 10, { paid: refTotal() });
  ok('выплата не больше самого входа', refTotal() <= 100);

  reset();
  r = await call(U101, { action: 'crash_bet', bet: 100 });
  gb = DB.gameBets.find((b) => b.id === r.roundId);
  gb.crash_point = 100; gb.started_at = ago(1);
  const co = await call(U101, { action: 'crash_cashout', roundId: r.roundId });
  ok('забрал по ×' + co.mult + ' — доля считается от входа', refTotal() === 10, { paid: refTotal(), win: co.win });
  // Прямое следствие модели, которое надо держать в голове при выборе процента:
  ok('на этой сессии рефереру ушло больше, чем заработала платформа',
    refTotal() > (100 - co.win), { paid: refTotal(), revenue: 100 - co.win });

  console.log('\n— краш: брошенная ставка —');
  reset();
  r = await call(U101, { action: 'crash_bet', bet: 100 });
  await call(U101, { action: 'crash_bet', bet: 50 });        // первая закрывается как брошенная
  ok('брошенный вход тоже приносит реферала', refTotal() === 10, { paid: refTotal() });

  console.log('\n— PVP: доля от входа каждого игрока —');
  reset();
  let round = await pvpRound([{ who: U101, bet: 100 }, { bet: 100 }]);   // я + бот
  {
    const pot = 200, payout = Math.floor(pot * 0.95);
    ok('фонд и выплата как ожидалось', round.pot === pot && round.winner.payout === payout, { pot: round.pot, payout: round.winner && round.winner.payout });
    ok('реферал = 10% от моего входа', refTotal() === 10, { paid: refTotal() });
    ok('выплата не больше входа', refTotal() <= 100, { paid: refTotal() });
  }

  console.log('\n— PVP: двое приглашённых делят рейк —');
  // Масштаб намеренно крупный. Доля считается floor'ом дважды (сначала часть
  // рейка на игрока, потом процент от неё), поэтому на мелких входах она
  // законно обнуляется — см. отдельную проверку ниже.
  reset({ star_bets: [500, 1000] });
  DB.users.push({ tg_id: 103, first_name: 'U103', username: 'u103', lang: 'ru',
    stars_balance: 100000, won_stars: 0, played: 0, banned: false, ref_by: 900, ref_code: 'r103',
    created_at: new Date().toISOString(), last_seen: new Date().toISOString() });
  DB.refs.push({ inviter_tg: 900, invited_tg: 103, earned: 0 });
  round = await pvpRound([{ who: U101, bet: 1000 }, { who: { id: 103, first_name: 'U103' }, bet: 500 }]);
  {
    ok('начислений ровно два', refPays().length === 2, refPays().length);
    // каждому — 10% от его собственного входа, а не доля общего рейка
    ok('доли считаются от входов', refTotal() === 100 + 50, { paid: refTotal(), want: 150 });
  }

  console.log('\n— мелкий масштаб: доля честно обнуляется —');
  {
    // Целые звёзды: при доле 5% и минимальном входе 10 ⭐ получается 0.5 ⭐.
    // Платить полстрелы нечем, и выдумывать её нельзя — floor даёт ноль.
    // При 10% этот случай недостижим: минимальный вход 10 ⭐ даёт ровно 1 ⭐.
    reset({ referral_share_percent: 5, star_bets: [10, 25] });
    await call(U101, { action: 'game_bet', game: 'roulette', bet: 10 });
    ok('доля меньше звезды не начисляется', refTotal() === 0, refPays());
    ok('и не уходит в минус', refTotal() >= 0);
    reset({ referral_share_percent: 10, star_bets: [10, 25] });
    await call(U101, { action: 'game_bet', game: 'roulette', bet: 10 });
    ok('а ровно одна звезда — начисляется', refTotal() === 1, refPays());
  }

  console.log('\n— PVP: раунд без дохода —');
  reset();
  CFG_DATA = { referral_share_percent: 10 };
  await call(U101, { action: 'pvp_join', bet: 25 });
  DB.bets = DB.bets.filter((b) => b.tg_id != null);
  DB.rounds[0].rake = 0;                                      // рейк отключён
  DB.rounds[0].resolve_at = ago(1);
  await call(U101, { action: 'pvp_state' });
  // Модель считает от входа, поэтому рейк на выплату больше не влияет —
  // это и есть главное следствие смены схемы.
  ok('нулевой рейк не отменяет долю', refTotal() === 2, refPays());

  console.log('\n— идемпотентность —');
  reset();
  round = await pvpRound([{ who: U101, bet: 100 }, { bet: 100 }]);
  const once = refTotal();
  // повторно «дорешиваем» тот же раунд
  DB.rounds[0].status = 'resolving'; DB.rounds[0].resolve_at = ago(60);
  await call(U101, { action: 'pvp_state' });
  ok('повторный резолв не задваивает реферала', refTotal() === once, { once, now: refTotal() });

  reset();
  r = await call(U101, { action: 'crash_bet', bet: 100 });
  gb = DB.gameBets.find((b) => b.id === r.roundId);
  gb.crash_point = 1.01; gb.started_at = ago(5);
  await call(U101, { action: 'crash_cashout', roundId: r.roundId });
  const c1 = refTotal();
  gb.status = 'open';                                          // имитируем повторный вызов
  await call(U101, { action: 'crash_cashout', roundId: r.roundId });
  ok('повторный кэшаут краша не задваивает', refTotal() === c1, { c1, now: refTotal() });

  console.log('\n— процент из конфига —');
  reset({ referral_share_percent: 25 });
  let rr; do { reset({ referral_share_percent: 25 }); rr = await call(U101, { action: 'game_bet', game: 'roulette', bet: 100 }); }
  while (rr.prize.mult >= 1);
  {
    ok('25% из конфига применились', refTotal() === 25, { paid: refTotal() });
  }
  reset({ referral_share_percent: 0 });
  do { reset({ referral_share_percent: 0 }); rr = await call(U101, { action: 'game_bet', game: 'roulette', bet: 100 }); }
  while (rr.prize.mult >= 1);
  ok('ноль процентов — начислений нет', refTotal() === 0, refPays());

  console.log('\n— кривой конфиг не печатает деньги —');
  // Потолок теперь — сам вход: 1000% зажимается до 100, поэтому реферер не
  // может получить больше, чем игрок потратил, каким бы ни был конфиг.
  for (const bad of [1000, -50, 'мусор', null]) {
    let x; do { reset({ referral_share_percent: bad }); x = await call(U101, { action: 'game_bet', game: 'roulette', bet: 100 }); }
    while (x.prize.mult >= 1);
    ok('процент ' + JSON.stringify(bad) + ': выплата не больше входа', refTotal() <= 100, { paid: refTotal() });
  }

  console.log('\n— главный инвариант на серии —');
  // Доля считается от ОБОРОТА, поэтому корректный потолок — сумма входов, а не
  // доходов. И вот цифра, ради которой этот блок существует: выплаты рефереру
  // сравниваются с тем, что платформа реально заработала за ту же серию.
  reset();
  const N = 300, BET = 100;
  let netRev = 0;
  for (let i = 0; i < N; i++) {
    const x = await call(U101, { action: 'game_bet', game: 'roulette', bet: BET });
    netRev += BET - x.prize.win;
  }
  const paidTotal = refTotal(), turnover = N * BET;
  ok('начислений столько же, сколько сессий', refPays().length === N, { pays: refPays().length, N });
  ok('реферал = 10% оборота', paidTotal === N * Math.floor(BET * 0.1), { paidTotal, turnover });
  ok('выплата не больше оборота', paidTotal <= turnover, { paidTotal, turnover });
  // ГЛАВНОЕ: сравниваем долю не с одной случайной серией, а с ОЖИДАНИЕМ по
  // таблице. На 300 спинах с призом ×20 разброс огромен, и «выплатили больше,
  // чем заработали» на отдельном прогоне может не выполниться — а в среднем
  // выполняется всегда. Проверяем именно это, иначе тест был бы флейки.
  {
    const src = require('fs').readFileSync(app('api/shark.js'), 'utf8');
    const tbl = eval(src.match(/const ROUL_PRIZES = \[[\s\S]*?\n\];/)[0].replace('const ROUL_PRIZES =', ''));
    const W = tbl.reduce((a, x) => a + x.weight, 0);
    const edge = 1 - tbl.reduce((a, x) => a + x.weight * x.mult, 0) / W;   // доля дома
    const share = 0.10;                                                   // доля реферера
    ok('ожидаемая выплата рефереру больше ожидаемого заработка платформы',
      share > edge, { edge: (edge * 100).toFixed(2) + '%', share: '10.00%' });
    ok('и превышает его примерно вдвое', share / edge > 1.8 && share / edge < 3,
      { ratio: (share / edge).toFixed(2) });
    console.log('     ожидание: дом ' + (edge * 100).toFixed(2) + '% оборота, реферер 10% оборота'
      + ' → на каждую заработанную звезду выплачивается ' + (share / edge).toFixed(1));
  }
  console.log('     оборот ' + turnover + ' ⭐ · заработала платформа ' + netRev
    + ' ⭐ · выплачено рефереру ' + paidTotal + ' ⭐');

  console.log('\n— cron платит так же —');
  reset();
  CFG_DATA = { referral_share_percent: 10 };
  await call(U101, { action: 'pvp_join', bet: 100 });
  DB.bets = DB.bets.filter((b) => b.tg_id != null);
  DB.rounds[0].resolve_at = ago(1);
  await cron({ method: 'GET' }, { status: () => ({ json: () => {} }) });
  {
    // Cron считает по тем же правилам, что и api/shark.js: 10% от входа.
    ok('cron начислил рефералу', refTotal() === 10, { paid: refTotal() });
    ok('cron не превысил вход', refTotal() <= 100, { paid: refTotal() });
  }

  console.log('\n' + (fails ? '✗ провалов: ' + fails : '✓ все проверки пройдены'));
  process.exit(fails ? 1 : 0);
})();
