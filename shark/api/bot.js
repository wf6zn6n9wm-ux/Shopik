// Serverless-функция (Vercel) — вебхук Telegram-бота SHARK.
//
// Делает:
//   • /start [ref_xxx] → регистрирует пользователя, привязывает реферала,
//     показывает кнопку «🦈 Открыть Shark» (WebApp)
//   • callback_query от АДМИНА → подтверждение/отклонение заявок на вывод:
//       wd_ok / wd_no — выплату админ делает вручную; при отклонении деньги
//                        возвращаются на баланс пользователя
//   • successful_payment → оплата кейса за Telegram Stars: определяет
//     выпадение по заранее зафиксированному seed, кладёт подарок в инвентарь
//     и сообщает админу, что отправить вручную. Если выдать не вышло —
//     возвращает звёзды через refundStarPayment.
//
// Разовая привязка вебхука: открыть GET https://<домен>/api/bot?setup=1
//
// Переменные окружения — те же, что и у api/shark.js:
//   SHARK_BOT_TOKEN/BOT_TOKEN, SHARK_SUPABASE_URL/SUPABASE_URL,
//   SHARK_SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY,
//   SHARK_ADMIN_IDS, SHARK_APP_URL — URL Mini App (по умолчанию домен ниже).

const crypto = require('crypto');
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


const WELCOME =
  '🦈 Добро пожаловать в Shark!\n\n' +
  '💎 Игры на TON — PVP, краш, рулетка\n' +
  '🎁 Кейсы с подарками Telegram за ⭐\n' +
  '👥 Приглашай друзей и получай долю с их пополнений\n\n' +
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
// PATCH/INSERT с возвратом строк: нужны, когда важно узнать, СКОЛЬКО строк
// подошло под фильтр. На этом держится защита от повторного вебхука оплаты.
async function sbPatchReturn(path, row) {
  const URL = env('SUPABASE_URL'); if (!URL) return [];
  const r = await fetch(URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: Object.assign({}, sbHeaders(), { Prefer: 'return=representation' }), body: JSON.stringify(row)
  });
  const t = await r.text(); try { return t ? JSON.parse(t) : []; } catch (e) { return []; }
}
async function sbInsertReturn(path, row) {
  const URL = env('SUPABASE_URL'); if (!URL) return [];
  const r = await fetch(URL + '/rest/v1/' + path, {
    method: 'POST', headers: Object.assign({}, sbHeaders(), { Prefer: 'return=representation' }), body: JSON.stringify(row)
  });
  const t = await r.text(); try { return t ? JSON.parse(t) : []; } catch (e) { return []; }
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

// Каталог кейсов дублируется здесь намеренно: вебхук оплаты приходит в этот
// файл, а не в api/shark.js, и тянуть общий модуль через границу serverless-
// функций дороже, чем держать таблицу в двух местах. Тест сверяет их на
// идентичность, поэтому разойтись молча они не могут.
const CASES = {
  reef: { name: 'Риф', price: 50, drops: [
    { emoji: '🫧', name: 'Пузырь',   value: 15,   weight: 55  },
    { emoji: '🌊', name: 'Волна',    value: 25,   weight: 25  },
    { emoji: '🐚', name: 'Ракушка',  value: 50,   weight: 13  },
    { emoji: '🐠', name: 'Рыбка',    value: 100,  weight: 5   },
    { emoji: '🪸', name: 'Коралл',   value: 500,  weight: 1.7 },
    { emoji: '⚓', name: 'Якорь',    value: 1000, weight: 0.3 }] },
  deep: { name: 'Глубина', price: 150, drops: [
    { emoji: '🌊', name: 'Волна',    value: 25,   weight: 42  },
    { emoji: '🐚', name: 'Ракушка',  value: 50,   weight: 28  },
    { emoji: '🐠', name: 'Рыбка',    value: 100,  weight: 18  },
    { emoji: '🪸', name: 'Коралл',   value: 200,  weight: 8   },
    { emoji: '⚓', name: 'Якорь',    value: 1000, weight: 3.4 },
    { emoji: '🦈', name: 'Акула',    value: 2500, weight: 0.6 }] },
  abyss: { name: 'Бездна', price: 500, drops: [
    { emoji: '🐠', name: 'Рыбка',    value: 100,   weight: 36  },
    { emoji: '🪸', name: 'Коралл',   value: 200,   weight: 32  },
    { emoji: '⚓', name: 'Якорь',    value: 500,   weight: 21  },
    { emoji: '🦈', name: 'Акула',    value: 1000,  weight: 8   },
    { emoji: '💎', name: 'Жемчуг',   value: 2500,  weight: 2.5 },
    { emoji: '🔱', name: 'Трезубец', value: 10000, weight: 0.3 }] }
};
const CASE_RARITY = ['common', 'common', 'rare', 'epic', 'legendary', 'legendary'];
// Жизненный цикл подарка — копия из api/shark.js: бот и API отмечают выдачу
// независимо, и разойтись эти таблицы не должны. Совпадение проверяет тест.
const GIFT_FLOW = { held: ['sending', 'sent'], sending: ['sent'], sent: [] };
function giftCanGo(from, to) { return (GIFT_FLOW[from] || []).includes(to); }
function caseRoll(seed, drops) {
  const roll = parseInt(crypto.createHash('sha256').update('case:' + seed).digest('hex').slice(0, 8), 16) / 0xffffffff;
  const total = drops.reduce((a, d) => a + d.weight, 0);
  let acc = 0;
  for (let i = 0; i < drops.length; i++) { acc += drops[i].weight / total; if (roll <= acc) return i; }
  return drops.length - 1;
}

// Вернуть звёзды, если выдать подарок не вышло. Игрок заплатил — значит либо
// получает подарок, либо получает деньги обратно. Третьего быть не должно.
async function refundStars(uid, chargeId, why) {
  await tg('refundStarPayment', { user_id: uid, telegram_payment_charge_id: chargeId });
  await tg('sendMessage', { chat_id: uid, text: '↩️ Не удалось открыть кейс, звёзды возвращены.' + (why ? '\n' + why : '') });
}

async function handleCasePayment(msg) {
  const sp = msg.successful_payment;
  const chargeId = sp && sp.telegram_payment_charge_id;
  const uid = (msg.from && msg.from.id);
  if (!chargeId || !uid) return;

  let pl = {}; try { pl = JSON.parse(sp.invoice_payload || '{}'); } catch (e) {}
  const orderId = Number(pl.order);
  if (!orderId) { await refundStars(uid, chargeId, 'Заказ не найден.'); return; }

  // Идемпотентность: charge_id уникален в таблице, поэтому повторный вебхук
  // (Telegram шлёт их с ретраями) не создаст второй подарок. Застолбить заказ
  // пытаемся ДО выдачи, фильтром по status=pending — выиграет ровно один вызов.
  const claim = await sbPatchReturn(
    'shark_case_orders?id=eq.' + orderId + '&tg_id=eq.' + uid + '&status=eq.pending',
    { status: 'paid', charge_id: chargeId, paid_at: new Date().toISOString() });
  const order = Array.isArray(claim) && claim[0];
  if (!order) {
    // либо уже обработан (повтор вебхука), либо заказ чужой/несуществующий
    const ex = await sbGet('shark_case_orders?id=eq.' + orderId + '&select=id,charge_id,status');
    if (ex[0] && ex[0].charge_id === chargeId) return;       // тот же платёж, всё уже сделано
    await refundStars(uid, chargeId, 'Заказ уже закрыт.');
    return;
  }

  const c = CASES[order.case_key];
  if (!c) {
    await sbPatch('shark_case_orders?id=eq.' + orderId, { status: 'refunded' });
    await refundStars(uid, chargeId, 'Кейс недоступен.');
    return;
  }

  const idx = caseRoll(order.seed, c.drops);
  const d = c.drops[idx];
  const gi = await sbInsertReturn('shark_gifts', {
    tg_id: uid, order_id: orderId, case_key: order.case_key,
    name: d.name, emoji: d.emoji, star_value: d.value, rarity: CASE_RARITY[idx] || 'common'
  });
  const gift = Array.isArray(gi) && gi[0];
  if (!gift) {
    await sbPatch('shark_case_orders?id=eq.' + orderId, { status: 'refunded' });
    await refundStars(uid, chargeId, 'Не удалось записать подарок.');
    return;
  }
  await sbPatch('shark_case_orders?id=eq.' + orderId, { gift_id: gift.id });

  await tg('sendMessage', { chat_id: uid,
    text: '🎁 Кейс «' + c.name + '» открыт!\n\n' + d.emoji + ' ' + d.name + ' · ' + d.value + ' ⭐\n\nПодарок в вашем инвентаре — отправим вручную в ближайшее время.' });
  // Выдача ручная, как и выплаты: бот сообщает админу, что отправить и кому,
  // и даёт кнопку отметить выдачу — чтобы статус в инвентаре игрока обновился
  // там же, где админ реально работает, а не только в панели.
  for (const id of adminIds()) {
    await tg('sendMessage', { chat_id: id,
      text: '🎁 Кейс «' + c.name + '» · ' + (msg.from.first_name || 'user') + ' (id ' + uid + ')\n'
        + d.emoji + ' ' + d.name + ' · ' + d.value + ' ⭐\n\nОтправьте подарок вручную.',
      reply_markup: giftDecisionKb(gift.id) });
  }
}

// Кнопки на карточке подарка. «В работе» — необязательный шаг: он нужен, когда
// выдача занимает время и игрок иначе не понимает, помнят о нём или нет.
function giftDecisionKb(id) {
  return { inline_keyboard: [[
    { text: '📤 В работе', callback_data: 'gf_go:' + id },
    { text: '✅ Отправлен', callback_data: 'gf_ok:' + id }
  ]] };
}

function startKb() {
  return { inline_keyboard: [[{ text: '🦈 Открыть Shark', web_app: { url: appUrl() } }]] };
}

// ---- обработка нажатий админа ----
async function handleCallback(cq) {
  const data = cq.data || '';
  const fromId = cq.from && cq.from.id;
  const m = data.match(/^(wd_ok|wd_no|gf_go|gf_ok):(\d+)$/);
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

  if (kind === 'gf_go' || kind === 'gf_ok') {
    const to = kind === 'gf_ok' ? 'sent' : 'sending';
    const rows = await sbGet('shark_gifts?id=eq.' + id + '&select=*');
    const g = rows[0];
    if (!g) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Подарок не найден', show_alert: true }); return; }
    if (g.status === to) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Уже отмечено' }); return; }
    if (!giftCanGo(g.status, to)) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Подарок уже выдан', show_alert: true }); return;
    }

    // Тот же условный PATCH, что и в панели: два админа (или админ и панель)
    // могут нажать одновременно, и выиграть должен ровно один — иначе игрок
    // получит два уведомления об одной отправке.
    const patch = { status: to, sent_by: fromId };
    if (to === 'sent') patch.sent_at = new Date().toISOString();
    const done = await sbPatchReturn('shark_gifts?id=eq.' + id + '&status=eq.' + g.status, patch);
    if (!Array.isArray(done) || !done[0]) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Статус уже изменён', show_alert: true }); return;
    }

    const mark = to === 'sent' ? '✅ ОТПРАВЛЕН (' + fromId + ')' : '📤 В РАБОТЕ (' + fromId + ')';
    await tg('editMessageText', {
      chat_id: chatId, message_id: msgId, text: origText + '\n\n' + mark,
      reply_markup: to === 'sent' ? undefined : giftDecisionKb(id)
    });
    if (to === 'sent') {
      await tg('sendMessage', { chat_id: g.tg_id,
        text: '🎁 Подарок отправлен!\n\n' + (g.emoji || '') + ' ' + g.name + '\n\nЗаберите его в чате с Telegram.' });
    }
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: to === 'sent' ? 'Отмечено отправленным' : 'Отмечено в работе' });
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

    // Оплата Telegram Stars: покупка кейса. Баланса в звёздах нет — платёж
    // сразу превращается в подарок в инвентаре.
    if (msg && msg.successful_payment) {
      await handleCasePayment(msg);
      res.status(200).json({ ok: true }); return;
    }

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
