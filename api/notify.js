// Serverless-функція (Vercel): надсилає продавцю повідомлення про нове замовлення
// через Telegram-бота. Токен бота береться з захищеної змінної оточення BOT_TOKEN
// (задається у Vercel → Settings → Environment Variables), у коді його немає.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const chatId = body.chatId;
    const order = body.order || {};
    const shopName = body.shopName || 'Магазин';
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN || !chatId) { res.status(200).json({ ok: false, reason: 'missing' }); return; }

    const text = '🛍 Нове замовлення — ' + shopName + '\n\n'
      + 'Товар: ' + (order.product || '—') + '\n'
      + 'Імʼя: ' + (order.name || '—') + '\n'
      + 'Телефон: ' + (order.phone || '—')
      + (order.comment ? '\n\n' + order.comment : '');

    const tgRes = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
    const data = await tgRes.json().catch(() => ({}));
    res.status(200).json({ ok: !!(data && data.ok), tg: data });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message) });
  }
};
