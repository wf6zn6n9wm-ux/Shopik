// Serverless-функция (Vercel) — вебхук Telegram-бота PARA.
//
// Обрабатывает /start:
//   • новый пользователь → приветствие + кнопка «🚀 Открыть PARA» (WebApp)
//   • уже зарегистрирован (есть в паре) → короткое сообщение + та же кнопка
//     (Telegram не разрешает боту авто-открывать Mini App — нужен один тап)
//
// Разовая привязка вебхука: открыть GET https://<домен>/api/bot?setup=1
//
// Использует те же переменные окружения, что и api/para.js:
//   PARA_BOT_TOKEN, PARA_SUPABASE_URL, PARA_SUPABASE_SERVICE_ROLE_KEY
//   PARA_APP_URL — (необязательно) URL Mini App; по умолчанию домен ниже.

function env(name) { return process.env['PARA_' + name] || process.env[name] || ''; }
const DEFAULT_APP_URL = 'https://para-psi.vercel.app/';
const APP_VERSION = '8';   // бамп при каждом релизе — заставляет Telegram открыть свежий URL (обход кэша)
function appUrl() {
  const base = env('APP_URL') || DEFAULT_APP_URL;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'v=' + APP_VERSION;
}

const WELCOME =
  '❤️ Добро пожаловать в PARA!\n\n' +
  'Приложение для пар, которое помогает становиться ближе каждый день.\n\n' +
  '✨ Совместные желания\n' +
  '🎯 Квесты для двоих\n' +
  '📅 Важные даты\n' +
  '💬 Вопрос дня\n\n' +
  'Любовь начинается с внимания ❤️';

async function tg(method, token, payload) {
  return fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// ---- PARA+ подписки: длительность и тип по ключу плана (цены — на стороне para.js) ----
const PLANS = {
  solo_1:  { type: 'solo', months: 1 },  solo_3:  { type: 'solo', months: 3 },  solo_12: { type: 'solo', months: 12 },
  duo_1:   { type: 'duo',  months: 1 },  duo_3:   { type: 'duo',  months: 3 },  duo_12:  { type: 'duo',  months: 12 }
};
function addMonths(date, months) { const d = new Date(date.getTime()); d.setUTCMonth(d.getUTCMonth() + months); return d; }

// ---- Supabase REST-хелперы (сервисный ключ; тот же проект, что и para.js) ----
function sbHeaders() {
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
}
async function sbGet(path) {
  const URL = env('SUPABASE_URL'); if (!URL) return [];
  const r = await fetch(URL + '/rest/v1/' + path, { headers: sbHeaders() });
  const t = await r.text(); try { return t ? JSON.parse(t) : []; } catch (e) { return []; }
}
async function sbPost(path, row) {
  const URL = env('SUPABASE_URL'); if (!URL) return { ok: false, status: 0 };
  try {
    const r = await fetch(URL + '/rest/v1/' + path, {
      method: 'POST', headers: Object.assign({}, sbHeaders(), { Prefer: 'return=minimal' }), body: JSON.stringify(row)
    });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, status: 0 }; }
}
// найти tg второго участника пары (нужно для DUO — Premium покрывает обоих)
async function findPartnerTg(userId) {
  try {
    const mem = await sbGet('para_members?tg_id=eq.' + userId + '&select=couple_id');
    const cid = mem && mem[0] && mem[0].couple_id;
    if (!cid) return null;
    const mm = await sbGet('para_members?couple_id=eq.' + cid + '&select=tg_id');
    const other = (mm || []).map((m) => m.tg_id).filter((t) => String(t) !== String(userId))[0];
    return other || null;
  } catch (e) { return null; }
}
// активировать подписку по данным успешного платежа (idempotent-безопасно: одна запись на платёж)
async function activateSubscription(token, sp) {
  const payloadStr = sp && sp.invoice_payload;
  const chargeId = (sp && sp.telegram_payment_charge_id) || null; // нужен для возврата (refundStarPayment)
  let pl = {}; try { pl = JSON.parse(payloadStr || '{}'); } catch (e) {}
  const uid = pl.tg, planKey = pl.plan, plan = PLANS[planKey];
  if (!uid || !plan) return;
  // продление: если уже есть активная подписка — считаем срок от её окончания
  let startFrom = new Date();
  try {
    const nowIso = new Date().toISOString();
    const existing = await sbGet('subscriptions?telegram_user_id=eq.' + uid + '&status=eq.active&end_date=gt.' + encodeURIComponent(nowIso) + '&select=end_date&order=end_date.desc&limit=1');
    if (existing && existing[0] && existing[0].end_date) { const e = new Date(existing[0].end_date); if (e > startFrom) startFrom = e; }
  } catch (e) {}
  const end = addMonths(startFrom, plan.months);
  const partner = plan.type === 'duo' ? await findPartnerTg(uid) : null;
  const nowIso = new Date().toISOString();
  // база строки + charge_id. Если колонки charge_id ещё нет в БД — вставка с ней
  // упадёт (400), тогда пишем без неё, чтобы подписка точно сохранилась.
  const baseRow = {
    telegram_user_id: uid, partner_user_id: partner, plan: planKey, type: plan.type,
    start_date: nowIso, end_date: end.toISOString(), status: 'active', created_at: nowIso, updated_at: nowIso
  };
  try {
    const res1 = await sbPost('subscriptions', Object.assign({ charge_id: chargeId }, baseRow));
    if (!res1 || !res1.ok) { await sbPost('subscriptions', baseRow); }
  } catch (e) { try { await sbPost('subscriptions', baseRow); } catch (e2) {} }
  const until = end.toISOString().slice(0, 10);
  try {
    await tg('sendMessage', token, {
      chat_id: uid,
      text: '❤️ Спасибо! PARA+ ' + (plan.type === 'duo' ? 'DUO' : 'SOLO') + ' активирован до ' + until + '.' +
        (plan.type === 'duo' ? '\n\nPremium теперь действует и у вашего партнёра 💞' : '')
    });
  } catch (e) {}
  // партнёру по DUO — тоже уведомление
  if (partner) { try { await tg('sendMessage', token, { chat_id: partner, text: '💞 Ваш партнёр оформил PARA+ DUO — Premium активирован и у вас, до ' + until + ' ❤️' }); } catch (e) {} }
}

async function isRegistered(userId) {
  const URL = env('SUPABASE_URL');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!URL || !SERVICE || !userId) return false;
  try {
    const r = await fetch(URL + '/rest/v1/para_members?tg_id=eq.' + userId + '&select=tg_id', {
      headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE }
    });
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  const TOKEN = env('BOT_TOKEN');
  const APP_URL = appUrl();

  // ---- разовая привязка вебхука + кнопки меню: /api/bot?setup=1 ----
  if (req.method === 'GET') {
    if (!TOKEN) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const hook = 'https://' + host + '/api/bot';
    try {
      // pre_checkout_query нужен для оплаты Telegram Stars (PARA+)
      const r = await tg('setWebhook', TOKEN, { url: hook, allowed_updates: ['message', 'pre_checkout_query'] });
      const j = await r.json().catch(() => ({}));
      // обновляем URL кнопки-меню на версионированный (обход кэша Telegram)
      let menu = null;
      try {
        const m = await tg('setChatMenuButton', TOKEN, {
          menu_button: { type: 'web_app', text: 'Открыть PARA', web_app: { url: APP_URL } }
        });
        menu = await m.json().catch(() => ({}));
      } catch (e) { menu = { error: String(e && e.message) }; }
      res.status(200).json({ ok: true, webhook: hook, appUrl: APP_URL, telegram: j, menuButton: menu });
    } catch (e) {
      res.status(200).json({ ok: false, error: String(e && e.message) });
    }
    return;
  }

  // ---- апдейты Telegram (всегда отвечаем 200, чтобы Telegram не ретраил) ----
  if (req.method !== 'POST') { res.status(200).json({ ok: true }); return; }
  try {
    if (!TOKEN) { res.status(200).json({ ok: true }); return; }
    let update = req.body;
    if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
    update = update || {};

    // ---- PARA+ оплата (Telegram Stars) ----
    // 1) pre_checkout_query — подтвердить в течение 10 сек, иначе платёж отменится
    if (update.pre_checkout_query) {
      try { await tg('answerPreCheckoutQuery', TOKEN, { pre_checkout_query_id: update.pre_checkout_query.id, ok: true }); } catch (e) {}
      res.status(200).json({ ok: true }); return;
    }
    // 2) successful_payment — платёж прошёл, активируем подписку
    if (update.message && update.message.successful_payment) {
      await activateSubscription(TOKEN, update.message.successful_payment);
      res.status(200).json({ ok: true }); return;
    }

    const msg = update.message;
    const text = msg && typeof msg.text === 'string' ? msg.text.trim() : '';
    if (msg && text.split(/\s+/)[0] === '/start') {
      const chatId = msg.chat && msg.chat.id;
      const userId = msg.from && msg.from.id;
      const button = { inline_keyboard: [[{ text: '🚀 Открыть PARA', web_app: { url: APP_URL } }]] };
      const registered = await isRegistered(userId);
      await tg('sendMessage', TOKEN, {
        chat_id: chatId,
        text: registered ? 'С возвращением в PARA 💞' : WELCOME,
        reply_markup: button
      });
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: true });
  }
};
