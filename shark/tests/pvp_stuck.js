// Воспроизводит залипание PVP-раунда между фазами резолва и проверяет,
// что раунд дорешивается, платит один раз и не блокирует следующие.
const { app } = require('./paths');
const crypto = require('crypto');
const BOT = 'test:BOTTOKEN';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.BOT_TOKEN = BOT;
process.env.ADMIN_IDS = '';
process.env.ADMIN_PANEL_IDS = '';

function initData(user) {
  const p = new URLSearchParams();
  p.set('user', JSON.stringify(user));
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const dcs = Array.from(p.entries()).map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

let DB, LEDGER, KILL, LEDGER_FAIL;
function reset(opts) {
  opts = opts || {};
  LEDGER = []; KILL = opts.kill || null; LEDGER_FAIL = opts.ledgerFail || false;
  DB = {
    users: [{ tg_id: 101, username: 'kolya', first_name: 'Коля', lang: 'ru',
              stars_balance: 50000, won_stars: 0, played: 0, banned: false, ref_code: 'r2',
              created_at: new Date().toISOString(), last_seen: new Date().toISOString() }],
    rounds: [], bets: [], nextRound: 1, nextBet: 1
  };
}
function mkRound(over) {
  const r = Object.assign({ id: DB.nextRound++, status: 'waiting', resolve_at: null, seed: 'seedX',
    seed_hash: 'h', rake: 0.05, pot: 0, winner: null,
    created_at: new Date().toISOString(), resolved_at: null }, over || {});
  DB.rounds.push(r); return r;
}

// --- фейковый PostgREST ---
globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), qs = u.searchParams;
  const json = (rows) => new Response(JSON.stringify(rows), { status: 200, headers: new Headers() });

  if (path === 'shark_config' || path === 'shark_referrals') return json([]);

  if (path === 'shark_users') {
    if (opts.method === 'PATCH') {
      const id = (qs.get('tg_id') || '').replace('eq.', '');
      const b = JSON.parse(opts.body || '{}');
      const u2 = DB.users.find((x) => String(x.tg_id) === id);
      if (u2) Object.assign(u2, b);
      return json([]);
    }
    if (opts.method === 'POST') return json([]);
    let rows = DB.users.slice();
    const id = qs.get('tg_id'); if (id) rows = rows.filter((x) => String(x.tg_id) === id.replace('eq.', ''));
    return json(rows);
  }
  if (path === 'shark_ledger') return json([]);

  if (path === 'shark_pvp_rounds') {
    if (opts.method === 'POST') { const r = mkRound(JSON.parse(opts.body)); return json([r]); }
    if (opts.method === 'PATCH') {
      if (process.env.TRACE) console.log('   PATCH', u.search, opts.body);
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const wantStatus = (qs.get('status') || '').replace('eq.', '');
      const wantRa = qs.get('resolve_at');
      let rows = DB.rounds.filter((r) => r.id === id);
      if (wantStatus) rows = rows.filter((r) => r.status === wantStatus);
      if (wantRa === 'is.null') rows = rows.filter((r) => r.resolve_at == null);
      else if (wantRa && wantRa.startsWith('eq.')) {
        const v = decodeURIComponent(wantRa.slice(3));
        rows = rows.filter((r) => r.resolve_at === v);
      }
      const b = JSON.parse(opts.body || '{}');
      if (process.env.TRACE) console.log('   → совпало строк:', rows.length);
      rows.forEach((r) => Object.assign(r, b));
      // имитация обрыва сразу после клейма: дальше функция «умирает»
      if (KILL === 'after-claim' && b.status === 'resolving') { KILL = 'dead'; }
      return json(rows.map((r) => Object.assign({}, r)));
    }
    if (KILL === 'dead') throw new Error('function killed');
    let rows = DB.rounds.slice();
    const st = qs.get('status'); if (st) rows = rows.filter((r) => r.status === st.replace('eq.', ''));
    if (qs.get('order') === 'id.desc') rows.sort((a, b) => b.id - a.id);
    const lim = Number(qs.get('limit') || 1000);
    return json(rows.slice(0, lim).map((r) => Object.assign({}, r)));
  }

  if (path === 'shark_pvp_bets') {
    if (KILL === 'dead') throw new Error('function killed');
    if (opts.method === 'POST') {
      let b = JSON.parse(opts.body); if (!Array.isArray(b)) b = [b];
      const made = b.map((x) => Object.assign({ id: DB.nextBet++ }, x));
      if (DB.bets.some((e) => made.some((m) => e.round_id === m.round_id && e.tg_id != null && e.tg_id === m.tg_id))) return json([]);
      DB.bets.push(...made); return json(made);
    }
    if (opts.method === 'DELETE') { const id = Number((qs.get('id') || '').replace('eq.', '')); DB.bets = DB.bets.filter((b) => b.id !== id); return json([]); }
    const rid = Number((qs.get('round_id') || '').replace('eq.', ''));
    let rows = DB.bets.filter((b) => b.round_id === rid);
    if (qs.get('tg_id') === 'not.is.null') rows = rows.filter((b) => b.tg_id != null);
    return json(rows);
  }

  if (path === 'rpc/shark_apply_ledger') {
    if (KILL === 'dead') throw new Error('function killed');
    const b = JSON.parse(opts.body);
    if (LEDGER_FAIL) return new Response('{"message":"boom"}', { status: 500 });
    if (b.p_idem && LEDGER.some((l) => l.idem === b.p_idem)) {           // идемпотентность
      const u2 = DB.users.find((x) => Number(x.tg_id) === Number(b.p_tg));
      return new Response('0', { status: 200 });
    }
    const u = DB.users.find((x) => Number(x.tg_id) === Number(b.p_tg));
    if (u && b.p_currency === 'stars') {
      const next = Math.round(Number(u.ton_balance) * 1e9) + Math.round(Number(b.p_amount) * 1e9);
      if (next < 0) return new Response('{"message":"insufficient"}', { status: 400 });
      u.ton_balance = String(next / 1e9);
    }
    if (u && b.p_currency === 'stars') {
      if (Number(u.stars_balance) + Number(b.p_amount) < 0) return new Response('{"message":"insufficient"}', { status: 400 });
      u.stars_balance = Number(u.stars_balance) + Number(b.p_amount);
    }
    LEDGER.push({ tg: b.p_tg, amount: b.p_amount, kind: b.p_kind, idem: b.p_idem });
    return new Response('0', { status: 200 });
  }
  return json([]);
};

const handler = require(app('api/shark.js'));
const cron = require(app('api/cron.js'));
const PLAYER = { id: 101, first_name: 'Коля', username: 'kolya' };

async function joinOnly(bet) {
  const r = await call({ action: 'pvp_join', bet: bet });
  DB.bets = DB.bets.filter((b) => b.tg_id != null);   // ботов вон — победитель предопределён
  return r;
}
async function call(body) {
  let out = null;
  const res = { status: () => ({ json: (o) => { out = o; } }) };
  await handler({ method: 'POST', body: Object.assign({ initData: initData(PLAYER) }, body) }, res);
  return out;
}
async function runCron() {
  let out = null;
  await cron({ method: 'GET' }, { status: () => ({ json: (o) => { out = o; } }) });
  return out;
}
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();

let fails = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

(async () => {
  console.log('\n— обычный раунд доигрывается —');
  reset();
  let r = await joinOnly(25);
  ok('вход принят', r.ok === true, r);
  DB.rounds[0].resolve_at = ago(1);                      // дедлайн прошёл
  r = await call({ action: 'pvp_state' });
  ok('раунд разыгран', DB.rounds[0].status === 'done', DB.rounds[0].status);
  ok('победитель записан', !!DB.rounds[0].winner);
  ok('выплата одна', LEDGER.filter((l) => l.kind === 'win').length === 1, LEDGER);

  console.log('\n— клиент получает развязку, а не ошибку —');
  reset();
  await joinOnly(25);
  DB.rounds[0].resolve_at = ago(1);
  r = await call({ action: 'pvp_state' });
  ok('ответ успешный', r && r.ok === true, r);
  ok('раунд отдан клиенту как завершённый', r.round && r.round.status === 'done', r.round && r.round.status);
  ok('победитель отмечен', r.round && r.round.players.some((p) => p.winner), r.round && r.round.players);
  r = await call({ action: 'pvp_state' });
  ok('повторный опрос в грейсе тоже успешен', r && r.ok === true && r.round.status === 'done', r);

  console.log('\n— обрыв между фазами: раньше это вешало режим навсегда —');
  reset({ kill: 'after-claim' });
  await joinOnly(25);
  DB.rounds[0].resolve_at = ago(1);
  try { await call({ action: 'pvp_state' }); } catch (e) {}
  ok('раунд застрял в resolving', DB.rounds[0].status === 'resolving', DB.rounds[0].status);
  ok('выплаты не было', LEDGER.filter((l) => l.kind === 'win').length === 0);

  KILL = null;                                            // «функция» ожила
  r = await call({ action: 'pvp_state' });
  ok('свежий resolving не трогаем (ждём законные 25 с)', DB.rounds[0].status === 'resolving', DB.rounds[0].status);

  DB.rounds[0].resolve_at = ago(30);                      // повисел дольше порога
  r = await call({ action: 'pvp_state' });
  ok('зависший раунд дорешан', DB.rounds[0].status === 'done', DB.rounds[0].status);
  ok('выплата ровно одна', LEDGER.filter((l) => l.kind === 'win').length === 1, LEDGER);
  ok('клиент получил победителя', r.ok && r.round && r.round.players.some((p) => p.winner), r.round && r.round.players);

  console.log('\n— новый раунд после восстановления —');
  DB.rounds[0].resolved_at = ago(60);                     // грейс анимации вышел
  r = await call({ action: 'pvp_state' });
  ok('заведён следующий раунд', DB.rounds.length === 2 && DB.rounds[1].status === 'waiting', DB.rounds.map((x) => x.status));

  console.log('\n— два клиента одновременно чинят один зависший раунд —');
  reset();
  await joinOnly(25);
  Object.assign(DB.rounds[0], { status: 'resolving', resolve_at: ago(30) });
  await Promise.all([call({ action: 'pvp_state' }), call({ action: 'pvp_state' }), call({ action: 'pvp_state' })]);
  ok('раунд закрыт', DB.rounds[0].status === 'done', DB.rounds[0].status);
  ok('выплата не задвоилась', LEDGER.filter((l) => l.kind === 'win').length === 1, LEDGER.filter((l) => l.kind === 'win'));
  ok('«сыграно» не задвоилось', DB.users[0].played <= 1, DB.users[0].played);

  console.log('\n— cron тоже умеет чинить зависший раунд —');
  reset();
  await joinOnly(25);
  Object.assign(DB.rounds[0], { status: 'resolving', resolve_at: ago(30) });
  const c = await runCron();
  ok('cron дорешал', DB.rounds[0].status === 'done' && c.resolved === 1, { c, st: DB.rounds[0].status });
  ok('cron сообщает про зависшие', c.stuck === 1, c);

  console.log('\n— сломанная выплата не убивает режим навсегда —');
  reset({ ledgerFail: true });
  LEDGER_FAIL = false;
  await joinOnly(25);            // ставку списать надо
  LEDGER_FAIL = true;
  DB.rounds[0].resolve_at = ago(1);
  await call({ action: 'pvp_state' });
  ok('раунд не закрыт, пока выплата не прошла', DB.rounds[0].status === 'resolving', DB.rounds[0].status);
  DB.rounds[0].resolve_at = ago(30);
  await call({ action: 'pvp_state' });
  ok('повторная попытка — всё ещё не закрыт', DB.rounds[0].status === 'resolving', DB.rounds[0].status);
  DB.rounds[0].created_at = ago(400);                     // прошло больше PVP_GIVEUP_S
  DB.rounds[0].resolve_at = ago(30);
  await call({ action: 'pvp_state' });
  ok('через 5 минут раунд закрывается', DB.rounds[0].status === 'done', DB.rounds[0].status);
  ok('провал выплаты помечен', DB.rounds[0].winner && DB.rounds[0].winner.payout_failed === true, DB.rounds[0].winner);
  DB.rounds[0].resolved_at = ago(60);
  await call({ action: 'pvp_state' });
  ok('следующий раунд заводится', DB.rounds.length === 2, DB.rounds.map((x) => x.status));

  console.log('\n' + (fails ? '✗ провалов: ' + fails : '✓ все проверки пройдены'));
  process.exit(fails ? 1 : 0);
})();
