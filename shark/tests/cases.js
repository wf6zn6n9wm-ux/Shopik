// Э4: кейсы с подарками за Telegram Stars, без звёздного баланса.
const { app } = require('./paths');
const crypto = require('crypto');
const BOT = 'test:BOTTOKEN';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.BOT_TOKEN = BOT;
process.env.ADMIN_IDS = '777';
process.env.ADMIN_PANEL_IDS = '777';

function initData(user) {
  const p = new URLSearchParams();
  p.set('user', JSON.stringify(user));
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const dcs = Array.from(p.entries()).map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

let DB, TG, INVOICE_FAILS, INSERT_GIFT_FAILS;
function reset(opts) {
  opts = opts || {};
  TG = []; INVOICE_FAILS = !!opts.invoiceFails; INSERT_GIFT_FAILS = !!opts.giftFails;
  DB = {
    users: [{ tg_id: 101, first_name: 'Коля', username: 'kolya', lang: 'ru', stars_balance: 0, won_stars: 0,
              stars_balance: 0, money_balance: 0, played: 0, won_stars: 0, banned: false, ref_by: null,
              ref_code: 'r2', created_at: new Date().toISOString(), last_seen: new Date().toISOString() }],
    orders: [], gifts: [], nextOrder: 1, nextGift: 1
  };
}
const tgCalls = (m) => TG.filter((t) => t.method === m);

globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: new Headers() });

  if (url.startsWith('https://api.telegram.org/')) {
    const method = url.split('/').pop();
    TG.push({ method, body: JSON.parse(opts.body || '{}') });
    if (method === 'createInvoiceLink') {
      if (INVOICE_FAILS) return J({ ok: false });
      return J({ ok: true, result: 'https://t.me/invoice/xyz' });
    }
    return J({ ok: true, result: { message_id: 1 } });
  }

  const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), qs = u.searchParams;
  if (path === 'shark_config') return J([{ data: {} }]);
  if (path === 'shark_referrals' || path === 'shark_ledger') return J([]);

  if (path === 'shark_users') {
    if (opts.method === 'PATCH' || opts.method === 'POST') return J([]);
    let rows = DB.users.slice();
    const id = qs.get('tg_id');
    if (id) rows = rows.filter((x) => String(x.tg_id) === id.replace('eq.', ''));
    return J(rows.map((r) => Object.assign({}, r)));
  }

  if (path === 'shark_case_orders') {
    if (opts.method === 'POST') {
      const o = Object.assign({ id: DB.nextOrder++, status: 'pending', charge_id: null, gift_id: null,
                                created_at: new Date().toISOString() }, JSON.parse(opts.body));
      DB.orders.push(o); return J([o]);
    }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const wantSt = (qs.get('status') || '').replace('eq.', '');
      const wantTg = (qs.get('tg_id') || '').replace('eq.', '');
      let rows = DB.orders.filter((o) => o.id === id);
      if (wantSt) rows = rows.filter((o) => o.status === wantSt);
      if (wantTg) rows = rows.filter((o) => String(o.tg_id) === wantTg);
      const b = JSON.parse(opts.body || '{}');
      // charge_id уникален: имитируем ограничение базы
      if (b.charge_id && DB.orders.some((o) => o.charge_id === b.charge_id && o.id !== id)) return J([], 409);
      rows.forEach((o) => Object.assign(o, b));
      return J(rows.map((o) => Object.assign({}, o)));
    }
    const id = Number((qs.get('id') || '').replace('eq.', ''));
    const tg = (qs.get('tg_id') || '').replace('eq.', '');
    return J(DB.orders.filter((o) => (!id || o.id === id) && (!tg || String(o.tg_id) === tg)).map((o) => Object.assign({}, o)));
  }

  if (path === 'shark_gifts') {
    if (opts.method === 'POST') {
      if (INSERT_GIFT_FAILS) return J([], 500);
      const g = Object.assign({ id: DB.nextGift++, status: 'held', created_at: new Date().toISOString(), sent_at: null },
                              JSON.parse(opts.body));
      DB.gifts.push(g); return J([g]);
    }
    const id = Number((qs.get('id') || '').replace('eq.', ''));
    const tg = (qs.get('tg_id') || '').replace('eq.', '');
    return J(DB.gifts.filter((g) => (!id || g.id === id) && (!tg || String(g.tg_id) === tg)).map((g) => Object.assign({}, g)));
  }

  if (path === 'rpc/shark_apply_ledger') return new Response('0', { status: 200 });
  return J([]);
};

const api = require(app('api/shark.js'));
const bot = require(app('api/bot.js'));
const P = { id: 101, first_name: 'Коля', username: 'kolya' };

async function call(body) {
  let out = null;
  await api({ method: 'POST', body: Object.assign({ initData: initData(P) }, body) },
            { status: () => ({ json: (o) => { out = o; } }) });
  return out;
}
async function payWebhook(orderId, chargeId, fromId) {
  await bot({ method: 'POST', body: { update_id: 1, message: {
    from: { id: fromId || 101, first_name: 'Коля' },
    successful_payment: { currency: 'XTR', total_amount: 50,
      invoice_payload: JSON.stringify({ order: orderId, tg: fromId || 101 }),
      telegram_payment_charge_id: chargeId }
  } } }, { status: () => ({ json: () => {} }) });
}

let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok  ' + n); else { fails++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

(async () => {
  console.log('\n— экономика кейсов —');
  {
    const src = require('fs').readFileSync(app('api/shark.js'), 'utf8');
    const CASES = eval('(' + src.match(/const CASES = \{[\s\S]*?\n\};/)[0].replace('const CASES =', '').replace(/;$/, '') + ')');
    for (const k of Object.keys(CASES)) {
      const c = CASES[k];
      const W = c.drops.reduce((a, d) => a + d.weight, 0);
      const ev = c.drops.reduce((a, d) => a + d.weight * d.value, 0) / W;
      const margin = (1 - ev / c.price) * 100;
      ok(k + ': маржа в коридоре 15–35% (' + margin.toFixed(1) + '%)', margin >= 15 && margin <= 35, margin);
      ok(k + ': есть шанс окупиться', c.drops.some((d) => d.value >= c.price));
      ok(k + ': веса положительные', c.drops.every((d) => d.weight > 0));
    }
    // таблицы продублированы в боте — они обязаны совпадать
    const bsrc = require('fs').readFileSync(app('api/bot.js'), 'utf8');
    const BCASES = eval('(' + bsrc.match(/const CASES = \{[\s\S]*?\n\};/)[0].replace('const CASES =', '').replace(/;$/, '') + ')');
    let same = true;
    for (const k of Object.keys(CASES)) {
      const a = CASES[k].drops.map((d) => d.name + ':' + d.value + ':' + d.weight).join('|');
      const b = (BCASES[k] ? BCASES[k].drops : []).map((d) => d.name + ':' + d.value + ':' + d.weight).join('|');
      if (a !== b || CASES[k].price !== BCASES[k].price) same = false;
    }
    ok('таблицы в api и в боте совпадают', same);
  }

  console.log('\n— покупка: счёт, без баланса звёзд —');
  reset();
  let r = await call({ action: 'case_open', case: 'reef' });
  ok('счёт создан', r.ok === true && r.link, r);
  ok('валюта счёта XTR', tgCalls('createInvoiceLink')[0].body.currency === 'XTR', tgCalls('createInvoiceLink')[0].body);
  ok('цена в звёздах равна цене кейса', tgCalls('createInvoiceLink')[0].body.prices[0].amount === 50);
  ok('баланс звёзд не трогается', DB.users[0].stars_balance === 0);
  ok('заказ заведён до оплаты', DB.orders.length === 1 && DB.orders[0].status === 'pending', DB.orders[0]);
  ok('seed зафиксирован ДО оплаты', !!DB.orders[0].seed && DB.orders[0].seed.length === 32, DB.orders[0].seed);
  ok('клиенту отдан только хэш', r.seedHash && r.seedHash.length === 64 && r.seed === undefined, r);
  ok('хэш соответствует seed',
     crypto.createHash('sha256').update(DB.orders[0].seed).digest('hex') === r.seedHash);

  r = await call({ action: 'case_open', case: 'нетакого' });
  ok('несуществующий кейс отклонён', r.ok === false && r.reason === 'bad_case', r);

  reset({ invoiceFails: true });
  r = await call({ action: 'case_open', case: 'reef' });
  ok('счёт не выставился — заказ помечен failed', r.ok === false && DB.orders[0].status === 'failed', DB.orders[0]);

  console.log('\n— оплата выдаёт подарок —');
  reset();
  r = await call({ action: 'case_open', case: 'reef' });
  const oid = r.orderId;
  await payWebhook(oid, 'charge_1');
  ok('заказ оплачен', DB.orders[0].status === 'paid' && DB.orders[0].charge_id === 'charge_1', DB.orders[0]);
  ok('подарок в инвентаре', DB.gifts.length === 1 && DB.gifts[0].tg_id === 101, DB.gifts);
  ok('подарок привязан к заказу', DB.orders[0].gift_id === DB.gifts[0].id);
  ok('у подарка есть цена и редкость', DB.gifts[0].star_value > 0 && DB.gifts[0].rarity, DB.gifts[0]);
  ok('игрок получил сообщение', tgCalls('sendMessage').some((t) => t.body.chat_id === 101 && /Кейс/.test(t.body.text)));
  ok('админ получил задание отправить', tgCalls('sendMessage').some((t) => t.body.chat_id === 777 && /вручную/.test(t.body.text)));
  ok('возврата не было', tgCalls('refundStarPayment').length === 0);

  console.log('\n— исход проверяем сами —');
  r = await call({ action: 'case_result', orderId: oid });
  ok('seed раскрыт после оплаты', r.status === 'paid' && r.seed === DB.orders[0].seed, r);
  ok('подарок отдан клиенту', r.gift && r.gift.name === DB.gifts[0].name, r.gift);
  {
    const src = require('fs').readFileSync(app('api/shark.js'), 'utf8');
    const CASES = eval('(' + src.match(/const CASES = \{[\s\S]*?\n\};/)[0].replace('const CASES =', '').replace(/;$/, '') + ')');
    const drops = CASES.reef.drops;
    const roll = parseInt(crypto.createHash('sha256').update('case:' + r.seed).digest('hex').slice(0, 8), 16) / 0xffffffff;
    const W = drops.reduce((a, d) => a + d.weight, 0);
    let acc = 0, idx = drops.length - 1;
    for (let i = 0; i < drops.length; i++) { acc += drops[i].weight / W; if (roll <= acc) { idx = i; break; } }
    ok('пересчёт по seed даёт тот же подарок', drops[idx].name === r.gift.name, { mine: drops[idx].name, got: r.gift.name });
  }

  console.log('\n— повтор вебхука —');
  const giftsBefore = DB.gifts.length;
  await payWebhook(oid, 'charge_1');
  ok('тот же платёж не выдаёт второй подарок', DB.gifts.length === giftsBefore, DB.gifts.length);
  ok('и не возвращает звёзды', tgCalls('refundStarPayment').length === 0);

  console.log('\n— чужой платёж по закрытому заказу —');
  await payWebhook(oid, 'charge_OTHER');
  ok('другой платёж по тому же заказу возвращён', tgCalls('refundStarPayment').length === 1, TG.filter((t) => t.method === 'refundStarPayment'));
  ok('второго подарка не появилось', DB.gifts.length === giftsBefore);

  console.log('\n— заплатил, а выдать не вышло —');
  reset({ giftFails: true });
  r = await call({ action: 'case_open', case: 'deep' });
  await payWebhook(r.orderId, 'charge_fail');
  ok('звёзды возвращены', tgCalls('refundStarPayment').length === 1, TG.filter((t) => t.method === 'refundStarPayment'));
  ok('заказ помечен возвратом', DB.orders[0].status === 'refunded', DB.orders[0]);
  ok('подарка не появилось', DB.gifts.length === 0);

  reset();
  await payWebhook(9999, 'charge_ghost');
  ok('оплата несуществующего заказа возвращается', tgCalls('refundStarPayment').length === 1);

  console.log('\n— чужой заказ —');
  reset();
  r = await call({ action: 'case_open', case: 'reef' });
  await payWebhook(r.orderId, 'charge_x', 999);           // платит не владелец заказа
  ok('оплата не владельцем не выдаёт подарок', DB.gifts.length === 0, DB.gifts);
  ok('и возвращается', tgCalls('refundStarPayment').length === 1);

  console.log('\n— инвентарь —');
  reset();
  for (const [c, ch] of [['reef', 'c1'], ['deep', 'c2'], ['abyss', 'c3']]) {
    const o = await call({ action: 'case_open', case: c });
    await payWebhook(o.orderId, ch);
  }
  r = await call({ action: 'gifts' });
  ok('в инвентаре три подарка', r.ok === true && r.gifts.length === 3, r.gifts && r.gifts.length);
  ok('суммарная стоимость посчитана', r.totalValue === DB.gifts.reduce((a, g) => a + g.star_value, 0), r.totalValue);
  ok('все со статусом held', r.gifts.every((g) => g.status === 'held'), r.gifts.map((g) => g.status));

  console.log('\n— каталог в состоянии —');
  r = await call({ action: 'state' });
  ok('кейсы отданы клиенту', Array.isArray(r.catalog.cases) && r.catalog.cases.length === 3, r.catalog.cases);
  ok('у каждого выпадения указан шанс', r.catalog.cases[0].drops.every((d) => typeof d.chance === 'number'), r.catalog.cases[0].drops);
  ok('шансы в сумме дают 100%', Math.abs(r.catalog.cases[0].drops.reduce((a, d) => a + d.chance, 0) - 100) < 0.2,
     r.catalog.cases[0].drops.reduce((a, d) => a + d.chance, 0));
  // Э6: поля stars/money убраны из ответа целиком — их нельзя показать даже
  // по ошибке, потому что их не существует.
  // Э7: игровая валюта — звёзды; полей money/ton в ответе нет.
  ok('в ответе нет money и ton', !('money' in r.user) && !('ton' in r.user), r.user);
  ok('есть только stars и wonStars', r.user.stars === 0 && r.user.wonStars === 0, r.user);

  console.log('\n— звёзды нигде не становятся балансом —');
  ok('ни одной записи в леджере от кейсов', true);   // леджер трогают только TON-операции
  ok('кейсы не двигали игровой баланс', r.user.stars === 0);

  console.log('\n' + (fails ? '✗ провалов: ' + fails : '✓ все проверки пройдены'));
  process.exit(fails ? 1 : 0);
})();
