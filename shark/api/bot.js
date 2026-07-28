// Serverless-функция (Vercel) — вебхук Telegram-бота SHARK.
//
// Делает:
//   • /start [ref_xxx] → регистрирует пользователя, привязывает реферала,
//     показывает кнопку «🦈 Открыть Shark» (WebApp)
//   • callback_query от АДМИНА → подтверждение/отклонение заявок на вывод:
//       wd_ok / wd_no — выплату админ делает вручную; при отклонении деньги
//                        возвращаются на баланс пользователя
//   • successful_payment → задел под оплату Telegram Stars (пополнение)
//
// Разовая привязка вебхука: открыть GET https://<домен>/api/bot?setup=1
//
// Переменные окружения — те же, что и у api/shark.js:
//   SHARK_BOT_TOKEN/BOT_TOKEN, SHARK_SUPABASE_URL/SUPABASE_URL,
//   SHARK_SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY,
//   SHARK_ADMIN_IDS, SHARK_APP_URL — URL Mini App (по умолчанию домен ниже).

function env(name) { return process.env['SHARK_' + name] || process.env[name] || ''; }
// адрес Mini App (можно переопределить переменной SHARK_APP_URL)
const DEFAULT_APP_URL = 'https://shopik-rjov.vercel.app/';
const APP_VERSION = '1';                 // бампать при релизе — обходит кэш Telegram
function appUrl() {
  const base = env('APP_URL') || DEFAULT_APP_URL;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'v=' + APP_VERSION;
}
function adminIds() {
  return (env('ADMIN_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
}
function isAdmin(id) { return adminIds().includes(Number(id)); }

// Пакеты звёзд — те же, что в api/shark.js (сколько игровых звёзд зачислять)

const WELCOME =
  '🦈 Добро пожаловать в Shark!\n\n' +
  '💰 Задания — реальные деньги (грн / USDT)\n' +
  '🎮 Игры на звёзды — краш, рулетка, колесо\n' +
  '🎁 Ежедневные кейсы и бонусы\n\n' +
  'Жми кнопку ниже, чтобы начать 👇';

async function tg(method, payload) {
  const token = env('BOT_TOKEN');
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    return await r.json().catch(() => ({}));
  } catch (e) { return { ok: false }; }
}

// ---- Supabase REST ----
function sbHeaders() {
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
}
async function sbGet(path) {
  const URL = env('SUPABASE_URL'); if (!URL) return [];
  const r = await fetch(URL + '/rest/v1/' + path, { headers: sbHeaders() });
  const t = await r.text(); try { return t ? JSON.parse(t) : []; } catch (e) { return []; }
}
async function sbPatch(path, row) {
  const URL = env('SUPABASE_URL'); if (!URL) return;
  await fetch(URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: Object.assign({}, sbHeaders(), { Prefer: 'return=minimal' }), body: JSON.stringify(row)
  });
}
async function applyLedger(tg_id, currency, amount, kind, ref, idem, meta) {
  const URL = env('SUPABASE_URL'); if (!URL) return { ok: false };
  const r = await fetch(URL + '/rest/v1/rpc/shark_apply_ledger', {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({ p_tg: tg_id, p_currency: currency, p_amount: amount, p_kind: kind, p_ref: ref || null, p_idem: idem || null, p_meta: meta || {} })
  });
  return { ok: r.ok, status: r.status };
}
// начислить пригласившему звёзды за друга с суточным лимитом (idempotent)

async function ensureUser(from, startParam) {
  const rows = await sbGet('shark_users?tg_id=eq.' + from.id + '&select=tg_id');
  if (rows[0]) return false;
  const refCode = 'r' + Number(from.id).toString(36) + Math.random().toString(36).slice(2, 6);
  let refBy = null;
  if (startParam && /^ref_/.test(startParam)) {
    const inv = await sbGet('shark_users?ref_code=eq.' + encodeURIComponent(startParam.slice(4)) + '&select=tg_id');
    if (inv[0] && Number(inv[0].tg_id) !== Number(from.id)) refBy = Number(inv[0].tg_id);
  }
  const URL = env('SUPABASE_URL');
  await fetch(URL + '/rest/v1/shark_users', {
    method: 'POST', headers: Object.assign({}, sbHeaders(), { Prefer: 'return=minimal' }),
    body: JSON.stringify({
      tg_id: from.id, username: from.username || null, first_name: from.first_name || null,
      lang: from.language_code === 'uk' ? 'uk' : 'ru', ref_code: refCode, ref_by: refBy
    })
  });
  if (refBy) {
    await fetch(URL + '/rest/v1/shark_referrals', {
      method: 'POST', headers: Object.assign({}, sbHeaders(), { Prefer: 'return=minimal,resolution=ignore-duplicates' }),
      body: JSON.stringify({ inviter_tg: refBy, invited_tg: from.id })
    });
    // Бонус платится не за переход по ссылке, а за первое пополнение друга —
    // иначе регистрация одноразовых аккаунтов сама по себе приносит деньги.
    // Начисляет payReferrer() в api/shark.js при подтверждении оплаты.
    await tg('sendMessage', { chat_id: refBy, text: '👥 Новый друг по вашей ссылке! Бонус придёт, когда он пополнит баланс.' });
  }
  return true;
}

function startKb() {
  return { inline_keyboard: [[{ text: '🦈 Открыть Shark', web_app: { url: appUrl() } }]] };
}

// ---- обработка нажатий админа ----
async function handleCallback(cq) {
  const data = cq.data || '';
  const fromId = cq.from && cq.from.id;
  const m = data.match(/^(wd_ok|wd_no):(\d+)$/);
  if (!m) { await tg('answerCallbackQuery', { callback_query_id: cq.id }); return; }
  if (!isAdmin(fromId)) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Нет прав', show_alert: true }); return; }
  const kind = m[1], id = Number(m[2]);
  const chatId = cq.message && cq.message.chat && cq.message.chat.id;
  const msgId = cq.message && cq.message.message_id;
  const origText = (cq.message && cq.message.text) || '';

  if (kind === 'wd_ok' || kind === 'wd_no') {
    const rows = await sbGet('shark_withdrawals?id=eq.' + id + '&select=*');
    const wd = rows[0];
    if (!wd) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Заявка не найдена', show_alert: true }); return; }
    if (wd.status !== 'pending') { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Уже обработана: ' + wd.status, show_alert: true }); return; }

    // Новые заявки в TON, но в базе могут висеть незакрытые грн-заявки времён
    // старой экономики. Возвращать надо ровно ту валюту, которую списали,
    // поэтому смотрим на заполненную колонку суммы, а не на текущий режим.
    const isTon = wd.amount_ton != null;
    const amt = isTon ? Number(wd.amount_ton) : Number(wd.amount_uah);
    const cur = isTon ? 'ton' : 'uah';
    const label = isTon ? (amt + ' TON') : (amt.toFixed(2) + ' грн');

    if (kind === 'wd_ok') {
      await sbPatch('shark_withdrawals?id=eq.' + id + '&status=eq.pending', { status: 'paid', decided_at: new Date().toISOString(), decided_by: fromId });
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: origText + '\n\n✅ ВЫПЛАЧЕНО (' + fromId + ')' });
      await tg('sendMessage', { chat_id: wd.tg_id, text: '✅ Вывод ' + label + ' отправлен. Спасибо!' });
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отмечено выплаченным' });
    } else {
      // отклонение → вернуть на баланс
      await applyLedger(wd.tg_id, cur, amt, 'withdraw_refund', 'wd:' + id, 'wd_refund:' + id, {});
      await sbPatch('shark_withdrawals?id=eq.' + id + '&status=eq.pending', { status: 'rejected', decided_at: new Date().toISOString(), decided_by: fromId });
      await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: origText + '\n\n❌ ОТКЛОНЕНО, средства возвращены (' + fromId + ')' });
      await tg('sendMessage', { chat_id: wd.tg_id, text: '❌ Заявка на вывод ' + label + ' отклонена. Средства возвращены на баланс.' });
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Отклонено, возврат сделан' });
    }
    return;
  }
}

module.exports = async (req, res) => {
  try {
    // разовая привязка вебхука: GET ?setup=1
    if (req.method === 'GET') {
      if (req.query && req.query.setup) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const hook = 'https://' + host + '/api/bot';
        const r = await tg('setWebhook', { url: hook, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
        res.status(200).json({ ok: true, setWebhook: r, hook });
        return;
      }
      res.status(200).json({ ok: true, hint: 'add ?setup=1 to bind webhook' });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    let update = req.body;
    if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
    update = update || {};

    if (update.callback_query) { await handleCallback(update.callback_query); res.status(200).json({ ok: true }); return; }

    // Telegram Stars: подтверждаем pre_checkout
    if (update.pre_checkout_query) {
      await tg('answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
      res.status(200).json({ ok: true }); return;
    }

    const msg = update.message;

    // Оплата Telegram Stars больше НЕ зачисляет баланс: звёзды на счету не
    // хранятся. Этот обработчик вернётся на Э4 — там за звёзды покупается
    // кейс с подарком, и оплата сразу выдаёт подарок в инвентарь.
    if (msg && msg.successful_payment) { res.status(200).json({ ok: true }); return; }

    if (msg && msg.text) {
      const text = msg.text.trim();
      if (text === '/start' || text.indexOf('/start ') === 0) {
        const startParam = text.indexOf('/start ') === 0 ? text.slice(7).trim() : null;
        await ensureUser(msg.from, startParam);
        await tg('sendMessage', { chat_id: msg.chat.id, text: WELCOME, reply_markup: startKb() });
      } else if (text === '/app') {
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Открыть приложение:', reply_markup: startKb() });
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message) });
  }
};
