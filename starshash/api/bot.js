// Бот StarsHash. Сюда Telegram присылает всё, что происходит вне
// приложения, и главное из этого — оплата звёздами.
//
// Почему зачисление живёт здесь, а не в приложении: слово телефона «я
// заплатил» ничего не стоит. Telegram сообщает об оплате напрямую боту,
// и только это сообщение считается доказательством.
//
// Адреса:
//   POST /api/bot            — сюда Telegram шлёт обновления
//   GET  /api/bot?setup=КЛЮЧ — разово прописать вебхук и кнопку меню
//
// Переменные окружения — те же, что у starshash.js, плюс:
//   SH_APP_URL      — адрес мини-аппа (для кнопки меню)
//   SH_SETUP_SECRET — пароль к ?setup=, чтобы вебхук не переставил чужой

const crypto = require('crypto');

function env(k) { return process.env['SH_' + k] || process.env[k] || ''; }

function tg(метод, токен, тело) {
  return fetch('https://api.telegram.org/bot' + токен + '/' + метод, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(тело || {})
  });
}

module.exports = async (req, res) => {
  try {
    const URL = env('SUPABASE_URL');
    const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
    const BOT = env('BOT_TOKEN');
    if (!BOT) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }

    const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
    async function sb(path, opts) {
      const r = await fetch(URL + '/rest/v1/' + path, Object.assign({ headers: H }, opts || {}));
      const t = await r.text();
      let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
      if (!r.ok) throw new Error('db ' + r.status + ' ' + String(t).slice(0, 200));
      return j;
    }

    // ── разовая настройка ────────────────────────────────────────────
    // Открывается ключом: без него любой, кто знает адрес, переставил бы
    // вебхук на себя и увёл все платежи.
    if (req.method === 'GET') {
      const секрет = env('SETUP_SECRET');
      const дали = String((req.query && req.query.setup) || '');
      if (!секрет || дали !== секрет) { res.status(403).json({ ok: false, reason: 'forbidden' }); return; }

      const хост = req.headers['x-forwarded-host'] || req.headers.host;
      const хук = 'https://' + хост + '/api/bot';
      const r = await tg('setWebhook', BOT, {
        url: хук,
        // pre_checkout_query обязателен для оплаты звёздами: не подтвердишь
        // за десять секунд — Telegram отменит платёж
        allowed_updates: ['message', 'pre_checkout_query']
      });
      const j = await r.json().catch(() => ({}));
      res.status(200).json({ ok: !!(j && j.ok), webhook: хук, telegram: j });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method' }); return; }

    let update = req.body;
    if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
    update = update || {};

    // 1) Подтверждение перед списанием. Отвечать надо всегда и быстро.
    if (update.pre_checkout_query) {
      try { await tg('answerPreCheckoutQuery', BOT, { pre_checkout_query_id: update.pre_checkout_query.id, ok: true }); } catch (e) {}
      res.status(200).json({ ok: true });
      return;
    }

    // 2) Оплата прошла — зачисляем.
    const оплата = update.message && update.message.successful_payment;
    if (оплата) {
      let полезное = {};
      try { полезное = JSON.parse(оплата.invoice_payload || '{}'); } catch (e) {}
      const кому = Number(полезное.tg || 0);
      // сумму берём из ответа Telegram, а не из payload: payload собирали
      // мы сами, а total_amount — то, что человек действительно заплатил
      const сколько = Number(оплата.total_amount || 0);
      const чек = String(оплата.telegram_payment_charge_id || '');

      if (кому && сколько > 0 && URL && SERVICE) {
        /* Повторную доставку того же события Telegram делает при любой
           заминке с ответом. Без защиты от повтора одна оплата зачислялась
           бы дважды, поэтому сначала пишем в журнал с уникальным номером
           чека, и только если запись прошла — трогаем баланс. */
        let первый = true;
        try {
          const было = await sb('sh_tx?kind=eq.topup&meta->>charge=eq.' + encodeURIComponent(чек) + '&select=id&limit=1');
          первый = !(Array.isArray(было) && было.length);
        } catch (e) {}

        if (первый) {
          const u = (await sb('sh_users?tg_id=eq.' + кому + '&select=bal') || [])[0];
          if (u) {
            const стало = Math.round((Number(u.bal) + сколько) * 1e6) / 1e6;
            await sb('sh_users?tg_id=eq.' + кому, { method: 'PATCH', body: JSON.stringify({ bal: стало }) });
            await sb('sh_tx', { method: 'POST', body: JSON.stringify({
              tg_id: кому, kind: 'topup', amount: сколько, bal_after: стало, meta: { charge: чек }
            }) });

            /* Доля пригласившему — то самое обещание «5% с каждого
               пополнения». Начисляем здесь, потому что только здесь
               известно, что пополнение настоящее. */
            const св = (await sb('sh_refs?invitee=eq.' + кому + '&select=inviter,earned') || [])[0];
            if (св) {
              const доля = Math.round(сколько * 0.05 * 1e6) / 1e6;
              if (доля > 0) {
                const п = (await sb('sh_users?tg_id=eq.' + св.inviter + '&select=bal,ref_earned') || [])[0];
                if (п) {
                  const бал = Math.round((Number(п.bal) + доля) * 1e6) / 1e6;
                  const зар = Math.round((Number(п.ref_earned) + доля) * 1e6) / 1e6;
                  await sb('sh_users?tg_id=eq.' + св.inviter, { method: 'PATCH',
                    body: JSON.stringify({ bal: бал, ref_earned: зар }) });
                  await sb('sh_refs?invitee=eq.' + кому, { method: 'PATCH',
                    body: JSON.stringify({ earned: Math.round((Number(св.earned) + доля) * 1e6) / 1e6 }) });
                  await sb('sh_tx', { method: 'POST', body: JSON.stringify({
                    tg_id: св.inviter, kind: 'ref', amount: доля, bal_after: бал, meta: { from: кому, charge: чек }
                  }) });
                }
              }
            }
          }
        }
      }

      try {
        await tg('sendMessage', BOT, { chat_id: update.message.chat.id,
          text: 'Зачислено ' + сколько + ' ★. Приятной игры!' });
      } catch (e) {}
      res.status(200).json({ ok: true });
      return;
    }

    // 3) Обычные сообщения. Бот не переписка, а дверь в приложение.
    const msg = update.message;
    const текст = msg && typeof msg.text === 'string' ? msg.text.trim() : '';
    if (msg && текст.split(/\s+/)[0] === '/start') {
      const app = env('APP_URL');
      try {
        await tg('sendMessage', BOT, {
          chat_id: msg.chat.id,
          text: 'StarsHash — майнинг звёзд, игры и ежедневные бонусы.',
          reply_markup: app ? { inline_keyboard: [[{ text: 'Играть', web_app: { url: app } }]] } : undefined
        });
      } catch (e) {}
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    // Telegram повторяет доставку, пока не получит успех, поэтому на
    // своей ошибке всё равно отвечаем успехом — иначе одно кривое
    // обновление будет ломиться сюда бесконечно.
    res.status(200).json({ ok: true, error: String(e && e.message || e).slice(0, 200) });
  }
};
