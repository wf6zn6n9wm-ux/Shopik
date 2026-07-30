// Локальный харнесс для admin-действий: подменяем fetch на фейковый PostgREST.
const { app } = require('./paths');
const crypto = require('crypto');
const BOT = 'test:BOTTOKEN';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.BOT_TOKEN = BOT;
process.env.ADMIN_IDS = '777, 888, 999';
process.env.ADMIN_PANEL_IDS = '777, 888';

function initData(user) {
  const p = new URLSearchParams();
  p.set('user', JSON.stringify(user));
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const dcs = Array.from(p.entries()).map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

// ---- фейковая база ----
const DB = {
  users: [
    { tg_id: 777, username: 'boss', first_name: 'Andrey', lang: 'ru', stars_balance: 10000, won_stars: 4000, played: 12, banned: false, ref_code: 'r1', created_at: iso(-2), last_seen: iso(-0.01) },
    { tg_id: 101, username: 'kolya', first_name: 'Коля', lang: 'uk', stars_balance: 2500, won_stars: 9000, played: 30, banned: false, ref_code: 'r2', created_at: iso(-30), last_seen: iso(-0.5) },
    { tg_id: 102, username: null, first_name: 'Ann(a)', lang: 'ru', stars_balance: 0, won_stars: 0, played: 3, banned: false, ref_code: 'r3', created_at: iso(-0.2), last_seen: iso(-40) }
    ,{ tg_id: 999, username: 'buh', first_name: 'Buh', lang: 'ru', stars_balance: 0, won_stars: 0, played: 0, banned: false, ref_code: 'r4', created_at: iso(-60), last_seen: iso(-60) }
  ],
  ledger: [
    { currency: 'stars', amount: -1000, kind: 'bet', created_at: iso(-1) },
    { currency: 'stars', amount: -500, kind: 'bet', created_at: iso(-1) },
    { currency: 'stars', amount: 1200, kind: 'win', created_at: iso(-1) },
    { currency: 'stars', amount: 5000, kind: 'topup', created_at: iso(-2) },
    { currency: 'stars', amount: 30, kind: 'referral', created_at: iso(-3) },
    // Строка старой экономики внутри окна: в сводку попасть НЕ должна,
    // иначе гривны молча сложатся с тонами.
    { currency: 'uah', amount: 999, kind: 'topup', created_at: iso(-1) }
  ],
  claims: [{ id: 1, status: 'new', stars: 800 }, { id: 2, status: 'done', stars: 500 }],
  pvpRounds: [{ id: 5, status: 'waiting', seed: 'x', seed_hash: 'y', rake: 0.05, created_at: iso(0) }],
  pvpBets: [],
  config: []
};
function iso(days) { return new Date(Date.now() + days * 86400000).toISOString(); }

const CALLS = [];
let PVP_BETS_SEATED = [];

globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  const u = new URL(url);
  const path = u.pathname.replace('/rest/v1/', '');
  const qs = u.searchParams;
  CALLS.push({ path, qs: u.search, method: opts.method || 'GET' });
  const wantCount = (opts.headers && opts.headers.Prefer || '').includes('count=exact');

  function reply(rows, extraHeaders) {
    const h = new Headers(extraHeaders || {});
    if (wantCount) h.set('content-range', '0-0/' + rows.length);
    return new Response(JSON.stringify(wantCount ? rows.slice(0, 1) : rows), { status: 200, headers: h });
  }

  if (path === 'shark_config') return reply([{ data: {} }]);
  if (path === 'shark_users') {
    if (opts.method === 'PATCH') return reply([]);
    if (opts.method === 'POST') return reply([]);
    let rows = DB.users.slice();
    if (qs.get('tg_id')) { const v = qs.get('tg_id').replace('eq.', ''); rows = rows.filter((r) => String(r.tg_id) === v); }
    if (qs.get('created_at')) { const v = qs.get('created_at').replace('gte.', ''); rows = rows.filter((r) => r.created_at >= v); }
    if (qs.get('last_seen')) { const v = qs.get('last_seen').replace('gte.', ''); rows = rows.filter((r) => r.last_seen >= v); }
    if (qs.get('or')) {
      const m = /first_name\.ilike\."\*(.*?)\*",username\.ilike\."\*(.*?)\*"/.exec(qs.get('or'));
      // не распарсили фильтр — берём заведомо ненаходимую строку, а не пустую:
      // с пустой includes() совпадает со всем подряд и тест бы «прошёл»
      const needle = (m ? m[1] : '\u0000').replace(/\\(.)/g, '$1').toLowerCase();
      rows = rows.filter((r) => (r.first_name || '').toLowerCase().includes(needle) || (r.username || '').toLowerCase().includes(needle));
    }
    const ord = qs.get('order');
    if (ord) {
      const [col, dir] = ord.split('.');
      rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    const off = Number(qs.get('offset') || 0), lim = Number(qs.get('limit') || 1000);
    return reply(wantCount ? rows : rows.slice(off, off + lim));
  }
  if (path === 'shark_ledger') {
    let rows = DB.ledger.slice();
    if (qs.get('created_at')) { const v = qs.get('created_at').replace('gte.', ''); rows = rows.filter((r) => r.created_at >= v); }
    // фильтр валюты обязателен: без него сводка сложила бы гривны с тонами
    if (qs.get('currency')) { const v = qs.get('currency').replace('eq.', ''); rows = rows.filter((r) => r.currency === v); }
    if (qs.get('kind')) { const v = qs.get('kind').replace('eq.', ''); rows = rows.filter((r) => r.kind === v); }
    if (qs.get('idem')) rows = [];
    return reply(rows);
  }
  if (path === 'shark_claims') {
    let rows = DB.claims.slice();
    const f = qs.get('status');
    // сервер спрашивает status=in.(new,in_review) — фильтр обязателен, иначе
    // в сводку попадут уже закрытые заявки
    if (f && f.startsWith('in.')) {
      const set = f.slice(3).replace(/^\(|\)$/g, '').split(',');
      rows = rows.filter((r) => set.includes(r.status));
    } else if (f) rows = rows.filter((r) => r.status === f.replace('eq.', ''));
    return reply(rows);
  }
  if (path === 'shark_referrals') return reply([]);
  if (path === 'shark_pvp_rounds') return reply(DB.pvpRounds);
  if (path === 'shark_pvp_bets') {
    if (opts.method === 'POST') { CALLS.push({ path: 'INSERT_BET' }); return reply([{ id: 1 }]); }
    return reply(PVP_BETS_SEATED);
  }
  if (path === 'rpc/shark_apply_ledger') {
    const b = JSON.parse(opts.body);
    CALLS.push({ path: 'LEDGER', body: b });
    const usr = DB.users.find((x) => Number(x.tg_id) === Number(b.p_tg));
    // как в базе после Э6: двигать можно только ton, остальное — ошибка
    if (b.p_currency !== 'stars') return new Response('{"message":"read-only history"}', { status: 400 });
    if (usr) usr.stars_balance = Number(usr.stars_balance) + Number(b.p_amount);
    return new Response(JSON.stringify(usr ? usr.stars_balance : 0), { status: 200 });
  }
  return reply([]);
};

const handler = require(app('api/shark.js'));

async function call(user, body) {
  CALLS.length = 0;
  let out = null;
  const res = { status: () => ({ json: (o) => { out = o; } }) };
  await handler({ method: 'POST', body: Object.assign({ initData: initData(user) }, body) }, res);
  return out;
}

const ADMIN = { id: 777, first_name: 'Andrey', username: 'boss' };
const PLAYER = { id: 101, first_name: 'Коля', username: 'kolya' };

let fails = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

(async () => {
  console.log('\n— права —');
  { // 999 есть в ADMIN_IDS (уведомления), но не в ADMIN_PANEL_IDS — панели нет
    const NOTIFY_ONLY = { id: 999, first_name: 'Buh' };
    let x = await call(NOTIFY_ONLY, { action: 'state' });
    ok('получатель уведомлений: isAdmin=false', x.isAdmin === false, x.isAdmin);
    x = await call(NOTIFY_ONLY, { action: 'admin_stats' });
    ok('получатель уведомлений: панель закрыта', x.ok === false && x.reason === 'forbidden', x);
    x = await call(ADMIN, { action: 'admin_grant', amount: 100, tg: 999, key: 'nk' });
    ok('начислить получателю уведомлений нельзя', x.reason === 'target_not_admin', x);
  }
  let r = await call(PLAYER, { action: 'state' });
  ok('state обычного игрока: isAdmin=false', r.isAdmin === false, r.isAdmin);
  r = await call(ADMIN, { action: 'state' });
  ok('state админа: isAdmin=true', r.isAdmin === true, r.isAdmin);

  for (const a of ['admin_stats', 'admin_players', 'admin_grant']) {
    r = await call(PLAYER, { action: a, amount: 1000 });
    ok(a + ' для не-админа → forbidden', r.ok === false && r.reason === 'forbidden', r);
  }

  console.log('\n— admin_stats —');
  r = await call(ADMIN, { action: 'admin_stats' });
  const s = r.stats || {};
  ok('users=4', s.users === 4, s.users);
  ok('new24h=1 (Ann)', s.new24h === 1, s.new24h);
  ok('new7d=2', s.new7d === 2, s.new7d);
  ok('active24h=2', s.active24h === 2, s.active24h);
  ok('openClaims=1', s.openClaims === 1, s.openClaims);
  ok('starsInClaims=800', s.starsInClaims === 800, s.starsInClaims);
  ok('starsHeld=12500', s.starsHeld === 12500, s.starsHeld);
  ok('bets7d=1500', s.bets7d === 1500, s.bets7d);
  ok('wins7d=1200', s.wins7d === 1200, s.wins7d);
  ok('rake7d=300', s.rake7d === 300, s.rake7d);
  ok('topups7d=5000 (строка старой валюты не влилась)', s.topups7d === 5000, s.topups7d);
  ok('referral7d=30', s.referral7d === 30, s.referral7d);
  ok('старые поля убраны', s.tonHeld === undefined && s.moneyHeld === undefined, s);
  ok('зарезервировано в заявках', typeof s.starsInClaims === 'number', s.starsInClaims);
  ok('capped=false', s.scan && s.scan.capped === false, s.scan);

  console.log('\n— admin_players —');
  r = await call(ADMIN, { action: 'admin_players' });
  ok('total=4', r.total === 4, r.total);
  ok('сортировка по last_seen desc', r.players[0].tg_id === 777, r.players.map((p) => p.tg_id));
  ok('флаг isAdmin у 777', r.players[0].isAdmin === true, r.players[0]);
  ok('флаг isAdmin у 101 = false', r.players.find((p) => p.tg_id === 101).isAdmin === false);
  r = await call(ADMIN, { action: 'admin_players', q: '101' });
  ok('поиск по tg_id', r.total === 1 && r.players[0].tg_id === 101, r.players);
  r = await call(ADMIN, { action: 'admin_players', q: 'kol' });
  ok('поиск по username', r.total === 1 && r.players[0].tg_id === 101, r.players);
  r = await call(ADMIN, { action: 'admin_players', q: 'Ann(a)' });
  ok('спецсимволы в имени ищутся как есть', r.ok === true && r.total === 1 && r.players[0].tg_id === 102, r);
  r = await call(ADMIN, { action: 'admin_players', limit: 2, offset: 2 });
  ok('постраничность: хвост списка', r.players.length === 2 && r.total === 4, r);
  r = await call(ADMIN, { action: 'admin_players', limit: 999 });
  ok('limit ограничен сотней', r.limit === 100, r.limit);
  r = await call(ADMIN, { action: 'admin_players', sort: 'stars' });
  ok('сортировка по звёздам', r.players[0].tg_id === 777, r.players.map((p) => p.stars));

  console.log('\n— admin_grant —');
  const before = Number(DB.users[0].stars_balance);
  r = await call(ADMIN, { action: 'admin_grant', amount: 1000, key: 'k1' });
  ok('начисление себе прошло', r.ok === true && r.target === 777, r);
  ok('баланс вырос на 1000 ⭐', Number(DB.users[0].stars_balance) === before + 1000, DB.users[0].stars_balance);
  ok('в ответе publicUser', r.user && r.user.stars === before + 1000, r.user);
  const lg = CALLS.find((c) => c.path === 'LEDGER');
  ok('ledger kind=adjust, currency=stars', lg.body.p_kind === 'adjust' && lg.body.p_currency === 'stars', lg.body);
  ok('idem содержит ключ', lg.body.p_idem === 'admin_grant:777:777:k1', lg.body.p_idem);
  ok('meta.admin_grant', lg.body.p_meta.admin_grant === 1 && lg.body.p_meta.by === 777, lg.body.p_meta);

  r = await call(ADMIN, { action: 'admin_grant', amount: -5000, key: 'k2' });
  ok('списание себе тоже можно', r.ok === true, r);
  r = await call(ADMIN, { action: 'admin_grant', amount: 100, tg: 101, key: 'k3' });
  ok('чужому игроку нельзя', r.ok === false && r.reason === 'target_not_admin', r);
  for (const bad of [0, NaN, 'abc', 99999999, -99999999, undefined, 0.4]) {
    r = await call(ADMIN, { action: 'admin_grant', amount: bad, key: 'k5' });
    ok('сумма ' + String(bad) + ' отклонена', r.ok === false && r.reason === 'bad_amount', r);
  }
  r = await call(ADMIN, { action: 'admin_grant', amount: 1090, key: 'k6' });
  ok('крупная сумма проходит', r.ok === true && r.amount === 1090, r);
  r = await call(ADMIN, { action: 'admin_grant', amount: 1, key: 'k6b' });
  ok('одна звезда — минимальное начисление', r.ok === true && r.amount === 1, r);
  r = await call(ADMIN, { action: 'admin_grant', amount: 100, tg: 888, key: 'k7' });
  ok('второй админ есть в ADMIN_IDS, но нет в БД → no_user', r.reason === 'no_user', r);
  r = await call(ADMIN, { action: 'admin_grant', amount: 100, key: 'a b/c;d' });
  const lg2 = CALLS.find((c) => c.path === 'LEDGER');
  ok('опасные символы в ключе вычищены', /^admin_grant:777:777:[\w:.-]+$/.test(lg2.body.p_idem), lg2.body.p_idem);
  r = await call(ADMIN, { action: 'admin_grant', amount: 100 });
  const lg3 = CALLS.find((c) => c.path === 'LEDGER');
  ok('без ключа генерится случайный', lg3.body.p_idem.length > 20, lg3.body.p_idem);

  console.log('\n— PVP: админ и живые игроки не в одном раунде —');
  PVP_BETS_SEATED = [];
  r = await call(ADMIN, { action: 'pvp_join', bet: 25 });
  ok('пустой раунд: админ входит', r.ok === true, r);
  PVP_BETS_SEATED = [{ tg_id: 101 }];
  r = await call(ADMIN, { action: 'pvp_join', bet: 25 });
  ok('в раунде живой игрок → админа не пускаем', r.ok === false && (r.reason === 'round_mixed' || r.reason === 'round_mixed_admin'), r);
  r = await call(PLAYER, { action: 'pvp_join', bet: 25 });
  ok('тот же живой игрок входит нормально', r.ok === true, r);
  PVP_BETS_SEATED = [{ tg_id: 777 }];
  r = await call(PLAYER, { action: 'pvp_join', bet: 25 });
  ok('в раунде админ → живого игрока не пускаем', r.ok === false && (r.reason === 'round_mixed' || r.reason === 'round_mixed_admin'), r);
  r = await call(ADMIN, { action: 'pvp_join', bet: 25 });
  ok('админ к своей же ставке — не блокируется', r.ok === true, r);
  PVP_BETS_SEATED = [{ tg_id: null }, { tg_id: null }];
  r = await call(ADMIN, { action: 'pvp_join', bet: 25 });
  ok('боты (tg_id=null) не мешают админу', r.ok === true, r);
  r = await call(PLAYER, { action: 'pvp_join', bet: 25 });
  ok('боты не мешают и живому игроку', r.ok === true, r);

  console.log('\n' + (fails ? '✗ провалов: ' + fails : '✓ все проверки пройдены'));
  process.exit(fails ? 1 : 0);
})();
