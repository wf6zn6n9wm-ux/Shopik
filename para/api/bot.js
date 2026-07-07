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
const APP_VERSION = '7';   // бамп при каждом релизе — заставляет Telegram открыть свежий URL (обход кэша)
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
      const r = await tg('setWebhook', TOKEN, { url: hook, allowed_updates: ['message'] });
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
