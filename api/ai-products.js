// Serverless-функція (Vercel): аналізує фото товару за допомогою Claude (vision)
// і повертає готову картку — назву, ціну, опис та категорію.
// Ключ береться із захищеної змінної оточення ANTHROPIC_API_KEY
// (Vercel → Settings → Environment Variables), у коді його немає.
//
// Запит:  POST { image: "data:image/jpeg;base64,...", categories?: ["Одяг", ...] }
// Відповідь: { ok: true, product: { name, price, description, category } }

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Коротка назва товару українською, 2–4 слова' },
    price: { type: 'integer', description: 'Орієнтовна роздрібна ціна у гривнях (ціле число)' },
    description: { type: 'string', description: '1–2 короткі продаючі речення українською' },
    category: { type: 'string', description: 'Категорія товару одним-двома словами українською' }
  },
  required: ['name', 'price', 'description', 'category'],
  additionalProperties: false
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const image = body.image;
    const categories = Array.isArray(body.categories) ? body.categories.filter(Boolean) : [];
    const KEY = process.env.ANTHROPIC_API_KEY;

    if (!KEY) { res.status(200).json({ ok: false, reason: 'no_key' }); return; }
    if (!image || typeof image !== 'string') { res.status(200).json({ ok: false, reason: 'no_image' }); return; }

    // Розбираємо data-URL: "data:image/jpeg;base64,XXXX"
    const m = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) { res.status(200).json({ ok: false, reason: 'bad_image' }); return; }
    const mediaType = m[1];
    const b64 = m[2];

    const catHint = categories.length
      ? `Обери категорію зі списку, якщо пасує: ${categories.join(', ')}. Інакше запропонуй свою.`
      : 'Запропонуй доречну категорію.';

    // Haiku — найдешевша модель Claude, її вистачає для карток товару.
    // За потреби можна змінити через змінну оточення AI_MODEL (напр. claude-opus-4-8).
    const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
    const payload = {
      model: MODEL,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          {
            type: 'text',
            text: 'На фото — товар для інтернет-магазину. Придумай для нього картку: '
              + 'назву, орієнтовну роздрібну ціну в гривнях, короткий продаючий опис (1–2 речення) '
              + 'та категорію. Пиши українською, живою мовою, без води. ' + catHint
          }
        ]
      }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } }
    };

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      res.status(200).json({ ok: false, reason: 'api_error', detail: (data && data.error && data.error.message) || aiRes.status });
      return;
    }

    // Дістаємо текстовий блок і парсимо JSON
    let text = '';
    if (data && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block && block.type === 'text' && block.text) { text += block.text; }
      }
    }

    let product = null;
    try { product = JSON.parse(text); } catch (e) { product = null; }

    if (!product || typeof product !== 'object') {
      res.status(200).json({ ok: false, reason: 'parse', raw: text.slice(0, 200) });
      return;
    }

    const clean = {
      name: String(product.name || '').slice(0, 80),
      price: Math.max(0, parseInt(product.price, 10) || 0),
      description: String(product.description || '').slice(0, 400),
      category: String(product.category || '').slice(0, 40)
    };

    res.status(200).json({ ok: true, product: clean });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'exception', error: String(e && e.message) });
  }
};

// Vision-виклик може тривати довше за типовий ліміт — даємо запас часу.
module.exports.config = { maxDuration: 60 };
