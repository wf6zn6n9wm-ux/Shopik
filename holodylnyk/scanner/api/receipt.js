// POST /api/receipt
//
// Вхід:  { image: "data:image/jpeg;base64,..." }
// Вихід: позиції з нормалізованими назвами, категоріями й термінами
//        придатності — плюс чесний вердикт, чи зійшовся чек.
//
// Ключ береться з ANTHROPIC_API_KEY; у коді його немає.

import Anthropic from '@anthropic-ai/sdk';
import { RECEIPT_SCHEMA, SYSTEM_PROMPT } from '../lib/schema.js';
import { build } from '../lib/pipeline.js';

const MODEL = process.env.AI_MODEL || 'claude-opus-5';
// Мислення рахується як вихідні токени, а вони вп'ятеро дорожчі за вхідні.
// Тому саме це — головний регулятор ціни одного чека, і його треба мати
// змогу покрутити, не чіпаючи код: high | medium | low.
const EFFORT = process.env.AI_EFFORT || 'high';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

let client;
/** Клієнт створюється ліниво, щоб модуль імпортувався без ключа. */
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

function fail(message, status) {
  return Object.assign(new Error(message), { status });
}

/** Розбирає data-URL у пару { mediaType, data }. */
function parseDataUrl(image) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(image || '');
  return m ? { mediaType: m[1], data: m[2] } : null;
}

/** Фото → сирий витяг. Єдине місце, де викликається модель. */
async function extract(image) {
  const parsed = parseDataUrl(image);
  if (!parsed) throw fail('bad_image', 400);

  const approxBytes = Math.floor((parsed.data.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) throw fail('image_too_large', 413);

  // Довгий чек дає десятки позицій, а на Opus 5 мислення увімкнене за
  // замовчуванням і теж рахується в max_tokens. Тому стрімимо: інакше
  // велика відповідь впирається в HTTP-таймаут.
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: parsed.mediaType,
              data: parsed.data,
            },
          },
          { type: 'text', text: 'Прочитай цей чек за схемою.' },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') throw fail('refused', 422);
  if (message.stop_reason === 'max_tokens') throw fail('truncated', 502);

  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw fail('empty_response', 502);

  return { raw: JSON.parse(text), usage: message.usage };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'method_not_allowed' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ ok: false, reason: 'no_key' });
      return;
    }

    const { raw, usage } = await extract(body?.image);
    const result = build(raw);
    result.usage = {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    };

    res.status(200).json(result);
  } catch (err) {
    // Клієнт має відрізняти «перезніміть фото» від «сервіс лежить»,
    // тому помилку не ковтаємо і не зводимо все до 500.
    res.status(err.status || 500).json({
      ok: false,
      reason: err.message || 'internal_error',
    });
  }
}

export { extract, parseDataUrl, MODEL };
