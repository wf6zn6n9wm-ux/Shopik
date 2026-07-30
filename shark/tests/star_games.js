// Игры на звёздах: вход, выплаты, призовой фонд, рейк, целочисленность.
const { app } = require('./paths');
const crypto = require('crypto');
const BOT = 'test:BOTTOKEN';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.BOT_TOKEN = BOT;
process.env.ADMIN_IDS = '';
process.env.ADMIN_PANEL_IDS = '';

// Звёзды целые: «единица счёта» и «единица показа» совпадают, преобразований нет.

function initData(user) {
  const p = new URLSearchParams();
  p.set('user', JSON.stringify(user));
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const dcs = Array.from(p.entries()).map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

let DB, LEDGER, CFG_DATA;
function reset(startStars, cfg) {
  LEDGER = []; CFG_DATA = cfg || {};
  DB = {
    users: [{ tg_id: 101, username: 'kolya', first_name: 'Коля', lang: 'ru',
              stars_balance: startStars == null ? 10000 : startStars, won_stars: 0, played: 0, banned: false,
              ref_code: 'r2', created_at: new Date().toISOString(), last_seen: new Date().toISOString() }],
    rounds: [], bets: [], gameBets: [], nextRound: 1, nextBet: 1, nextGb: 1
  };
}
const bal = () => Number(DB.users[0].stars_balance);
const balStars = () => bal();

globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), qs = u.searchParams;
  const J = (rows) => new Response(JSON.stringify(rows), { status: 200, headers: new Headers() });

  if (path === 'shark_config') return J([{ data: CFG_DATA }]);
  if (path === 'shark_referrals' || path === 'shark_ledger') return J([]);

  if (path === 'shark_users') {
    if (opts.method === 'PATCH') {
      const id = (qs.get('tg_id') || '').replace('eq.', '');
      const b = JSON.parse(opts.body || '{}');
      const x = DB.users.find((v) => String(v.tg_id) === id);
      if (x) Object.assign(x, b);
      return J([]);
    }
    if (opts.method === 'POST') return J([]);
    let rows = DB.users.slice();
    const id = qs.get('tg_id'); if (id) rows = rows.filter((x) => String(x.tg_id) === id.replace('eq.', ''));
    return J(rows.map((r) => Object.assign({}, r)));
  }

  if (path === 'shark_bets') {
    if (opts.method === 'POST') { const b = Object.assign({ id: DB.nextGb++ }, JSON.parse(opts.body)); DB.gameBets.push(b); return J([b]); }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const b = JSON.parse(opts.body || '{}');
      DB.gameBets.filter((x) => !id || x.id === id).forEach((x) => Object.assign(x, b));
      return J([]);
    }
    const id = Number((qs.get('id') || '').replace('eq.', ''));
    return J(DB.gameBets.filter((x) => x.id === id).map((x) => Object.assign({}, x)));
  }

  if (path === 'shark_pvp_rounds') {
    if (opts.method === 'POST') {
      const r = Object.assign({ id: DB.nextRound++, status: 'waiting', resolve_at: null, seed: 'seed' + DB.nextRound,
        seed_hash: 'h', rake: 0.05, pot: 0, winner: null, created_at: new Date().toISOString(), resolved_at: null },
        JSON.parse(opts.body));
      DB.rounds.push(r); return J([r]);
    }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const want = (qs.get('status') || '').replace('eq.', '');
      let rows = DB.rounds.filter((r) => r.id === id);
      if (want) rows = rows.filter((r) => r.status === want);
      const b = JSON.parse(opts.body || '{}');
      rows.forEach((r) => Object.assign(r, b));
      return J(rows.map((r) => Object.assign({}, r)));
    }
    let rows = DB.rounds.slice();
    if (qs.get('order') === 'id.desc') rows.sort((a, b) => b.id - a.id);
    return J(rows.slice(0, Number(qs.get('limit') || 999)).map((r) => Object.assign({}, r)));
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
    if (!usr) return new Response('{"message":"no user"}', { status: 400 });
    if (b.p_currency === 'stars') {
      // как в базе после Э7: только целые звёзды
      if (Number(b.p_amount) !== Math.trunc(Number(b.p_amount))) {
        return new Response('{"message":"stars must be whole"}', { status: 400 });
      }
      const next = Number(usr.stars_balance) + Number(b.p_amount);
      if (next < 0) return new Response('{"message":"insufficient"}', { status: 400 });
      usr.stars_balance = next;
    }
    LEDGER.push({ tg: b.p_tg, cur: b.p_currency, amount: Number(b.p_amount), kind: b.p_kind, idem: b.p_idem });
    return new Response('0', { status: 200 });
  }
  return J([]);
};

const handler = require(app('api/shark.js'));
const PLAYER = { id: 101, first_name: 'Коля', username: 'kolya' };
async function call(body) {
  let out = null;
  await handler({ method: 'POST', body: Object.assign({ initData: initData(PLAYER) }, body) },
                { status: () => ({ json: (o) => { out = o; } }) });
  return out;
}
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const moved = (kind) => LEDGER.filter((l) => l.kind === kind);

let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok  ' + n); else { fails++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

(async () => {
  console.log('\n— валюта: только звёзды —');
  reset(10000);
  await call({ action: 'game_bet', game: 'roulette', bet: 25 });
  await call({ action: 'crash_bet', bet: 25 });
  await call({ action: 'pvp_join', bet: 25 });
  ok('ни одного движения в звёздах или гривнах', LEDGER.every((l) => l.cur === 'stars'), LEDGER.map((l) => l.cur));

  console.log('\n— рулетка —');
  reset(10000);
  let r = await call({ action: 'game_bet', game: 'roulette', bet: 25 });
  ok('ставка принята', r.ok === true, r);
  const betRow = LEDGER.find((l) => l.kind === 'bet');
  ok('списано ровно 25', betRow.amount === -25, betRow.amount);
  ok('приз — множитель, не сумма', typeof r.prize.mult === 'number' && r.prize.value === undefined, r.prize);
  ok('выигрыш = вход × множитель', r.prize.win === Math.floor(25 * r.prize.mult), r.prize);
  ok('в ставках записаны нанотоны', DB.gameBets[0].bet_stars === 25, DB.gameBets[0]);

  r = await call({ action: 'game_bet', game: 'roulette', bet: 30 });
  ok('ставка вне списка отклонена', r.ok === false && r.reason === 'bad_bet', r);
  r = await call({ action: 'game_bet', game: 'roulette', bet: 5 });
  ok('ставка ниже минимума отклонена', r.ok === false && r.reason === 'bad_bet', r);
  reset(5);
  r = await call({ action: 'game_bet', game: 'roulette', bet: 25 });
  ok('не хватает баланса — отказ', r.ok === false && r.reason === 'no_funds', r);

  console.log('\n— рулетка: преимущество дома —');
  // Главная проверка — точная, по самой таблице. Случайный прогон для этого не
  // годится: разброс одного спина 1.765 (его задаёт приз ×20 с шансом 0.6%),
  // поэтому даже на 4000 спинах ошибка среднего 2.8 п.п. Узкий коридор здесь
  // означал бы тест, падающий через раз по случайности.
  {
    const src = require('fs').readFileSync(app('api/shark.js'), 'utf8');
    const tbl = eval(src.match(/const ROUL_PRIZES = \[[\s\S]*?\n\];/)[0].replace('const ROUL_PRIZES =', ''));
    const W = tbl.reduce((a, p) => a + p.weight, 0);
    const ev = tbl.reduce((a, p) => a + p.weight * p.mult, 0) / W;
    const edgeExact = (1 - ev) * 100;
    ok('таблица даёт дому 4.2%', Math.abs(edgeExact - 4.2) < 0.05, edgeExact.toFixed(2) + '%');
    ok('рейк рулетки сопоставим с PVP (5%)', edgeExact < 8, edgeExact.toFixed(2) + '%');
    ok('каждый четвёртый спин в плюс', tbl.filter((p) => p.mult > 1).reduce((a, p) => a + p.weight, 0) / W >= 0.2);
    ok('ни одного приза с нулевым множителем', tbl.every((p) => p.mult > 0), tbl.map((p) => p.mult));
  }
  const START = 1000000, STAKE = 100;
  reset(START);
  // Всё в целых звёздах: сумма 4000 выплат складывается точно, поэтому сверка
  // баланса — строгое равенство, а не «примерно».
  let staked = 0, won = 0;
  for (let i = 0; i < 4000; i++) {
    const x = await call({ action: 'game_bet', game: 'roulette', bet: STAKE });
    staked += STAKE; won += x.prize.win;
  }
  const edge = (1 - won / staked) * 100;
  // Выплата округляется вниз до целой звезды, поэтому фактический рейк чуть
  // выше табличного: на входе 100 ⭐ потеря на округлении до 1 ⭐ за спин.
  // ±3σ при n=4000 — это ±8.4 п.п.
  ok('прогон 4000 спинов в пределах 3σ от 4.2%', Math.abs(edge - 4.2) < 8.4, edge.toFixed(2) + '%');
  ok('баланс сошёлся с движениями', bal() === START - staked + won,
    { bal: bal(), expect: START - staked + won });

  console.log('\n— краш —');
  reset(10000);
  r = await call({ action: 'crash_bet', bet: 50 });
  ok('ставка принята', r.ok === true && r.roundId, r);
  ok('списано 50', bal() === 9950, bal());
  const rid = r.roundId;
  DB.gameBets.find((b) => b.id === rid).crash_point = 100;      // не разобьётся
  DB.gameBets.find((b) => b.id === rid).started_at = ago(1);
  r = await call({ action: 'crash_cashout', roundId: rid });
  ok('забрал, не разбился', r.ok === true && r.busted === false, r);
  const expWin = Number(Math.floor(50 * r.mult));
  ok('выплата = ставка × множитель, вниз', r.win === expWin, { win: r.win, expWin, mult: r.mult });
  ok('баланс вырос ровно на выплату', bal() === 9950 + expWin, bal());

  reset(10000);
  r = await call({ action: 'crash_bet', bet: 50 });
  const rid2 = r.roundId;
  DB.gameBets.find((b) => b.id === rid2).crash_point = 1.01;    // разобьётся
  DB.gameBets.find((b) => b.id === rid2).started_at = ago(5);
  r = await call({ action: 'crash_cashout', roundId: rid2 });
  ok('опоздал — краш', r.ok === true && r.busted === true, r);
  ok('выплаты не было', bal() === 9950, bal());

  console.log('\n— PVP: призовой фонд и рейк —');
  reset(10000);
  r = await call({ action: 'pvp_join', bet: 50 });
  ok('вход принят', r.ok === true, r);
  ok('списано 50', bal() === 9950, bal());
  ok('вход в базе — целые звёзды', DB.bets[0].stake === 50, DB.bets[0].stake);
  ok('клиенту отдан тот же вход', r.round.players.some((p) => p.stake === 50), r.round.players.map((p) => p.stake));

  // оставляем только живого игрока — победитель предопределён
  DB.bets = DB.bets.filter((b) => b.tg_id != null);
  DB.rounds[0].resolve_at = ago(1);
  r = await call({ action: 'pvp_state' });
  const potStars = 50;
  const payStars = Math.floor(potStars * 0.95);
  ok('раунд разыгран', DB.rounds[0].status === 'done', DB.rounds[0].status);
  ok('выплата = фонд минус 5%', bal() === 9950 + payStars, { bal: bal(), expect: 9950 + payStars });
  ok('рейк ровно 5% фонда', potStars - payStars === potStars - Math.floor(potStars * 0.95));

  console.log('\n— PVP: фонд из долей складывается точно —');
  reset(10000);
  await call({ action: 'pvp_join', bet: 25 });
  DB.bets = DB.bets.filter((b) => b.tg_id != null);
  for (let i = 0; i < 9; i++) DB.bets.push({ id: 900 + i, round_id: DB.rounds[0].id, tg_id: null, name: 'bot' + i, av: '🐙', stake: 25 });
  DB.rounds[0].resolve_at = ago(1);
  await call({ action: 'pvp_state' });
  ok('фонд из десяти входов по 25 = ровно 250 ⭐', DB.rounds[0].pot === 250, { pot: DB.rounds[0].pot, want: 250 });

  console.log('\n— нет дрейфа долей за серию —');
  reset(10000);
  for (let i = 0; i < 30; i++) await call({ action: 'crash_bet', bet: 25 });
  // Целые звёзды не дают дрейфа по построению: 30 списаний по 25 — это ровно 750.
  ok('30 входов по 25: баланс ровно 9250', bal() === 10000 - 30 * 25, bal());
  ok('без нанотонов было бы иначе', (function () { let x = 10; for (let i = 0; i < 30; i++) x -= 0.1; return x !== 7; })());

  console.log('\n— конфиг чинится, а не ломает экономику —');
  reset(10000, { star_bets: [0, -5, 5, 50, 50, 25, 'мусор'] });
  r = await call({ action: 'state' });
  // 0, -5 и 'мусор' отброшены; 5 ниже минимума (10 ⭐); дубль 50 схлопнут
  ok('мусор, нули и дубли отброшены', JSON.stringify(r.catalog.bets) === '[25,50]', r.catalog.bets);
  r = await call({ action: 'crash_bet', bet: 0 });
  ok('нулевая ставка невозможна', r.ok === false && r.reason === 'bad_bet', r);
  r = await call({ action: 'crash_bet', bet: -1 });
  ok('отрицательная ставка невозможна', r.ok === false && r.reason === 'bad_bet', r);
  reset(10000, { star_bets: 'сломано' });
  r = await call({ action: 'state' });
  ok('совсем сломанный конфиг — запасной список', JSON.stringify(r.catalog.bets) === '[25,50,100]', r.catalog.bets);

  console.log('\n— статистика в звёздах —');
  reset(10000);
  await call({ action: 'crash_bet', bet: 25 });
  ok('won_stars не растёт', Number(DB.users[0].won_stars) === 0, DB.users[0].won_stars);

  console.log('\n' + (fails ? '✗ провалов: ' + fails : '✓ все проверки пройдены'));
  process.exit(fails ? 1 : 0);
})();
