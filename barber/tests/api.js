/* Проверка бэкенда «Про Барбера» без сети и без Supabase: функцию из
   api/ зовём напрямую, а вместо базы — маленький PostgREST в памяти.
   Так проверяется именно логика: кто чем владеет, что видно наружу и
   почему двое не запишутся на одно время.

   node barber/tests/api.js */

process.env.BARBER_SUPABASE_URL = 'https://db.test';
process.env.BARBER_SUPABASE_SERVICE_ROLE_KEY = 'service_test';
process.env.BARBER_APP_URL = 'https://probarber.test/barber/';

const path = require('path');

/* ── поддельная база ───────────────────────────────────────────────── */

const DB = {barber_shops: [], barber_busy: [], barber_requests: []};
const TG = [];               /* что «улетело» в Telegram */

const parseQuery = qs => {
  const filters = [];
  new URLSearchParams(qs).forEach((raw, key) => {
    if (['select', 'order', 'limit', 'offset'].includes(key)) return;
    if (raw === 'not.is.null'){ filters.push({key, op: 'notnull'}); return; }
    const m = /^(eq|gte|lte|gt|lt|in)\.([\s\S]*)$/.exec(raw);
    if (!m) return;
    filters.push({key, op: m[1], val: m[2]});
  });
  return filters;
};
const match = (row, f) => {
  const v = row[f.key];
  if (f.op === 'notnull') return v != null;
  if (f.op === 'eq') return String(v) === f.val;
  if (f.op === 'gte') return String(v) >= f.val;
  if (f.op === 'lte') return String(v) <= f.val;
  if (f.op === 'gt') return String(v) > f.val;
  if (f.op === 'lt') return String(v) < f.val;
  if (f.op === 'in'){
    const list = f.val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''));
    return list.includes(String(v));
  }
  return true;
};
const rowsOf = (table, qs) => {
  const f = parseQuery(qs);
  return (DB[table] || []).filter(r => f.every(x => match(r, x)));
};

global.fetch = async (url, opts) => {
  opts = opts || {};
  const method = (opts.method || 'GET').toUpperCase();

  if (String(url).includes('api.telegram.org')){
    TG.push(JSON.parse(opts.body || '{}'));
    return {ok: true, status: 200, text: async () => '{"ok":true}'};
  }

  const m = /\/rest\/v1\/([a-z_]+)\??([\s\S]*)$/.exec(String(url));
  if (!m) throw new Error('неизвестный запрос: ' + url);
  const [, table, qs] = m;
  DB[table] = DB[table] || [];

  if (method === 'GET') return res(rowsOf(table, qs));
  if (method === 'POST'){
    const rows = JSON.parse(opts.body || '[]');
    rows.forEach(r => DB[table].push(Object.assign({created_at: new Date().toISOString()}, r)));
    return res(rows);
  }
  if (method === 'PATCH'){
    const patch = JSON.parse(opts.body || '{}');
    const hit = rowsOf(table, qs);
    hit.forEach(r => Object.assign(r, patch));
    return res(hit);
  }
  if (method === 'DELETE'){
    const hit = rowsOf(table, qs);
    DB[table] = DB[table].filter(r => !hit.includes(r));
    return res([]);
  }
  throw new Error('метод не поддержан: ' + method);

  function res(data){
    return {ok: true, status: 200, text: async () => JSON.stringify(data)};
  }
};

const api = require(path.join(__dirname, '..', 'api', 'barber.js'));
const bot = require(path.join(__dirname, '..', 'api', 'bot.js'));
const cron = require(path.join(__dirname, '..', 'api', 'cron.js'));

/* вызов произвольной функции из api/ той же заглушкой req/res */
function callFn(fn, req){
  return new Promise(resolve => {
    const res = {
      code: 200, headers: {},
      setHeader(k, v){ res.headers[k.toLowerCase()] = v; },
      status(c){ res.code = c; return res; },
      json(obj){ resolve({code: res.code, body: obj}); },
      end(){ resolve({code: res.code, body: null}); },
    };
    Promise.resolve(fn(Object.assign({method: 'POST', body: {}, headers: {}, query: {}}, req), res))
      .catch(e => resolve({code: 500, body: {ok: false, reason: 'throw', message: String(e)}}));
  });
}

/* ── вызов функции ─────────────────────────────────────────────────── */

function call(body, method, extra){
  return new Promise(resolve => {
    const res = {
      code: 200, headers: {},
      setHeader(k, v){ res.headers[k.toLowerCase()] = v; },
      status(c){ res.code = c; return res; },
      json(obj){ resolve({code: res.code, body: obj}); },
      end(){ resolve({code: res.code, body: null}); },
    };
    Promise.resolve(api(Object.assign({method: method || 'POST', body, headers: {}, query: {}}, extra || {}), res))
      .catch(e => resolve({code: 500, body: {ok: false, reason: 'throw', message: String(e)}}));
  });
}

/* ── отчёт ─────────────────────────────────────────────────────────── */

let checks = 0, fails = 0;
const ok = (name, cond, extra) => {
  checks++;
  if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};
const part = t => console.log('\n── ' + t + ' ──');

const pad = n => (n < 10 ? '0' : '') + n;
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };
const TODAY = isoOf(new Date());
const H = {on: true, from: '09:00', to: '20:00'};
const HOURS = {mon: H, tue: H, wed: H, thu: H, fri: H, sat: H, sun: {on: false, from: '10:00', to: '16:00'}};
const SERVICES = [
  {id: 'sv_0', name: 'Стрижка', price: 20, dur: 45},
  {id: 'sv_1', name: 'Стрижка + борода', price: 30, dur: 60},
];
/* ближайший рабочий день недели: воскресенье в тесте выходное */
const workday = n => {
  let d = new Date();
  d.setDate(d.getDate() + n);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return isoOf(d);
};
const sunday = () => { const d = new Date(); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); return isoOf(d); };

const SHOP = {
  shop: 'Про Барбер', name: 'Алексей Смирнов', role: 'Барбер',
  about: 'Мужские стрижки', address: 'Киев', phone: '+380 67 100 20 30',
  currency: 'USD', lang: 'ru', step: 30, hours: HOURS, services: SERVICES,
};

(async () => {

part('без ключей');
{
  const url = process.env.BARBER_SUPABASE_URL;
  delete process.env.BARBER_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  const r = await call({action: 'shop', slug: 'alexey'});
  ok('без настроек отвечаем not_configured, а не падаем',
     r.body.ok === false && r.body.reason === 'not_configured', r.body.reason);
  process.env.BARBER_SUPABASE_URL = url;
}
{
  const r = await call({action: 'shop', slug: 'alexey'}, 'GET');
  ok('GET не принимаем', r.code === 405);
  const r2 = await call({action: 'shop', slug: ''});
  ok('без slug не работаем', r2.body.reason === 'no_slug');
}

part('публикация витрины');
{
  const r = await call({action: 'publish', slug: 'alexey', token: 'tok_A', shop: SHOP, busy: [
    {date: workday(1), time: '11:00', dur: 60},
    {date: workday(1), time: '11:00', dur: 60},          /* дубль слота */
    {date: plus(-3), time: '10:00', dur: 30},            /* прошлое не публикуем */
  ]});
  ok('первая публикация занимает slug', r.body.ok === true, JSON.stringify(r.body).slice(0, 80));
  ok('прошлое и дубли отсеяны', r.body.busy === 1, String(r.body.busy));
  ok('витрина легла в базу', DB.barber_shops.length === 1 && DB.barber_shops[0].name === 'Алексей Смирнов');

  const bad = await call({action: 'publish', slug: 'alexey', token: 'tok_ЧУЖОЙ', shop: SHOP, busy: []});
  ok('чужой токен не пускает', bad.body.reason === 'forbidden');
  const noTok = await call({action: 'pull', slug: 'alexey'});
  ok('без токена кабинет не читает заявки', noTok.body.reason === 'no_token');

  const again = await call({action: 'publish', slug: 'alexey', token: 'tok_A',
                            shop: Object.assign({}, SHOP, {about: 'Обновил о себе'}), busy: []});
  ok('повторная публикация обновляет, а не плодит', again.body.ok === true && DB.barber_shops.length === 1);
  ok('занятость публикуется целиком', DB.barber_busy.length === 0);
}

part('витрина наружу');
{
  await call({action: 'publish', slug: 'alexey', token: 'tok_A', shop: SHOP, busy: [
    {date: workday(1), time: '11:00', dur: 60},
  ]});
  const r = await call({action: 'shop', slug: 'alexey'});
  ok('страница получает витрину', r.body.ok === true && r.body.shop.services.length === 2);
  ok('и занятое время', r.body.busy.length === 1 && r.body.busy[0].time === '11:00');
  const raw = JSON.stringify(r.body);
  ok('токен наружу не уходит', !raw.includes('tok_A'));
  ok('чат барбера наружу не уходит', !('tg_chat_id' in r.body.shop));
  ok('в занятом времени нет имён и услуг',
     Object.keys(r.body.busy[0]).sort().join(',') === 'date,dur,time');
  const none = await call({action: 'shop', slug: 'нет-такого'});
  ok('чужой slug — пусто', none.body.reason === 'no_shop');
}

part('заявка от клиента');
{
  const day = workday(2);
  const base = {action: 'book', slug: 'alexey', name: 'Иван Петров', phone: '+380 67 111 22 33',
                serviceId: 'sv_0', date: day, time: '13:00', today: TODAY};

  ok('без имени не принимаем', (await call(Object.assign({}, base, {name: 'И'}))).body.reason === 'bad_name');
  ok('без телефона не принимаем', (await call(Object.assign({}, base, {phone: '123'}))).body.reason === 'bad_phone');
  ok('кривая дата не проходит', (await call(Object.assign({}, base, {date: '14.08.2026'}))).body.reason === 'bad_time');
  ok('чужая услуга не проходит', (await call(Object.assign({}, base, {serviceId: 'sv_ЧУЖАЯ'}))).body.reason === 'bad_service');
  ok('в прошлое не записываем', (await call(Object.assign({}, base, {date: plus(-2)}))).body.reason === 'past');
  ok('на год вперёд не записываем', (await call(Object.assign({}, base, {date: plus(200)}))).body.reason === 'far');
  ok('в выходной не записываем', (await call(Object.assign({}, base, {date: sunday()}))).body.reason === 'closed');
  ok('до открытия не записываем', (await call(Object.assign({}, base, {time: '07:00'}))).body.reason === 'closed');
  ok('впритык к закрытию не записываем', (await call(Object.assign({}, base, {time: '19:30'}))).body.reason === 'closed');

  const good = await call(base);
  ok('нормальная заявка проходит', good.body.ok === true && !!good.body.id, good.body.reason || good.body.id);
  ok('заявка легла в базу со статусом new',
     DB.barber_requests.length === 1 && DB.barber_requests[0].status === 'new');
  ok('телефон сохранён и в цифрах, и как ввели',
     DB.barber_requests[0].phone_key === '380671112233' && DB.barber_requests[0].phone.includes('+380'));
  ok('цена и длительность взяты с сервера, а не от клиента',
     DB.barber_requests[0].price === 20 && DB.barber_requests[0].dur === 45);

  const clash = await call(Object.assign({}, base, {phone: '+380 67 999 88 77', time: '13:30'}));
  ok('вторая заявка внахлёст на первую отклоняется', clash.body.reason === 'taken', clash.body.reason);

  const busyDay = workday(1);
  const onBusy = await call(Object.assign({}, base, {date: busyDay, time: '11:30', phone: '+380 67 555 44 33'}));
  ok('на занятое кабинетом время не записываем', onBusy.body.reason === 'taken');

  const free = await call(Object.assign({}, base, {time: '16:00', phone: '+380 67 555 44 33'}));
  ok('свободное время рядом занимать можно', free.body.ok === true);
}

part('антиспам');
{
  const day = workday(3);
  const one = {action: 'book', slug: 'alexey', name: 'Спамер Спамерович', phone: '+380 99 000 11 22',
               serviceId: 'sv_0', today: TODAY, date: day};
  const times = ['09:00', '10:00', '11:00', '12:00'];
  const out = [];
  for (const t of times) out.push((await call(Object.assign({}, one, {time: t}))).body);
  ok('три заявки с телефона проходят', out.slice(0, 3).every(x => x.ok === true));
  ok('четвёртая — стоп', out[3].ok === false && out[3].reason === 'too_many', out[3].reason);
}

part('кабинет забирает заявки');
{
  const r = await call({action: 'pull', slug: 'alexey', token: 'tok_A'});
  ok('кабинет видит новые заявки', r.body.ok === true && r.body.requests.length >= 2, String(r.body.requests.length));
  ok('в заявке есть всё для записи',
     ['id', 'name', 'phone', 'service_id', 'service', 'price', 'dur', 'date', 'time']
       .every(k => k in r.body.requests[0]));
  ok('дата приходит строкой YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(r.body.requests[0].date));
  ok('забранные помечены', DB.barber_requests.filter(x => x.pulled_at).length === r.body.requests.length);

  const id = r.body.requests[0].id;
  await call({action: 'resolve', slug: 'alexey', token: 'tok_A', id, status: 'accepted'});
  ok('подтверждение меняет статус',
     DB.barber_requests.find(x => x.id === id).status === 'accepted');
  const after = await call({action: 'pull', slug: 'alexey', token: 'tok_A'});
  ok('подтверждённая заявка больше не приходит', !after.body.requests.some(x => x.id === id));

  const id2 = after.body.requests[0].id;
  await call({action: 'resolve', slug: 'alexey', token: 'tok_A', id: id2, status: 'что-то'});
  ok('непонятный статус трактуем как отказ',
     DB.barber_requests.find(x => x.id === id2).status === 'declined');
  const alien = await call({action: 'resolve', slug: 'alexey', token: 'tok_Б', id: id2, status: 'accepted'});
  ok('чужим токеном заявку не тронуть', alien.body.reason === 'forbidden');
}

part('Telegram');
{
  ok('без токена бота уведомление не ломает заявку', TG.length === 0);
  process.env.BARBER_BOT_TOKEN = 'bot_test';
  DB.barber_shops[0].tg_chat_id = 555;
  const r = await call({action: 'book', slug: 'alexey', name: 'Тихий Клиент', phone: '+380 63 222 33 44',
                        serviceId: 'sv_1', date: workday(5), time: '15:00', today: TODAY});
  ok('заявка прошла', r.body.ok === true, r.body.reason);
  ok('барберу ушло сообщение', TG.length === 1 && TG[0].chat_id === 555);
  ok('в сообщении есть имя, телефон и время',
     /Тихий Клиент/.test(TG[0].text) && /380/.test(TG[0].text) && /15:00/.test(TG[0].text));
  ok('к сообщению приложены кнопки решения',
     !!TG[0].reply_markup && TG[0].reply_markup.inline_keyboard[0].length === 2);
  delete process.env.BARBER_BOT_TOKEN;
}

part('чужой барбер');
{
  await call({action: 'publish', slug: 'oleg', token: 'tok_O', shop: SHOP, busy: []});
  const mine = await call({action: 'pull', slug: 'oleg', token: 'tok_O'});
  ok('заявки не перетекают к соседу', mine.body.requests.length === 0);
  const cross = await call({action: 'pull', slug: 'alexey', token: 'tok_O'});
  ok('токеном соседа чужие заявки не прочитать', cross.body.reason === 'forbidden');
}

part('телеграм-бот');
{
  process.env.BARBER_BOT_TOKEN = 'bot_test';
  process.env.BARBER_BOT_USERNAME = 'probarber_bot';
  TG.length = 0;

  const noSecret = await callFn(bot, {body: {message: {chat: {id: 1}, text: '/start'}}});
  ok('бот отвечает на /start без кода подсказкой', noSecret.body.ok === true && /Настройки/.test(TG[0].text));

  /* код привязки заказывает кабинет */
  const link = await call({action: 'link', slug: 'alexey', token: 'tok_A'});
  ok('кабинет получает код и ссылку', link.body.ok === true && /t\.me\/probarber_bot/.test(link.body.url), link.body.url);
  const badCode = await callFn(bot, {body: {message: {chat: {id: 77}, text: '/start lk_чужой'}}});
  ok('чужой код не привязывает', badCode.body.ok === true && !DB.barber_shops.some(s2 => s2.tg_chat_id === 77));

  TG.length = 0;
  await callFn(bot, {body: {message: {chat: {id: 42}, text: '/start ' + link.body.code}}});
  const shopRow = DB.barber_shops.find(s2 => s2.slug === 'alexey');
  ok('правильный код привязывает чат', shopRow.tg_chat_id === 42);
  ok('код одноразовый', !shopRow.tg_link_code);
  ok('барберу написали, что готово', /Готово/.test(TG[TG.length - 1].text));

  /* кнопка под уведомлением */
  const day = workday(6);
  const rq = await call({action: 'book', slug: 'alexey', name: 'Кнопочный Клиент',
                         phone: '+380 50 777 66 55', serviceId: 'sv_0', date: day, time: '09:00', today: TODAY});
  ok('заявка создана', rq.body.ok === true, rq.body.reason);
  await callFn(bot, {body: {callback_query: {id: 'cb1', data: 'ok:' + rq.body.id,
                    message: {message_id: 5, chat: {id: 42}, text: 'заявка'}}}});
  ok('кнопка «Принять» меняет статус',
     DB.barber_requests.find(x => x.id === rq.body.id).status === 'accepted');

  const alienChat = await callFn(bot, {body: {callback_query: {id: 'cb2', data: 'no:' + rq.body.id,
                    message: {message_id: 6, chat: {id: 999}, text: 'заявка'}}}});
  ok('из чужого чата заявку не решить', alienChat.body.ok === true &&
     DB.barber_requests.find(x => x.id === rq.body.id).status === 'accepted');

  TG.length = 0;
  await callFn(bot, {body: {message: {chat: {id: 42}, text: '/zayavki'}}});
  ok('/zayavki показывает открытые заявки', TG.length > 0 && /✂️/.test(TG[0].text));

  await callFn(bot, {body: {message: {chat: {id: 42}, text: '/stop'}}});
  ok('/stop отвязывает чат', !DB.barber_shops.find(s2 => s2.slug === 'alexey').tg_chat_id);

  /* секрет вебхука */
  process.env.BARBER_TG_SECRET = 'sec';
  const noAuth = await callFn(bot, {body: {message: {chat: {id: 42}, text: '/zayavki'}}});
  ok('без секрета вебхук не пускает', noAuth.code === 401);
  const withAuth = await callFn(bot, {headers: {'x-telegram-bot-api-secret-token': 'sec'},
                                      body: {message: {chat: {id: 42}, text: '/zayavki'}}});
  ok('с секретом пускает', withAuth.code === 200);
  delete process.env.BARBER_TG_SECRET;
}

part('вечерний план');
{
  /* привязываем чат обратно и раскладываем завтрашний день */
  const shopRow = DB.barber_shops.find(s2 => s2.slug === 'alexey');
  shopRow.tg_chat_id = 42;
  shopRow.plan_sent_for = null;
  DB.barber_shops.filter(s2 => s2.slug !== 'alexey').forEach(s2 => { s2.tg_chat_id = null; });

  const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const isSunday = new Date(tmr + 'T00:00:00Z').getUTCDay() === 0;
  DB.barber_busy.length = 0;
  DB.barber_busy.push({slug: 'alexey', date: tmr, time: '09:00', dur: 45});
  DB.barber_busy.push({slug: 'alexey', date: tmr, time: '11:00', dur: 60});

  TG.length = 0;
  const r = await callFn(cron, {});
  ok('крон отработал', r.body.ok === true, JSON.stringify(r.body).slice(0, 60));
  if (isSunday){
    ok('в выходной план не шлём без причины', TG.length <= 1);
  } else {
    ok('барберу ушёл план на завтра', TG.length === 1 && /Завтра 2 запис/.test(TG[0].text), TG[0] && TG[0].text);
    ok('в плане видно окно между записями', /09:45–11:00/.test(TG[0].text), TG[0] && TG[0].text);
    ok('и время первой записи', /Первая в 09:00/.test(TG[0].text));
  }

  TG.length = 0;
  await callFn(cron, {});
  ok('второй запуск за тот же день молчит', TG.length === 0);

  /* защита секретом */
  process.env.BARBER_CRON_SECRET = 'cron_sec';
  const noAuth = await callFn(cron, {});
  ok('без секрета крон не запустить', noAuth.code === 401);
  const withKey = await callFn(cron, {query: {key: 'cron_sec'}});
  ok('с ключом запускается', withKey.code === 200);
  delete process.env.BARBER_CRON_SECRET;
  delete process.env.BARBER_BOT_TOKEN;
}

console.log('\n' + (fails ? '✗ ' + fails + ' из ' + checks : '✓ все ' + checks) + ' проверок');
process.exit(fails ? 1 : 0);
})();
