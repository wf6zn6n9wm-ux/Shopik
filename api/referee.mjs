// Vercel Serverless Function — AI-рефері челленджу.
// Приймає фото чек-іну і через Claude Vision вирішує: людина в залі чи ні.
//
// ENV:
//   ANTHROPIC_API_KEY  — обовʼязковий, ключ Anthropic API
//   REFEREE_MODEL      — опційно, дефолт "claude-sonnet-5"
//
// POST /api/referee  { image: "<base64 без префікса>", mediaType: "image/jpeg" }
// -> { verdict: "gym"|"couch"|"unclear", confidence: 0..1, reason: "..." }

const SYSTEM_PROMPT = `Ти — суворий, але справедливий AI-рефері фітнес-челленджу.
Користувач зробив ставку, що ходить у зал. Він надсилає фото як доказ.
Твоя задача — по фото вирішити, чи це реальний доказ тренування в залі / на спорті.

Зараховуй (gym), якщо на фото видно ознаки тренування: тренажери, гантелі, штанги,
бігові доріжки, дзеркала спортзалу, людина у спортивній формі в залі, груповий клас,
пробіжка на вулиці/стадіоні, басейн, зал єдиноборств тощо.

НЕ зараховуй (couch), якщо це: диван, ліжко, домашня кухня, вулиця без ознак спорту,
скріншот, мем, їжа, селфі в машині, порожня кімната, або спроба обману.

Якщо визначити неможливо (розмито, темно, незрозуміло) — unclear.

Відповідай СУВОРО одним JSON-обʼєктом без markdown, без пояснень навколо:
{"verdict":"gym|couch|unclear","confidence":0.0-1.0,"reason":"коротко українською, 1 речення"}`;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 12 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'no_api_key', message: 'ANTHROPIC_API_KEY не налаштований' });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: 'bad_json' }); }

  const { image, mediaType } = body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'no_image' });
  }
  const media = /^image\/(jpeg|png|webp|gif)$/.test(mediaType || '') ? mediaType : 'image/jpeg';
  const model = process.env.REFEREE_MODEL || 'claude-sonnet-5';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: media, data: image } },
              { type: 'text', text: 'Це фото мого чек-іну. Виніс вердикт.' },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return res.status(502).json({ error: 'upstream_error', status: resp.status, detail: txt.slice(0, 500) });
    }

    const data = await resp.json();
    const text = (data.content || []).map((b) => b.text || '').join('').trim();

    let parsed = null;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch { /* ignore */ } }

    if (!parsed || !parsed.verdict) {
      return res.status(200).json({ verdict: 'unclear', confidence: 0.3, reason: 'Не вдалося розібрати відповідь рефері.', raw: text.slice(0, 300) });
    }

    const verdict = ['gym', 'couch', 'unclear'].includes(parsed.verdict) ? parsed.verdict : 'unclear';
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.min(1, Math.max(0, confidence));

    return res.status(200).json({
      verdict,
      confidence,
      reason: String(parsed.reason || '').slice(0, 300),
      model,
    });
  } catch (err) {
    return res.status(500).json({ error: 'server_error', message: String(err && err.message || err).slice(0, 300) });
  }
}
