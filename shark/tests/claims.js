// Э7: звёзды как игровая валюта, наборы вместо суммы, заявка вместо выплаты.
const { app } = require('./paths');
const crypto = require('crypto');
const fs = require('fs');
const BOT = 'test:BOTTOKEN';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.BOT_TOKEN = BOT;
process.env.BOT_USERNAME = 'Shark_game_app_bot';
process.env.ADMIN_IDS = '777';
process.env.ADMIN_PANEL_IDS = '777';
process.env.CRYPTOBOT_TOKEN = 'cb';

function initData(user) {
  const p = new URLSearchParams();
  p.set('user', JSON.stringify(user));
  p.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const dcs = Array.from(p.entries()).map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}

let DB, TG, CB;
function reset(stars) {
  TG = []; CB = { invoices: [], nextId: 900 };
  DB = {
    users: [
      { tg_id: 101, username: 'kolya', first_name: 'Коля', lang: 'ru',
        stars_balance: stars == null ? 1000 : stars, won_stars: 0, played: 0,
        banned: false, ref_by: null, ref_code: 'r2',
        created_at: new Date().toISOString(), last_seen: new Date().toISOString() },
      { tg_id: 777, username: 'boss', first_name: 'Админ', lang: 'ru',
        stars_balance: 0, won_stars: 0, played: 0, banned: false, ref_by: null, ref_code: 'r1',
        created_at: new Date().toISOString(), last_seen: new Date().toISOString() }
    ],
    ledger: [], claims: [], topups: [], taskClaims: [], bets: [], pvpBets: [], gifts: [], refs: [],
    nextClaim: 1, nextTopup: 1, nextTask: 1
  };
}
const tgCalls = (m) => TG.filter((t) => t.method === m);
const bal = (id) => Number(DB.users.find((u) => u.tg_id === id).stars_balance);

globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  const J = (o, st, hdr) => new Response(JSON.stringify(o), { status: st || 200, headers: new Headers(hdr || {}) });

  if (url.startsWith('https://api.telegram.org/')) {
    const method = url.split('/').pop();
    TG.push({ method, body: JSON.parse(opts.body || '{}') });
    if (method === 'createInvoiceLink') return J({ ok: true, result: 'https://t.me/invoice/xtr' });
    return J({ ok: true, result: { message_id: 1 } });
  }
  if (url.startsWith('https://pay.crypt.bot/api/createInvoice')) {
    const b = JSON.parse(opts.body || '{}');
    const inv = { invoice_id: ++CB.nextId, status: 'active', asset: b.asset, amount: b.amount,
                  payload: b.payload, bot_invoice_url: 'https://t.me/CryptoBot?start=' + CB.nextId };
    CB.invoices.push(inv);
    return J({ ok: true, result: inv });
  }
  if (url.startsWith('https://pay.crypt.bot/api/getInvoices')) {
    const id = Number(new URL(url).searchParams.get('invoice_ids'));
    const inv = CB.invoices.find((i) => i.invoice_id === id);
    return J({ ok: true, result: { items: inv ? [inv] : [] } });
  }

  const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), qs = u.searchParams;
  const inList = (f, v) => f.slice(3).replace(/^\(|\)$/g, '').split(',').includes(String(v));

  if (path === 'shark_config') return J([{ data: {} }]);
  if (path === 'shark_pvp_rounds') return J([]);

  // Считалки прогресса заданий: сервер спрашивает Content-Range, а не строки
  const counting = (opts.headers && (opts.headers.Prefer || '').includes('count=exact'));
  const cnt = (n) => J([], 206, { 'content-range': '0-0/' + n });
  if (path === 'shark_bets') return counting ? cnt(DB.bets.length) : J(DB.bets);
  if (path === 'shark_pvp_bets') return counting ? cnt(DB.pvpBets.length) : J(DB.pvpBets);
  if (path === 'shark_gifts') return counting ? cnt(DB.gifts.length) : J(DB.gifts);
  if (path === 'shark_referrals') return counting ? cnt(DB.refs.length) : J(DB.refs);

  if (path === 'shark_task_claims') {
    if (opts.method === 'POST') {
      const c = Object.assign({ id: DB.nextTask++, created_at: new Date().toISOString() }, JSON.parse(opts.body));
      // idem уникален — это и есть защита от двойного начисления
      if (DB.taskClaims.some((x) => x.idem === c.idem)) return J({ message: 'duplicate' }, 409);
      DB.taskClaims.push(c); return J([c]);
    }
    return J(DB.taskClaims.map((c) => Object.assign({}, c)));
  }

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
    const id = qs.get('tg_id');
    if (id && id.startsWith('eq.')) rows = rows.filter((x) => String(x.tg_id) === id.slice(3));
    return J(rows.map((r) => Object.assign({}, r)));
  }

  if (path === 'shark_ledger') {
    const idem = qs.get('idem');
    if (idem) {
      const v = decodeURIComponent(idem.replace('eq.', ''));
      return J(DB.ledger.filter((l) => l.idem === v).map((l) => ({ id: 1 })));
    }
    let rows = DB.ledger.slice();
    const kind = qs.get('kind');
    if (kind) rows = rows.filter((l) => l.kind === kind.replace('eq.', ''));
    return J(rows);
  }

  if (path === 'shark_claims') {
    if (opts.method === 'POST') {
      const c = Object.assign({ id: DB.nextClaim++, status: 'new', created_at: new Date().toISOString(),
                                decided_at: null, decided_by: null }, JSON.parse(opts.body));
      // частичный уникальный индекс: одна открытая заявка на игрока
      if (DB.claims.some((x) => x.tg_id === c.tg_id && (x.status === 'new' || x.status === 'in_review'))) {
        return J({ message: 'duplicate' }, 409);
      }
      DB.claims.push(c); return J([c]);
    }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const stf = qs.get('status');
      let rows = DB.claims.filter((c) => c.id === id);
      if (stf) rows = rows.filter((c) => stf.startsWith('in.') ? inList(stf, c.status) : c.status === stf.replace('eq.', ''));
      const b = JSON.parse(opts.body || '{}');
      rows.forEach((c) => Object.assign(c, b));
      return J(rows.map((c) => Object.assign({}, c)));
    }
    let rows = DB.claims.slice();
    const tg = qs.get('tg_id'), id = qs.get('id'), stf = qs.get('status');
    if (tg) rows = rows.filter((c) => String(c.tg_id) === tg.replace('eq.', ''));
    if (id) rows = rows.filter((c) => String(c.id) === id.replace('eq.', ''));
    if (stf) rows = rows.filter((c) => stf.startsWith('in.') ? inList(stf, c.status) : c.status === stf.replace('eq.', ''));
    return J(rows.map((c) => Object.assign({}, c)));
  }

  if (path === 'shark_topups') {
    if (opts.method === 'POST') {
      const o = Object.assign({ id: DB.nextTopup++, status: 'pending', charge_id: null,
                                created_at: new Date().toISOString() }, JSON.parse(opts.body));
      DB.topups.push(o); return J([o]);
    }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const stf = (qs.get('status') || '').replace('eq.', '');
      const tg = (qs.get('tg_id') || '').replace('eq.', '');
      let rows = DB.topups.filter((o) => o.id === id);
      if (stf) rows = rows.filter((o) => o.status === stf);
      if (tg) rows = rows.filter((o) => String(o.tg_id) === tg);
      const b = JSON.parse(opts.body || '{}');
      if (b.charge_id && DB.topups.some((o) => o.charge_id === b.charge_id && o.id !== id)) return J([], 409);
      rows.forEach((o) => Object.assign(o, b));
      return J(rows.map((o) => Object.assign({}, o)));
    }
    const id = Number((qs.get('id') || '').replace('eq.', ''));
    return J(DB.topups.filter((o) => !id || o.id === id).map((o) => Object.assign({}, o)));
  }

  if (path === 'rpc/shark_apply_ledger') {
    const b = JSON.parse(opts.body);
    // как в схеме после Э7: двигать можно только целые stars
    if (b.p_currency !== 'stars') return new Response('{"message":"read-only"}', { status: 400 });
    if (Number(b.p_amount) !== Math.trunc(Number(b.p_amount))) {
      return new Response('{"message":"stars must be whole"}', { status: 400 });
    }
    if (b.p_idem && DB.ledger.some((l) => l.idem === b.p_idem)) return new Response('0', { status: 200 });
    const usr = DB.users.find((x) => Number(x.tg_id) === Number(b.p_tg));
    if (!usr) return new Response('{"message":"no user"}', { status: 400 });
    const next = Number(usr.stars_balance) + Number(b.p_amount);
    if (next < 0) return new Response('{"message":"insufficient"}', { status: 400 });
    usr.stars_balance = next;
    DB.ledger.push({ tg: b.p_tg, currency: b.p_currency, amount: Number(b.p_amount), kind: b.p_kind, idem: b.p_idem });
    return new Response('0', { status: 200 });
  }
  return J([]);
};

const api = require(app('api/shark.js'));
const bot = require(app('api/bot.js'));
const PLAYER = { id: 101, first_name: 'Коля', username: 'kolya' };
const ADMIN = { id: 777, first_name: 'Админ', username: 'boss' };

async function call(who, body) {
  let out = null;
  await api({ method: 'POST', body: Object.assign({ initData: initData(who) }, body) },
            { status: () => ({ json: (o) => { out = o; } }) });
  return out;
}
async function cb(data, fromId) {
  await bot({ method: 'POST', body: { update_id: 1, callback_query: {
    id: 'cq', data, from: { id: fromId }, message: { message_id: 5, chat: { id: fromId }, text: 'карточка' }
  } } }, { status: () => ({ json: () => {} }) });
}
async function startBot(fromId, param) {
  await bot({ method: 'POST', body: { update_id: 2, message: {
    chat: { id: fromId }, from: { id: fromId, first_name: 'Коля' }, text: '/start ' + param
  } } }, { status: () => ({ json: () => {} }) });
}
async function xtrPay(topupId, chargeId, fromId) {
  await bot({ method: 'POST', body: { update_id: 3, message: {
    from: { id: fromId, first_name: 'Коля' },
    successful_payment: { currency: 'XTR', total_amount: 250,
      invoice_payload: JSON.stringify({ topup: topupId, tg: fromId }),
      telegram_payment_charge_id: chargeId }
  } } }, { status: () => ({ json: () => {} }) });
}

let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok  ' + n); else { fails++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

(async () => {
  // ── валюта ────────────────────────────────────────────────────────────────
  console.log('\n— игровая валюта: только звёзды —');
  reset(1000);
  {
    const st = await call(PLAYER, { action: 'state' });
    ok('баланс в звёздах', st.user.stars === 1000, st.user);
    ok('никакого TON в ответе', st.user.ton === undefined && st.user.wonTon === undefined, st.user);
    ok('ставки целые', st.catalog.bets.every((b) => Number.isInteger(b)), st.catalog.bets);
    ok('в каталоге нет сумм пополнения', st.catalog.topups === undefined);
    ok('вместо них наборы', Array.isArray(st.catalog.packs) && st.catalog.packs.length > 0);

    await call(PLAYER, { action: 'game_bet', game: 'roulette', bet: 25 });
    ok('движение только в stars', DB.ledger.every((l) => l.currency === 'stars'), DB.ledger.map((l) => l.currency));
    ok('суммы целые', DB.ledger.every((l) => Number.isInteger(l.amount)), DB.ledger.map((l) => l.amount));
  }
  {
    const r = await call(PLAYER, { action: 'game_bet', game: 'roulette', bet: 25.5 });
    ok('дробный вход отклонён', r.ok === false && r.reason === 'bad_bet', r);
    const r2 = await call(PLAYER, { action: 'game_bet', game: 'roulette', bet: 7 });
    ok('вход ниже минимума отклонён', r2.ok === false && r2.reason === 'bad_bet', r2);
  }

  // ── наборы звёзд ──────────────────────────────────────────────────────────
  console.log('\n— наборы: один и тот же результат при любой оплате —');
  reset(0);
  {
    const st = await call(PLAYER, { action: 'state' });
    const p = st.catalog.packs[0];
    ok('у набора есть три цены', p.price.xtr > 0 && p.price.ton > 0 && p.price.usdt > 0, p.price);
    ok('и одно число звёзд', Number.isInteger(p.stars) && p.stars > 0, p);
    // Курса в ответе быть не должно: пересчёта нет, есть прайс.
    ok('никакого курса в каталоге',
      JSON.stringify(st.catalog).indexOf('rate') < 0 && st.catalog.rate === undefined);

    const xtr = await call(PLAYER, { action: 'topup_start', pack: p.key, method: 'xtr' });
    ok('счёт в Telegram Stars открыт', xtr.ok && xtr.method === 'xtr' && !!xtr.link, xtr);
    ok('заказ заведён до оплаты', DB.topups.length === 1 && DB.topups[0].status === 'pending');
    ok('звёзды ещё не начислены', bal(101) === 0);

    await xtrPay(DB.topups[0].id, 'ch_1', 101);
    ok('после оплаты начислено ровно stars набора', bal(101) === p.stars, bal(101));
    await xtrPay(DB.topups[0].id, 'ch_1', 101);
    ok('повторный вебхук не удваивает', bal(101) === p.stars, bal(101));
  }
  reset(0);
  {
    const st = await call(PLAYER, { action: 'state' });
    const p = st.catalog.packs[1];
    const ton = await call(PLAYER, { action: 'topup_start', pack: p.key, method: 'ton' });
    ok('счёт @CryptoBot в TON открыт', ton.ok && !!ton.payUrl && !!ton.invoiceId, ton);
    const inv = CB.invoices.find((i) => i.invoice_id === ton.invoiceId);
    ok('счёт выставлен в TON на цену набора', inv.asset === 'TON' && Number(inv.amount) === p.price.ton, inv);

    let chk = await call(PLAYER, { action: 'topup_check', invoiceId: ton.invoiceId });
    ok('неоплаченный счёт ничего не зачисляет', chk.ok && chk.status === 'active' && bal(101) === 0, chk);
    inv.status = 'paid';
    chk = await call(PLAYER, { action: 'topup_check', invoiceId: ton.invoiceId });
    ok('оплата TON зачисляет звёзды набора', chk.ok && chk.credited && chk.stars === p.stars && bal(101) === p.stars, chk);
    const again = await call(PLAYER, { action: 'topup_check', invoiceId: ton.invoiceId });
    ok('повторная проверка не удваивает', again.credited === true && bal(101) === p.stars, bal(101));
  }
  reset(0);
  {
    // Ключевое свойство: TON и USDT за один набор дают одинаковые звёзды.
    const st = await call(PLAYER, { action: 'state' });
    const p = st.catalog.packs[2];
    const a = await call(PLAYER, { action: 'topup_start', pack: p.key, method: 'ton' });
    const b = await call(PLAYER, { action: 'topup_start', pack: p.key, method: 'usdt' });
    ok('оба способа обещают одни и те же звёзды', a.stars === b.stars && a.stars === p.stars, [a.stars, b.stars]);
    const iu = CB.invoices.find((i) => i.invoice_id === b.invoiceId);
    ok('USDT-счёт выставлен в USDT', iu.asset === 'USDT' && Number(iu.amount) === p.price.usdt, iu);
    const bad = await call(PLAYER, { action: 'topup_start', pack: p.key, method: 'btc' });
    ok('незнакомый способ отклонён', bad.ok === false && bad.reason === 'bad_method', bad);
    const bad2 = await call(PLAYER, { action: 'topup_start', pack: 'zzz', method: 'ton' });
    ok('незнакомый набор отклонён', bad2.ok === false && bad2.reason === 'bad_pack', bad2);
  }
  {
    // Цена могла измениться, пока счёт висел: начисляем купленное, а не текущее.
    reset(0);
    const st = await call(PLAYER, { action: 'state' });
    const p = st.catalog.packs[0];
    const r = await call(PLAYER, { action: 'topup_start', pack: p.key, method: 'ton' });
    const inv = CB.invoices.find((i) => i.invoice_id === r.invoiceId);
    inv.status = 'paid';
    const pl = JSON.parse(inv.payload);
    ok('в payload зафиксированы звёзды набора', pl.stars === p.stars, pl);
    const chk = await call(PLAYER, { action: 'topup_check', invoiceId: r.invoiceId });
    ok('зачислено из payload', chk.stars === pl.stars, chk);
  }

  // ── заявка на выигрыш ─────────────────────────────────────────────────────
  console.log('\n— забрать выигрыш: заявка, а не выплата —');
  reset(2000);
  {
    const low = await call(PLAYER, { action: 'claim_create', amount: 100 });
    ok('ниже минимума — отказ', low.ok === false && low.reason === 'below_min', low);
    ok('и ничего не списано', bal(101) === 2000);

    const big = await call(PLAYER, { action: 'claim_create', amount: 999999 });
    ok('больше баланса — отказ', big.ok === false && big.reason === 'no_funds', big);

    const r = await call(PLAYER, { action: 'claim_create', amount: 1500, note: 'подарок' });
    ok('заявка создана', r.ok === true && r.id > 0, r);
    ok('звёзды зарезервированы, а не «обменяны»', bal(101) === 500, bal(101));
    ok('в леджере это claim_hold', DB.ledger.some((l) => l.kind === 'claim_hold' && l.amount === -1500));
    ok('никакой выплаты не произошло', !DB.ledger.some((l) => l.kind === 'withdraw' || l.kind === 'payout'));
    ok('отдана ссылка на бота', /^https:\/\/t\.me\/.+\?start=claim_\d+$/.test(r.botLink || ''), r.botLink);
    ok('срок разбора сообщён', r.hours > 0, r.hours);

    const adm = tgCalls('sendMessage').filter((m) => /Заявка на выигрыш/.test(m.body.text || ''));
    ok('админу пришла карточка', adm.length === 1, adm.length);
    ok('с кнопками решения', adm[0] && !!adm[0].body.reply_markup);

    const second = await call(PLAYER, { action: 'claim_create', amount: 500 });
    ok('вторая открытая заявка запрещена', second.ok === false && second.reason === 'already_open', second);
    ok('и резерв не изменился', bal(101) === 500);
  }
  {
    const list = await call(PLAYER, { action: 'claims' });
    ok('заявка видна в списке', list.ok && list.claims.length === 1, list);
    ok('со статусом «принята»', list.claims[0].status === 'new', list.claims[0]);
    ok('и суммой в звёздах', list.claims[0].stars === 1500);
    ok('минимум и срок отданы клиенту', list.minStars > 0 && list.hours > 0, list);
  }
  {
    // Бот только подтверждает приём — ничего не выдаёт и не считает.
    const before = bal(101);
    await startBot(101, 'claim_' + DB.claims[0].id);
    ok('бот перевёл заявку в «на рассмотрении»', DB.claims[0].status === 'in_review', DB.claims[0].status);
    ok('баланс от захода в бота не изменился', bal(101) === before);
    const msg = tgCalls('sendMessage').filter((m) => /Заявка #/.test(m.body.text || ''));
    ok('игроку подтвердили приём', msg.length >= 1);
  }

  // ── решение по заявке ─────────────────────────────────────────────────────
  console.log('\n— решение принимает человек —');
  {
    const id = DB.claims[0].id;
    await cb('cl_ok:' + id, 999);
    ok('не-админ решать не может', DB.claims[0].status === 'in_review');

    const before = bal(101);
    await cb('cl_ok:' + id, 777);
    ok('админ отметил выдачу', DB.claims[0].status === 'done', DB.claims[0]);
    ok('резерв НЕ вернулся: выигрыш выдан вне приложения', bal(101) === before, bal(101));
    ok('записан автор решения', DB.claims[0].decided_by === 777);
    const note = tgCalls('sendMessage').filter((m) => /выдан/.test(m.body.text || ''));
    ok('игрок уведомлён', note.length === 1, note.length);

    const n0 = tgCalls('sendMessage').length;
    await cb('cl_ok:' + id, 777);
    ok('повторное нажатие ничего не делает', tgCalls('sendMessage').length === n0);
  }
  {
    reset(2000);
    const r = await call(PLAYER, { action: 'claim_create', amount: 1200 });
    ok('новая заявка создана', r.ok === true);
    ok('резерв снят', bal(101) === 800);
    await cb('cl_no:' + r.id, 777);
    ok('отказ вернул звёзды', bal(101) === 2000, bal(101));
    ok('статус rejected', DB.claims[0].status === 'rejected');
    ok('в леджере claim_return', DB.ledger.some((l) => l.kind === 'claim_return' && l.amount === 1200));
    const n0 = bal(101);
    await cb('cl_no:' + r.id, 777);
    ok('повторный отказ не возвращает второй раз', bal(101) === n0, bal(101));

    const after = await call(PLAYER, { action: 'claim_create', amount: 1200 });
    ok('после закрытой заявки можно создать новую', after.ok === true, after);
  }

  // ── гонка двух решений ────────────────────────────────────────────────────
  console.log('\n— гонка решений —');
  {
    reset(2000);
    const r = await call(PLAYER, { action: 'claim_create', amount: 1000 });
    await Promise.all([cb('cl_no:' + r.id, 777), cb('cl_no:' + r.id, 777)]);
    ok('звёзды вернулись ровно один раз', bal(101) === 2000, bal(101));
    ok('одна строка возврата в леджере',
      DB.ledger.filter((l) => l.kind === 'claim_return').length === 1,
      DB.ledger.filter((l) => l.kind === 'claim_return').length);
  }

  // ── удалённые действия старой экономики ───────────────────────────────────
  console.log('\n— вывода в API больше нет —');
  reset(2000);
  {
    for (const act of ['withdraw_create', 'create_cryptobot_invoice', 'cryptobot_check', 'buy_gift', 'create_stars_invoice']) {
      const r = await call(PLAYER, { action: act, amount: 5 });
      ok(act + ' удалён', r.ok === false && r.reason === 'unknown_action', r);
    }
    ok('баланс не тронут ни одним из них', bal(101) === 2000);
  }

  // ── ручное начисление в админке ───────────────────────────────────────────
  console.log('\n— админка в звёздах —');
  reset(0);
  {
    const r = await call(ADMIN, { action: 'admin_grant', amount: 500, key: 'k1' });
    ok('начисление целыми звёздами', r.ok && r.amount === 500, r);
    ok('баланс админа вырос', bal(777) === 500);
    const frac = await call(ADMIN, { action: 'admin_grant', amount: 10.5, key: 'k2' });
    ok('дробное начисление отброшено к целому', frac.ok && frac.amount === 10, frac);
    const other = await call(ADMIN, { action: 'admin_grant', amount: 100, tg: 101, key: 'k3' });
    ok('чужому игроку нельзя', other.ok === false && other.reason === 'target_not_admin', other);
    const st = await call(ADMIN, { action: 'admin_stats' });
    ok('в сводке звёзды, а не TON',
      st.stats.starsHeld !== undefined && st.stats.tonHeld === undefined, st.stats);
    ok('и резерв заявок', st.stats.starsInClaims !== undefined, st.stats);
  }

  // ── задания ───────────────────────────────────────────────────────────────
  console.log('\n— задания: прогресс считает сервер —');
  reset(0);
  {
    const r = await call(PLAYER, { action: 'tasks' });
    ok('каталог отдан', r.ok && r.groups.length === 2, r.groups && r.groups.length);
    ok('есть дневные и разовые',
      r.groups.map((g) => g.key).join() === 'daily,once', r.groups.map((g) => g.key));
    const all = r.groups.reduce((a, g) => a.concat(g.tasks), []);
    ok('в каталоге нет заданий про пополнение',
      all.every((x) => !/topup|deposit|пополн/i.test(x.key)), all.map((x) => x.key));
    ok('всё с нулевым прогрессом', all.every((x) => x.progress === 0 || x.key === 'visit'), all);
    ok('«зайдите» выполнено самим фактом открытия',
      all.filter((x) => x.key === 'visit')[0].ready === true);
    ok('«сыграйте 25» ещё не готово',
      all.filter((x) => x.key === 'play25')[0].ready === false);
  }
  {
    // Прогресс берётся из базы, а не из того, что пришлёт клиент.
    const fake = await call(PLAYER, { action: 'tasks', progress: 999, played: 999 });
    const all = fake.groups.reduce((a, g) => a.concat(g.tasks), []);
    ok('присланный клиентом прогресс игнорируется',
      all.filter((x) => x.key === 'play25')[0].progress === 0);
  }

  console.log('\n— забрать награду —');
  reset(0);
  {
    const notReady = await call(PLAYER, { action: 'task_claim', task: 'play25' });
    ok('невыполненное забрать нельзя', notReady.ok === false && notReady.reason === 'not_ready', notReady);
    ok('и звёзды не начислены', bal(101) === 0);

    const bad = await call(PLAYER, { action: 'task_claim', task: 'нет-такого' });
    ok('незнакомое задание отклонено', bad.ok === false && bad.reason === 'bad_task', bad);

    const r = await call(PLAYER, { action: 'task_claim', task: 'visit' });
    ok('выполненное начисляет звёзды', r.ok && r.reward > 0, r);
    ok('баланс вырос ровно на награду', bal(101) === r.reward, bal(101));
    ok('в леджере вид операции task', DB.ledger.some((l) => l.kind === 'task' && l.amount === r.reward));

    const again = await call(PLAYER, { action: 'task_claim', task: 'visit' });
    ok('второй раз за сутки нельзя', again.ok === false && again.reason === 'already', again);
    ok('баланс не изменился', bal(101) === r.reward, bal(101));
  }
  {
    // Два быстрых тапа: выиграть должен ровно один — держится на уникальном idem.
    reset(0);
    const [a, b] = await Promise.all([
      call(PLAYER, { action: 'task_claim', task: 'visit' }),
      call(PLAYER, { action: 'task_claim', task: 'visit' })
    ]);
    const okCnt = [a, b].filter((x) => x.ok).length;
    ok('гонка: начислено один раз', okCnt === 1, [a, b]);
    ok('и баланс это подтверждает', bal(101) === 5, bal(101));
  }
  {
    // Прогресс из базы: 3 ставки за сегодня закрывают дневное задание.
    reset(0);
    DB.bets = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const r = await call(PLAYER, { action: 'tasks' });
    const t3 = r.groups[0].tasks.filter((x) => x.key === 'play3')[0];
    ok('прогресс подтянут из ставок', t3.progress === 3 && t3.ready === true, t3);
    const got = await call(PLAYER, { action: 'task_claim', task: 'play3' });
    ok('награда за игру выдана', got.ok && bal(101) === got.reward, { got, bal: bal(101) });
    const list = await call(PLAYER, { action: 'tasks' });
    ok('в сводке отмечено выполненным', list.done === 1, list.done);
    ok('и посчитан заработок', list.earned === got.reward, list.earned);
  }

  // ── согласованность со схемой ─────────────────────────────────────────────
  console.log('\n— схема и код согласованы —');
  {
    const sql = fs.readFileSync(app('schema.sql'), 'utf8');
    ok('леджер двигает только stars', /p_currency <> 'stars'/.test(sql));
    ok('дробные звёзды запрещены в базе', /stars must be whole/.test(sql));
    ok('есть таблица заявок', /create table if not exists shark_claims/.test(sql));
    ok('одна открытая заявка на игрока', /shark_claims_one_open_idx/.test(sql));
    ok('есть таблица заказов наборов', /create table if not exists shark_topups/.test(sql));
    ok('есть таблица забранных наград', /create table if not exists shark_task_claims/.test(sql));
    ok('idem наград уникален', /idem[\s]+text[\s]+not null unique/.test(sql));
    ok('таблицы выводов больше нет', !/create table if not exists shark_withdrawals/.test(sql));

    const src = fs.readFileSync(app('api/shark.js'), 'utf8');
    ok('в API не осталось withdraw_create', !/withdraw_create/.test(src));
    ok('и нанотонной арифметики', !/toNano|nanoToDb/.test(src));
  }

  console.log(fails ? '\n✗ провалов: ' + fails : '\n✓ все проверки пройдены');
  process.exit(fails ? 1 : 0);
})();
