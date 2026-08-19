// Serverless-функция (Vercel) — бэкенд «Про Барбера».
//
// Нужна ровно для одного: клиент записывается со своего телефона, барбер
// видит заявку в кабинете. Клиентская база, история и деньги остаются в
// кабинете и на сервер не уезжают.
//
// Запрос: POST { action, ... }
// Действия:
//   shop    { slug }                        — витрина для публичной страницы
//   book    { slug, name, phone, serviceId, date, time, note, today }
//                                           — заявка от клиента
//   publish { slug, token, shop, busy }     — кабинет обновляет витрину и занятость
//   pull    { slug, token }                 — кабинет забирает новые заявки
//   resolve { slug, token, id, status }     — барбер принял/отклонил
//
// Главный принцип: свободное время считает СЕРВЕР. Клиент присылает только
// намерение — иначе двое запишутся на одно и то же время.
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   BARBER_SUPABASE_URL / SUPABASE_URL
//   BARBER_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY   (секрет!)
//   BARBER_BOT_TOKEN                — токен Telegram-бота, необязателен
//   BARBER_APP_URL                  — адрес кабинета для ссылок в уведомлениях
//
// Если ключи не заданы — возвращаем { ok:false, reason:'not_configured' },
// и приложение мягко откатывается в локальный режим: кабинет продолжает
// работать на своём хранилище, публичная страница показывает витрину по
// умолчанию.

function env(name){ return process.env['BARBER_' + name] || process.env[name] || ''; }

/* ── мелочи ────────────────────────────────────────────────────────── */

/* управляющие символы вырезаем, а дефисы и пробелы бережём: ими живут
   телефоны «+380 67 …» и двойные фамилии */
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max || 200);
const digits = v => String(v == null ? '' : v).replace(/\D/g, '');
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const isTime = v => /^\d{2}:\d{2}$/.test(String(v || ''));
const mins = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dowKey = dateStr => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DOW[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
};
const addDaysIso = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
const uid = p => p + '_' + Math.random().toString(36).slice(2, 10);
const utcToday = () => new Date().toISOString().slice(0, 10);

const LIMIT_PER_PHONE = 3;        // заявок с одного телефона в сутки
const HORIZON_DAYS = 60;          // насколько вперёд открыта запись

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS'){ res.status(204).end(); return; }
  if (req.method !== 'POST'){ res.status(405).json({ok: false, reason: 'method'}); return; }

  const URL_ = env('SUPABASE_URL');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!URL_ || !SERVICE){ res.status(200).json({ok: false, reason: 'not_configured'}); return; }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const action = clean(body.action, 20);
  const slug = clean(body.slug, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!slug){ res.status(200).json({ok: false, reason: 'no_slug'}); return; }

  const H = {apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json'};
  async function sb(path, opts){
    const r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({headers: H}, opts || {}));
    const text = await r.text();
    if (!r.ok) throw new Error(r.status + ' ' + path + ' ' + text.slice(0, 200));
    return text ? JSON.parse(text) : [];
  }
  const get = path => sb(path);
  const insert = (table, rows, prefer) => sb(table, {
    method: 'POST', body: JSON.stringify(rows),
    headers: Object.assign({}, H, {Prefer: prefer || 'return=representation'}),
  });
  const patch = (path, row) => sb(path, {
    method: 'PATCH', body: JSON.stringify(row),
    headers: Object.assign({}, H, {Prefer: 'return=representation'}),
  });

  try {
    const shopRows = await get('barber_shops?slug=eq.' + slug + '&select=*');
    const shop = shopRows[0] || null;

    /* ── витрина для публичной страницы ─────────────────────────────
       Отдаём только то, что клиенту можно видеть: услуги, график и
       занятые интервалы. Ни имён, ни телефонов, ни услуг чужих записей. */
    if (action === 'shop'){
      if (!shop){ res.status(200).json({ok: false, reason: 'no_shop'}); return; }
      const from = utcToday();
      const busy = await get('barber_busy?slug=eq.' + slug + '&date=gte.' + from +
                             '&select=date,time,dur&order=date.asc');
      res.status(200).json({
        ok: true,
        shop: publicShop(shop),
        busy: busy.map(b => ({date: String(b.date).slice(0, 10), time: b.time, dur: b.dur})),
      });
      return;
    }

    /* ── заявка от клиента ──────────────────────────────────────────
       Всё проверяем на сервере: услуга, рабочие часы, пересечения,
       горизонт записи и частота с одного телефона. */
    if (action === 'book'){
      if (!shop){ res.status(200).json({ok: false, reason: 'no_shop'}); return; }
      const name = clean(body.name, 80);
      const phone = clean(body.phone, 40);
      const key = digits(phone);
      const date = clean(body.date, 10);
      const time = clean(body.time, 5);
      const note = clean(body.note, 300);
      const serviceId = clean(body.serviceId, 40);

      if (name.length < 2) return json(res, {ok: false, reason: 'bad_name'});
      if (key.length < 9) return json(res, {ok: false, reason: 'bad_phone'});
      if (!isDate(date) || !isTime(time)) return json(res, {ok: false, reason: 'bad_time'});

      const services = Array.isArray(shop.services) ? shop.services : [];
      const svc = services.find(s => String(s.id) === serviceId);
      if (!svc) return json(res, {ok: false, reason: 'bad_service'});

      /* «сегодня» берём у клиента, но не верим ему дальше суток: часовой
         пояс барбера сервер не знает, а промахнуться на день нельзя */
      const today = isDate(body.today) ? body.today : utcToday();
      const floor = addDaysIso(utcToday(), -1);
      const start = today > floor ? today : floor;
      if (date < start) return json(res, {ok: false, reason: 'past'});
      if (date > addDaysIso(utcToday(), HORIZON_DAYS)) return json(res, {ok: false, reason: 'far'});

      const h = (shop.hours || {})[dowKey(date)];
      const dur = Number(svc.dur) || 30;
      if (!h || !h.on || mins(time) < mins(h.from) || mins(time) + dur > mins(h.to))
        return json(res, {ok: false, reason: 'closed'});

      const dayBusy = await get('barber_busy?slug=eq.' + slug + '&date=eq.' + date + '&select=time,dur');
      const dayOpen = await get('barber_requests?slug=eq.' + slug + '&date=eq.' + date +
                                '&status=eq.new&select=time,dur');
      const taken = dayBusy.concat(dayOpen).some(b =>
        mins(time) < mins(b.time) + (Number(b.dur) || 0) && mins(time) + dur > mins(b.time));
      if (taken) return json(res, {ok: false, reason: 'taken'});

      const since = new Date(Date.now() - 86400000).toISOString();
      const recent = await get('barber_requests?slug=eq.' + slug + '&phone_key=eq.' + key +
                               '&created_at=gte.' + since + '&select=id');
      if (recent.length >= LIMIT_PER_PHONE) return json(res, {ok: false, reason: 'too_many'});

      const row = {
        id: uid('rq'), slug, name, phone, phone_key: key,
        service_id: serviceId, service: clean(svc.name, 80),
        price: Number(svc.price) || 0, dur, date, time, note, status: 'new',
      };
      await insert('barber_requests', [row], 'return=minimal');
      await notify(shop, row);
      res.status(200).json({ok: true, id: row.id});
      return;
    }

    /* ── дальше только кабинет: нужен токен ─────────────────────────
       Первый, кто публикует свободный slug, забирает его вместе с
       токеном. Дальшеslug принадлежит владельцу токена. */
    const token = clean(body.token, 80);
    if (!token) return json(res, {ok: false, reason: 'no_token'});
    if (shop && shop.token !== token) return json(res, {ok: false, reason: 'forbidden'});

    if (action === 'publish'){
      const s = body.shop || {};
      const row = {
        slug, token,
        shop: clean(s.shop, 80) || 'Про Барбер',
        name: clean(s.name, 80),
        role: clean(s.role, 40) || 'Барбер',
        about: clean(s.about, 600),
        address: clean(s.address, 200),
        phone: clean(s.phone, 40),
        photo: clean(s.photo, 400),
        currency: ['USD', 'EUR', 'UAH'].includes(s.currency) ? s.currency : 'UAH',
        lang: ['uk', 'ru', 'en'].includes(s.lang) ? s.lang : 'uk',
        step: [15, 30, 60].includes(Number(s.step)) ? Number(s.step) : 30,
        hours: normHours(s.hours),
        services: normServices(s.services),
        updated_at: new Date().toISOString(),
      };
      if (shop) await patch('barber_shops?slug=eq.' + slug, row);
      else await insert('barber_shops', [row], 'return=minimal');

      /* занятость публикуем целиком за окно вперёд: так проще, чем
         вести дельты, и прошлое само вычищается */
      const from = utcToday();
      await sb('barber_busy?slug=eq.' + slug, {method: 'DELETE'});
      const busy = (Array.isArray(body.busy) ? body.busy : [])
        .filter(b => isDate(b.date) && isTime(b.time) && b.date >= from && b.date <= addDaysIso(from, HORIZON_DAYS))
        .slice(0, 2000)
        .map(b => ({slug, date: b.date, time: b.time, dur: Math.max(5, Number(b.dur) || 30)}));
      /* один и тот же слот мог прийти дважды — ключ (slug,date,time) */
      const seen = {};
      const rows = busy.filter(b => {
        const k = b.date + b.time;
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      });
      if (rows.length) await insert('barber_busy', rows, 'return=minimal');
      res.status(200).json({ok: true, slug, busy: rows.length});
      return;
    }

    if (action === 'pull'){
      if (!shop) return json(res, {ok: false, reason: 'no_shop'});
      const rows = await get('barber_requests?slug=eq.' + slug + '&status=eq.new' +
                             '&select=id,name,phone,service_id,service,price,dur,date,time,note,created_at' +
                             '&order=created_at.asc&limit=100');
      if (rows.length){
        const ids = rows.map(r => '"' + r.id + '"').join(',');
        await patch('barber_requests?id=in.(' + ids + ')', {pulled_at: new Date().toISOString()});
      }
      res.status(200).json({
        ok: true,
        requests: rows.map(r => Object.assign({}, r, {date: String(r.date).slice(0, 10)})),
      });
      return;
    }

    /* ── привязка Telegram ──────────────────────────────────────────
       Кабинет просит код, барбер отправляет его боту командой /start.
       Так чат привязывается к барберу без паролей и без логинов. */
    if (action === 'link'){
      const code = uid('lk');
      if (!shop) return json(res, {ok: false, reason: 'no_shop'});
      await patch('barber_shops?slug=eq.' + slug, {tg_link_code: code});
      const bot = env('BOT_USERNAME');
      res.status(200).json({
        ok: true, code,
        url: bot ? 'https://t.me/' + bot + '?start=' + code : '',
        linked: !!shop.tg_chat_id,
      });
      return;
    }

    if (action === 'unlink'){
      if (!shop) return json(res, {ok: false, reason: 'no_shop'});
      await patch('barber_shops?slug=eq.' + slug, {tg_chat_id: null, tg_link_code: null});
      res.status(200).json({ok: true});
      return;
    }

    if (action === 'resolve'){
      if (!shop) return json(res, {ok: false, reason: 'no_shop'});
      const id = clean(body.id, 40);
      const status = body.status === 'accepted' ? 'accepted' : 'declined';
      if (!id) return json(res, {ok: false, reason: 'bad_id'});
      await patch('barber_requests?slug=eq.' + slug + '&id=eq.' + id, {status});
      res.status(200).json({ok: true});
      return;
    }

    res.status(200).json({ok: false, reason: 'unknown_action'});
  } catch (e){
    res.status(200).json({ok: false, reason: 'error', message: String(e && e.message || e).slice(0, 200)});
  }

  /* ── Telegram: барберу сразу видно новую заявку ───────────────────
     Бот необязателен: без токена или без привязанного чата просто
     молчим, заявка всё равно доедет до кабинета. */
  async function notify(shopRow, row){
    const BOT = env('BOT_TOKEN');
    if (!BOT || !shopRow.tg_chat_id) return;
    const app = env('APP_URL');
    const text = '✂️ Новая заявка\n\n' +
      row.name + '\n' + row.phone + '\n' +
      row.service + ' · ' + row.date + ' ' + row.time +
      (row.note ? '\n\n«' + row.note + '»' : '');
    const kb = {inline_keyboard: [[
      {text: '✅ Принять', callback_data: 'ok:' + row.id},
      {text: '✕ Отклонить', callback_data: 'no:' + row.id},
    ]].concat(app ? [[{text: 'Открыть кабинет', url: app}]] : [])};
    try {
      await fetch('https://api.telegram.org/bot' + BOT + '/sendMessage', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({chat_id: shopRow.tg_chat_id, text, reply_markup: kb}),
      });
    } catch (e){ /* уведомление — не повод ронять заявку */ }
  }
};

function json(res, obj){ res.status(200).json(obj); return; }
function safeJson(s){ try { return JSON.parse(s); } catch (e){ return {}; } }

/* витрина без внутренностей: токен и чат наружу не отдаём */
function publicShop(row){
  return {
    slug: row.slug, shop: row.shop, name: row.name, role: row.role,
    about: row.about, address: row.address, phone: row.phone, photo: row.photo,
    currency: row.currency, lang: row.lang, step: row.step,
    hours: row.hours || {}, services: Array.isArray(row.services) ? row.services : [],
  };
}

function normHours(h){
  const out = {};
  DOW.forEach(k => {
    const v = (h || {})[k] || {};
    out[k] = {
      on: !!v.on,
      from: isTime(v.from) ? v.from : '09:00',
      to: isTime(v.to) ? v.to : '20:00',
    };
  });
  return out;
}

function normServices(list){
  return (Array.isArray(list) ? list : []).slice(0, 40).map(s => ({
    id: clean(s.id, 40),
    name: clean(s.name, 80),
    price: Math.max(0, Number(s.price) || 0),
    dur: Math.max(5, Number(s.dur) || 30),
  })).filter(s => s.id && s.name);
}

module.exports.helpers = {clean, digits, isDate, isTime, mins, dowKey, addDaysIso, normHours, normServices, publicShop};
