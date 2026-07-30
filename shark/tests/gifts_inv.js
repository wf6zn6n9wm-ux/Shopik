// Э5: инвентарь Telegram Gifts — выдача статусов игроку и ручная отметка админом.
const { app } = require('./paths');
const crypto = require('crypto');
const fs = require('fs');
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

const T0 = Date.parse('2026-01-01T00:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();

let DB, TG;
function reset() {
  TG = [];
  DB = {
    users: [
      { tg_id: 101, first_name: 'Коля', username: 'kolya', lang: 'ru', ton_balance: '0', won_ton: '0',
        stars_balance: 0, money_balance: 0, played: 0, won_stars: 0, banned: false, ref_by: null,
        ref_code: 'r2', created_at: at(0), last_seen: at(0) },
      { tg_id: 102, first_name: '<img src=x onerror=alert(1)>', username: 'evil', lang: 'ru', ton_balance: '0',
        won_ton: '0', stars_balance: 0, money_balance: 0, played: 0, won_stars: 0, banned: false,
        ref_by: null, ref_code: 'r3', created_at: at(0), last_seen: at(0) },
      { tg_id: 777, first_name: 'Админ', username: 'boss', lang: 'ru', ton_balance: '0', won_ton: '0',
        stars_balance: 0, money_balance: 0, played: 0, won_stars: 0, banned: false, ref_by: null,
        ref_code: 'r1', created_at: at(0), last_seen: at(0) }
    ],
    gifts: [
      { id: 1, tg_id: 101, order_id: 1, case_key: 'reef',  name: 'Ракушка', emoji: '🐚', star_value: 25,
        rarity: 'common',    status: 'sent',    created_at: at(10), sent_at: at(40), sent_by: 777 },
      { id: 2, tg_id: 101, order_id: 2, case_key: 'deep',  name: 'Коралл',  emoji: '🪸', star_value: 120,
        rarity: 'rare',      status: 'held',    created_at: at(20), sent_at: null, sent_by: null },
      { id: 3, tg_id: 101, order_id: 3, case_key: 'abyss', name: 'Трезубец', emoji: '🔱', star_value: 10000,
        rarity: 'legendary', status: 'sending', created_at: at(5),  sent_at: null, sent_by: null },
      { id: 4, tg_id: 102, order_id: 4, case_key: 'reef',  name: 'Пузырь',  emoji: '🫧', star_value: 10,
        rarity: 'common',    status: 'held',    created_at: at(1),  sent_at: null, sent_by: null }
    ],
    nextGift: 5, orders: [], nextOrder: 1
  };
}
const tgCalls = (m) => TG.filter((t) => t.method === m);

// --- фейковый PostgREST -----------------------------------------------------
// Фильтры разбираем честно (eq / in / status=in.(...)), иначе тест проверял бы
// не то, что делает сервер, а то, что удобно подделке.
function matchStatus(qs, row) {
  const f = qs.get('status');
  if (!f) return true;
  if (f.startsWith('eq.')) return row.status === f.slice(3);
  if (f.startsWith('in.')) return f.slice(3).replace(/^\(|\)$/g, '').split(',').includes(row.status);
  return true;
}
function sortRows(rows, qs) {
  const o = qs.get('order');
  if (!o) return rows;
  const [col, dir] = o.split('.');
  return rows.slice().sort((a, b) => {
    const x = String(a[col] || ''), y = String(b[col] || '');
    return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
  });
}

globalThis.fetch = async (url, opts) => {
  opts = opts || {};
  const J = (o, st, hdr) => new Response(JSON.stringify(o), { status: st || 200, headers: new Headers(hdr || {}) });

  if (url.startsWith('https://api.telegram.org/')) {
    TG.push({ method: url.split('/').pop(), body: JSON.parse(opts.body || '{}') });
    return J({ ok: true, result: { message_id: 1 } });
  }

  const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), qs = u.searchParams;
  const counting = (opts.headers && (opts.headers.Prefer || '').includes('count=exact'));

  if (path === 'shark_config') return J([{ data: {} }]);
  if (path === 'shark_referrals' || path === 'shark_ledger' || path === 'shark_withdrawals') return J([]);
  if (path === 'rpc/shark_apply_ledger') return new Response('0', { status: 200 });

  if (path === 'shark_users') {
    if (opts.method === 'PATCH' || opts.method === 'POST') return J([]);
    let rows = DB.users.slice();
    const id = qs.get('tg_id');
    if (id && id.startsWith('eq.')) rows = rows.filter((x) => String(x.tg_id) === id.slice(3));
    if (id && id.startsWith('in.')) {
      const set = id.slice(3).replace(/^\(|\)$/g, '').split(',');
      rows = rows.filter((x) => set.includes(String(x.tg_id)));
    }
    return J(rows.map((r) => Object.assign({}, r)));
  }

  if (path === 'shark_gifts') {
    if (opts.method === 'POST') {
      const g = Object.assign({ id: DB.nextGift++, status: 'held', created_at: at(99), sent_at: null },
                              JSON.parse(opts.body));
      DB.gifts.push(g); return J([g]);
    }
    if (opts.method === 'PATCH') {
      const id = Number((qs.get('id') || '').replace('eq.', ''));
      const rows = DB.gifts.filter((g) => g.id === id && matchStatus(qs, g));
      const b = JSON.parse(opts.body || '{}');
      rows.forEach((g) => Object.assign(g, b));
      return J(rows.map((g) => Object.assign({}, g)));
    }
    let rows = DB.gifts.filter((g) => matchStatus(qs, g));
    const id = (qs.get('id') || '').replace('eq.', '');
    const tg = (qs.get('tg_id') || '').replace('eq.', '');
    if (id) rows = rows.filter((g) => String(g.id) === id);
    if (tg) rows = rows.filter((g) => String(g.tg_id) === tg);
    const total = rows.length;
    if (counting) return J([], 206, { 'content-range': '0-0/' + total });
    rows = sortRows(rows, qs);
    const off = Number(qs.get('offset') || 0), lim = Number(qs.get('limit') || 1000);
    return J(rows.slice(off, off + lim).map((g) => Object.assign({}, g)));
  }

  return J([]);
};

const api = require(app('api/shark.js'));
const bot = require(app('api/bot.js'));

async function call(who, body) {
  let out = null;
  await api({ method: 'POST', body: Object.assign({ initData: initData(who) }, body) },
            { status: () => ({ json: (o) => { out = o; } }) });
  return out;
}
const PLAYER = { id: 101, first_name: 'Коля', username: 'kolya' };
const ADMIN = { id: 777, first_name: 'Админ', username: 'boss' };

async function cb(data, fromId) {
  await bot({ method: 'POST', body: { update_id: 1, callback_query: {
    id: 'cq1', data, from: { id: fromId }, message: { message_id: 55, chat: { id: fromId }, text: 'карточка' }
  } } }, { status: () => ({ json: () => {} }) });
}

let fails = 0;
const ok = (n, c, x) => { if (c) console.log('  ok  ' + n); else { fails++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

(async () => {
  // ── инвентарь игрока ──────────────────────────────────────────────────────
  console.log('\n— инвентарь игрока —');
  reset();
  {
    const r = await call(PLAYER, { action: 'gifts' });
    ok('отдаёт только свои подарки', r.ok && r.gifts.length === 3, r.gifts && r.gifts.map((g) => g.id));
    ok('чужой подарок не виден', !r.gifts.some((g) => g.id === 4));
    ok('порядок — новые сверху', r.gifts[0].id === 2 && r.gifts[2].id === 3, r.gifts.map((g) => g.id));

    ok('счётчики по статусам', r.counts.total === 3 && r.counts.held === 1
      && r.counts.sending === 1 && r.counts.sent === 1, r.counts);
    ok('waiting = невыданные', r.waiting === 2, r.waiting);
    ok('totalValue — весь инвентарь', r.totalValue === 25 + 120 + 10000, r.totalValue);
    ok('pendingValue — только невыданное', r.pendingValue === 120 + 10000, r.pendingValue);

    const g = r.gifts.filter((x) => x.id === 1)[0];
    ok('название кейса разворачивается', g.caseName === 'Риф', g.caseName);
    ok('время выдачи отдаётся', g.sentAt === at(40), g.sentAt);
    ok('редкость отдаётся', g.rarity === 'common', g.rarity);

    ok('флаги будущих функций выключены',
      r.features && r.features.send === false && r.features.exchange === false && r.features.collect === false,
      r.features);
  }
  {
    const r = await call(ADMIN, { action: 'gifts' });
    ok('пустой инвентарь — не ошибка', r.ok && r.gifts.length === 0 && r.counts.total === 0
      && r.totalValue === 0 && r.pendingValue === 0, r);
  }

  // ── очередь выдачи в админке ──────────────────────────────────────────────
  console.log('\n— очередь выдачи (админка) —');
  reset();
  {
    const denied = await call(PLAYER, { action: 'admin_gifts' });
    ok('игроку очередь закрыта', denied.ok === false && denied.reason === 'forbidden', denied);
    const denied2 = await call(PLAYER, { action: 'admin_gift_status', id: 2, status: 'sent' });
    ok('игрок не может отметить выдачу', denied2.ok === false && denied2.reason === 'forbidden', denied2);
    ok('и статус не изменился', DB.gifts.filter((g) => g.id === 2)[0].status === 'held');
  }
  {
    const r = await call(ADMIN, { action: 'admin_gifts' });
    ok('по умолчанию — только невыданные', r.ok && r.gifts.every((g) => g.status !== 'sent'), r.gifts.map((g) => g.status));
    ok('видны подарки всех игроков', r.gifts.length === 3, r.gifts.map((g) => g.id));
    ok('первым — тот, что ждёт дольше всех', r.gifts[0].id === 4, r.gifts.map((g) => g.id));
    ok('счётчик ожидающих', r.pending === 3, r.pending);
    ok('имя игрока приложено', r.gifts.filter((g) => g.id === 2)[0].player === 'Коля');
    ok('ник игрока приложен', r.gifts.filter((g) => g.id === 2)[0].username === 'kolya');
    // Имя приходит из Telegram как есть; экранирование — забота клиента (admEsc),
    // но сервер не должен его молча резать: иначе админ не найдёт игрока по имени.
    ok('имя не искажается сервером',
      r.gifts.filter((g) => g.id === 4)[0].player === '<img src=x onerror=alert(1)>');
  }
  {
    const r = await call(ADMIN, { action: 'admin_gifts', scope: 'sent' });
    ok('архив — только выданные', r.ok && r.gifts.length === 1 && r.gifts[0].id === 1, r.gifts.map((g) => g.id));
    const all = await call(ADMIN, { action: 'admin_gifts', scope: 'all' });
    ok('scope=all — весь список', all.gifts.length === 4, all.gifts.length);
    const bad = await call(ADMIN, { action: 'admin_gifts', scope: 'хакер' });
    ok('незнакомый scope → рабочий список', bad.scope === 'pending' && bad.gifts.every((g) => g.status !== 'sent'));
  }
  {
    reset();
    const p1 = await call(ADMIN, { action: 'admin_gifts', limit: 2, offset: 0 });
    const p2 = await call(ADMIN, { action: 'admin_gifts', limit: 2, offset: 2 });
    const ids = p1.gifts.concat(p2.gifts).map((g) => g.id);
    ok('постраничность без дублей', new Set(ids).size === ids.length && ids.length === 3, ids);
    ok('total не зависит от страницы', p1.total === 3 && p2.total === 3, [p1.total, p2.total]);
  }

  // ── переходы статуса ──────────────────────────────────────────────────────
  console.log('\n— переходы статуса —');
  reset();
  {
    const r = await call(ADMIN, { action: 'admin_gift_status', id: 2, status: 'sending' });
    ok('held → sending', r.ok && r.changed && r.gift.status === 'sending', r);
    ok('время выдачи ещё не проставлено', DB.gifts.filter((g) => g.id === 2)[0].sent_at == null);
    ok('игрока не дёргаем раньше времени', tgCalls('sendMessage').length === 0);

    const r2 = await call(ADMIN, { action: 'admin_gift_status', id: 2, status: 'sent' });
    ok('sending → sent', r2.ok && r2.changed && r2.gift.status === 'sent', r2);
    ok('проставлено время выдачи', !!DB.gifts.filter((g) => g.id === 2)[0].sent_at);
    ok('записан автор отметки', DB.gifts.filter((g) => g.id === 2)[0].sent_by === 777);
    const msg = tgCalls('sendMessage');
    ok('игроку ушло одно уведомление', msg.length === 1, msg.length);
    ok('уведомление — тому игроку', msg[0] && msg[0].body.chat_id === 101, msg[0] && msg[0].body.chat_id);
    ok('в тексте название подарка', msg[0] && msg[0].body.text.includes('Коралл'));
  }
  {
    // Повтор той же отметки — обычное дело: админ нажал в панели и в боте.
    const before = DB.gifts.filter((g) => g.id === 2)[0].sent_at;
    const n0 = tgCalls('sendMessage').length;
    const r = await call(ADMIN, { action: 'admin_gift_status', id: 2, status: 'sent' });
    ok('повтор «отправлен» безопасен', r.ok && r.changed === false, r);
    ok('время выдачи не переписано', DB.gifts.filter((g) => g.id === 2)[0].sent_at === before);
    ok('второго уведомления нет', tgCalls('sendMessage').length === n0);
  }
  {
    const r = await call(ADMIN, { action: 'admin_gift_status', id: 2, status: 'sending' });
    ok('назад из sent нельзя', r.ok === false && r.reason === 'bad_transition', r);
    ok('статус остался sent', DB.gifts.filter((g) => g.id === 2)[0].status === 'sent');
  }
  {
    const r = await call(ADMIN, { action: 'admin_gift_status', id: 3, status: 'sent' });
    ok('held/sending → sent напрямую', r.ok && r.changed && r.gift.status === 'sent', r);
    const bad = await call(ADMIN, { action: 'admin_gift_status', id: 3, status: 'выдан' });
    ok('чужой статус отклоняется', bad.ok === false && bad.reason === 'bad_status', bad);
    const none = await call(ADMIN, { action: 'admin_gift_status', id: 999, status: 'sent' });
    ok('несуществующий подарок', none.ok === false && none.reason === 'no_gift', none);
    const noid = await call(ADMIN, { action: 'admin_gift_status', status: 'sent' });
    ok('без id — отказ', noid.ok === false && noid.reason === 'bad_id', noid);
  }

  // ── гонка: панель и бот одновременно ──────────────────────────────────────
  console.log('\n— гонка отметок —');
  reset();
  {
    // Условный PATCH по текущему статусу: выиграть должен ровно один вызов,
    // иначе игрок получит два уведомления об одной отправке.
    const [a, b] = await Promise.all([
      call(ADMIN, { action: 'admin_gift_status', id: 2, status: 'sent' }),
      call(ADMIN, { action: 'admin_gift_status', id: 2, status: 'sent' })
    ]);
    const changed = [a, b].filter((r) => r.ok && r.changed).length;
    ok('ровно одна отметка сработала', changed === 1, [a, b]);
    ok('оба ответа успешны', a.ok && b.ok, [a.ok, b.ok]);
    ok('оба видят итоговый статус', a.gift.status === 'sent' && b.gift.status === 'sent');
    ok('уведомление одно', tgCalls('sendMessage').length === 1, tgCalls('sendMessage').length);
  }

  // ── отметка кнопкой в боте ────────────────────────────────────────────────
  console.log('\n— отметка из бота —');
  reset();
  {
    await cb('gf_ok:2', 999);
    ok('не-админ ничего не меняет', DB.gifts.filter((g) => g.id === 2)[0].status === 'held');
    const ans = tgCalls('answerCallbackQuery');
    ok('и получает отказ', ans.length === 1 && /Нет прав/.test(ans[0].body.text || ''), ans[0] && ans[0].body);
  }
  reset();
  {
    await cb('gf_go:2', 777);
    ok('кнопка «в работе» переводит в sending', DB.gifts.filter((g) => g.id === 2)[0].status === 'sending');
    ok('игроку пока не пишем', tgCalls('sendMessage').length === 0);
    const ed = tgCalls('editMessageText');
    ok('карточка помечена', ed.length === 1 && /В РАБОТЕ/.test(ed[0].body.text), ed[0] && ed[0].body.text);
    ok('кнопки остались', ed[0] && !!ed[0].body.reply_markup);

    await cb('gf_ok:2', 777);
    const g = DB.gifts.filter((x) => x.id === 2)[0];
    ok('кнопка «отправлен» закрывает выдачу', g.status === 'sent' && !!g.sent_at, g);
    ok('записан автор отметки', g.sent_by === 777, g.sent_by);
    ok('игрок уведомлён', tgCalls('sendMessage').length === 1
      && tgCalls('sendMessage')[0].body.chat_id === 101);
    const ed2 = tgCalls('editMessageText');
    ok('кнопки сняты после выдачи', ed2.length === 2 && ed2[1].body.reply_markup === undefined, ed2[1] && ed2[1].body);

    await cb('gf_ok:2', 777);
    ok('повторное нажатие ничего не делает', tgCalls('sendMessage').length === 1);
  }
  reset();
  {
    // Отметили из панели, потом жмут кнопку в боте — обычный сценарий.
    await call(ADMIN, { action: 'admin_gift_status', id: 2, status: 'sent' });
    const n0 = tgCalls('sendMessage').length;
    await cb('gf_go:2', 777);
    ok('бот не откатывает выданный подарок', DB.gifts.filter((g) => g.id === 2)[0].status === 'sent');
    ok('и не шлёт второго уведомления', tgCalls('sendMessage').length === n0, tgCalls('sendMessage').length);
  }

  // ── видимость выдачи для игрока ───────────────────────────────────────────
  console.log('\n— выдача видна игроку —');
  reset();
  {
    const before = await call(PLAYER, { action: 'gifts' });
    const g0 = before.gifts.filter((g) => g.id === 2)[0];
    ok('до выдачи — «в инвентаре»', g0.status === 'held' && g0.sentAt == null, g0);

    await cb('gf_ok:2', 777);                    // админ отметил кнопкой в боте
    const after = await call(PLAYER, { action: 'gifts' });
    const g1 = after.gifts.filter((g) => g.id === 2)[0];
    ok('сразу после отметки — «отправлен»', g1.status === 'sent', g1);
    ok('появилось время выдачи', !!g1.sentAt);
    ok('счётчик невыданных уменьшился', after.waiting === before.waiting - 1, [before.waiting, after.waiting]);
    ok('долг перед игроком уменьшился', after.pendingValue === before.pendingValue - 120,
      [before.pendingValue, after.pendingValue]);
    ok('общая ценность не изменилась', after.totalValue === before.totalValue);
  }

  // ── таблица переходов не разъехалась между сервером и ботом ───────────────
  console.log('\n— согласованность модели —');
  {
    const grab = (f) => {
      const s = fs.readFileSync(f, 'utf8');
      return eval('(' + s.match(/const GIFT_FLOW = \{[\s\S]*?\};/)[0]
        .replace('const GIFT_FLOW =', '').replace(/;$/, '') + ')');
    };
    const a = grab(app('api/shark.js'));
    const b = grab(app('api/bot.js'));
    ok('GIFT_FLOW совпадает в shark.js и bot.js', JSON.stringify(a) === JSON.stringify(b), [a, b]);
    ok('из sent выхода нет', a.sent.length === 0, a.sent);
    ok('held ведёт и в sending, и в sent', a.held.includes('sending') && a.held.includes('sent'), a.held);

    // Схема должна объявлять таблицу ровно один раз: иначе `create table if
    // not exists` тихо оставит старую форму и вставка подарка упадёт.
    const sql = fs.readFileSync(app('schema.sql'), 'utf8');
    const decls = (sql.match(/create table if not exists shark_gifts/g) || []).length;
    ok('shark_gifts объявлена один раз', decls === 1, decls);
    ok('старая база доращивается', /alter table shark_gifts add column if not exists star_value/.test(sql));
    ok('старые статусы переносятся', /update shark_gifts set status = 'held' where status = 'pending'/.test(sql));

    // Статусы в клиенте должны совпадать с серверными — иначе игрок увидит
    // ключ вместо слова.
    const html = fs.readFileSync(app('index.html'), 'utf8');
    const langs = ['uk', 'ru', 'en'];
    let allKeys = true;
    for (const st of ['held', 'sending', 'sent']) {
      const n = (html.match(new RegExp('gft_st_' + st + ':', 'g')) || []).length;
      if (n !== langs.length) { allKeys = false; console.log('    gft_st_' + st + ' → ' + n + ' переводов'); }
    }
    ok('у каждого статуса есть перевод на 3 языка', allKeys);
  }

  console.log(fails ? '\nFAIL: ' + fails : '\nвсе проверки прошли');
  process.exit(fails ? 1 : 0);
})();
