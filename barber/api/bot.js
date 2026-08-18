// Telegram-бот «Про Барбера» — вебхук.
//
// Бот нужен барберу, а не клиенту: он приносит заявки с сайта прямо в
// телефон и даёт решить их одной кнопкой. Клиент записывается на
// публичной странице, никакого бота ему не нужно.
//
// Что умеет:
//   /start <код>  — привязать этот чат к кабинету (код берётся в настройках)
//   /zayavki      — показать открытые заявки
//   /stop         — отвязать чат
//   кнопки        — «Принять» / «Отклонить» под уведомлением о заявке
//
// Вебхук ставится один раз:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP>/api/bot&secret_token=<SECRET>
//
// Переменные окружения:
//   BARBER_BOT_TOKEN                  — токен бота
//   BARBER_SUPABASE_URL / SUPABASE_URL
//   BARBER_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY
//   BARBER_TG_SECRET                  — секрет вебхука (необязателен, но лучше задать)
//   BARBER_APP_URL                    — ссылка на кабинет для кнопки

function env(name){ return process.env['BARBER_' + name] || process.env[name] || ''; }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const BOT = env('BOT_TOKEN');
  const URL_ = env('SUPABASE_URL');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  const SECRET = env('TG_SECRET');
  const APP = env('APP_URL');

  if (!BOT || !URL_ || !SERVICE){ res.status(200).json({ok: false, reason: 'not_configured'}); return; }
  /* Telegram шлёт секрет заголовком: чужой POST не притворится вебхуком */
  if (SECRET && req.headers['x-telegram-bot-api-secret-token'] !== SECRET){
    res.status(401).json({ok: false, reason: 'unauthorized'});
    return;
  }

  const H = {apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json'};
  async function sb(path, opts){
    const r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({headers: H}, opts || {}));
    const t = await r.text();
    if (!r.ok) throw new Error(r.status + ' ' + path + ' ' + t.slice(0, 200));
    return t ? JSON.parse(t) : [];
  }
  const patch = (path, row) => sb(path, {
    method: 'PATCH', body: JSON.stringify(row),
    headers: Object.assign({}, H, {Prefer: 'return=representation'}),
  });
  async function tg(method, payload){
    try {
      const r = await fetch('https://api.telegram.org/bot' + BOT + '/' + method, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      return await r.json();
    } catch (e){ return {ok: false}; }
  }

  const upd = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});

  try {
    /* ── кнопки под уведомлением ── */
    if (upd.callback_query){
      const cq = upd.callback_query;
      const chat = cq.message && cq.message.chat ? cq.message.chat.id : null;
      const m = /^(ok|no):(.+)$/.exec(String(cq.data || ''));
      if (!m || !chat){ await tg('answerCallbackQuery', {callback_query_id: cq.id}); return done(res); }

      const shops = await sb('barber_shops?tg_chat_id=eq.' + chat + '&select=slug');
      if (!shops.length){
        await tg('answerCallbackQuery', {callback_query_id: cq.id, text: 'Чат не привязан к кабинету'});
        return done(res);
      }
      const status = m[1] === 'ok' ? 'accepted' : 'declined';
      const rows = await patch('barber_requests?id=eq.' + m[2] + '&slug=eq.' + shops[0].slug, {status});
      const label = status === 'accepted' ? '✅ Принято' : '✕ Отклонено';
      await tg('answerCallbackQuery', {callback_query_id: cq.id, text: rows.length ? label : 'Заявка уже решена'});
      if (rows.length && cq.message){
        await tg('editMessageText', {
          chat_id: chat, message_id: cq.message.message_id,
          text: (cq.message.text || '') + '\n\n' + label,
        });
      }
      return done(res);
    }

    const msg = upd.message || upd.edited_message;
    if (!msg || !msg.chat){ return done(res); }
    const chat = msg.chat.id;
    const text = String(msg.text || '').trim();

    /* ── привязка чата ── */
    const start = /^\/start(?:@\w+)?\s*(\S+)?/.exec(text);
    if (start){
      const code = start[1] || '';
      if (!code){
        await tg('sendMessage', {chat_id: chat, text:
          'Это бот «Про Барбера».\n\nОн приносит заявки с вашей страницы записи и даёт принять их одной кнопкой.\n\n' +
          'Чтобы привязать чат: кабинет → Настройки → Онлайн-запись → «Подключить Telegram». Там будет ссылка с кодом.'});
        return done(res);
      }
      const found = await sb('barber_shops?tg_link_code=eq.' + encodeURIComponent(code) + '&select=slug,name');
      if (!found.length){
        await tg('sendMessage', {chat_id: chat, text: 'Код не подошёл. Возьмите свежий в настройках кабинета.'});
        return done(res);
      }
      await patch('barber_shops?slug=eq.' + found[0].slug, {tg_chat_id: chat, tg_link_code: null});
      await tg('sendMessage', {chat_id: chat, text:
        'Готово. Заявки с сайта будут приходить сюда.\n\n/zayavki — открытые заявки\n/stop — отвязать чат'});
      return done(res);
    }

    const shops = await sb('barber_shops?tg_chat_id=eq.' + chat + '&select=slug,name,currency');
    if (!shops.length){
      await tg('sendMessage', {chat_id: chat, text: 'Чат не привязан. Возьмите ссылку в настройках кабинета.'});
      return done(res);
    }
    const slug = shops[0].slug;

    if (/^\/stop\b/.test(text)){
      await patch('barber_shops?slug=eq.' + slug, {tg_chat_id: null});
      await tg('sendMessage', {chat_id: chat, text: 'Отвязал. Заявки останутся в кабинете.'});
      return done(res);
    }

    if (/^\/zayavki\b/.test(text) || /^\/requests\b/.test(text)){
      const rows = await sb('barber_requests?slug=eq.' + slug + '&status=eq.new' +
                            '&select=id,name,phone,service,date,time&order=date.asc&limit=10');
      if (!rows.length){
        await tg('sendMessage', {chat_id: chat, text: 'Открытых заявок нет.'});
        return done(res);
      }
      for (const r of rows){
        await tg('sendMessage', {
          chat_id: chat,
          text: '✂️ ' + r.name + '\n' + r.phone + '\n' + r.service + ' · ' +
                String(r.date).slice(0, 10) + ' ' + r.time,
          reply_markup: {inline_keyboard: [[
            {text: '✅ Принять', callback_data: 'ok:' + r.id},
            {text: '✕ Отклонить', callback_data: 'no:' + r.id},
          ]]},
        });
      }
      return done(res);
    }

    await tg('sendMessage', {chat_id: chat, text:
      'Команды: /zayavki — открытые заявки, /stop — отвязать чат.' +
      (APP ? '\n\nКабинет: ' + APP : '')});
    return done(res);
  } catch (e){
    /* Telegram переспросит, если ответить ошибкой — а нам это не нужно:
       лишний повтор превратится в дубли сообщений */
    res.status(200).json({ok: false, reason: 'error', message: String(e && e.message || e).slice(0, 200)});
  }
};

function done(res){ res.status(200).json({ok: true}); }
function safeJson(s){ try { return JSON.parse(s); } catch (e){ return {}; } }
