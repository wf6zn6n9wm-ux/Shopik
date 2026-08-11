// POST /api/receipt
//
// Вхід:  { image: "data:image/jpeg;base64,..." }
// Вихід: позиції з нормалізованими назвами, категоріями й термінами
//        придатності — плюс чесний вердикт, чи зійшовся чек.
//
// Ключ береться з ANTHROPIC_API_KEY; у коді його немає.

import { RECEIPT_SCHEMA, SYSTEM_PROMPT } from '../lib/schema.js';
import { build } from '../lib/pipeline.js';
import { modelInfo } from '../lib/cost.js';

// Дешева модель читає чек першою. Дорога вмикається лише тоді, коли
// дешева не впоралась — а це видно з самого чека: сума позицій не
// зійшлася з надрукованим підсумком. Платимо за розум тільки там, де
// його справді забракло.
const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
// Саме `??`, а не `||`: порожнє значення має вимикати другу сходинку,
// а не мовчки повертати її ж за замовчуванням. З `||` команда
// `AI_MODEL_FALLBACK= node …` робила б рівно протилежне обіцяному.
const FALLBACK = process.env.AI_MODEL_FALLBACK ?? 'claude-opus-5';
// Мислення рахується як вихідні токени, а вони вп'ятеро дорожчі за вхідні.
// Тому саме це — головний регулятор ціни: high | medium | low.
const EFFORT = process.env.AI_EFFORT || 'medium';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

let client;

/**
 * Клієнт створюється ліниво, і SDK підвантажується теж ліниво — щоб цей
 * модуль можна було імпортувати без ключа, без мережі й без node_modules.
 * Інакше сходинки з дешевої моделі на дорогу довелося б перевіряти по
 * тексту файлу, а це не перевірка.
 */
async function getClient() {
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic();
  }
  return client;
}

/** Підмінити клієнта. Потрібно тестам; у роботі не викликається. */
function setClient(c) {
  client = c;
}

function fail(message, status) {
  return Object.assign(new Error(message), { status });
}

/** Розбирає data-URL у пару { mediaType, data }. */
function parseDataUrl(image) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(image || '');
  return m ? { mediaType: m[1], data: m[2] } : null;
}

/** Фото → сирий витяг однією моделлю. Єдине місце, де викликається модель. */
async function extract(image, model = MODEL) {
  const parsed = parseDataUrl(image);
  if (!parsed) throw fail('bad_image', 400);

  const approxBytes = Math.floor((parsed.data.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) throw fail('image_too_large', 413);

  // `effort` розуміють не всі моделі. Відправити його туди, де його
  // немає, — це 400 замість чека, тому питаємо таблицю, а не здогад.
  const output_config = {
    format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
  };
  if (modelInfo(model)?.effort) output_config.effort = EFFORT;

  // Довгий чек дає десятки позицій, а на моделях 4.6+ мислення увімкнене
  // за замовчуванням і теж рахується в max_tokens. Тому стрімимо: інакше
  // велика відповідь впирається в HTTP-таймаут.
  const stream = (await getClient()).messages.stream({
    model,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    output_config,
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

  return { raw: JSON.parse(text), usage: message.usage, model };
}

/**
 * Фото → готовий чек, за найменші гроші, які дають правильний результат.
 *
 * Сходинка перша — дешева модель. Якщо чек зійшовся сам із собою (сума
 * позицій дорівнює надрукованому підсумку, ПДВ відповідає ставці), то
 * платити за дорогу нема за що: числа вже правильні, і це доведено
 * самим папером, а не довірою до моделі.
 *
 * Сходинка друга вмикається лише на `partial`. На `reshoot` її немає
 * навмисно: чек обрізаний або розмитий фізично, і дорога модель побачить
 * рівно те саме — це були б викинуті гроші.
 */
async function read(image) {
  const first = await extract(image, MODEL);
  const attempts = [{ model: first.model, usage: first.usage }];
  const result = build(first.raw);

  if (result.validation.verdict === 'partial' && FALLBACK && FALLBACK !== MODEL) {
    try {
      const second = await extract(image, FALLBACK);
      attempts.push({ model: second.model, usage: second.usage });
      const better = build(second.raw);
      // Другу спробу беремо, лише якщо вона справді краща. Інакше
      // ескалація здатна погіршити результат, ще й за ваші гроші.
      if (better.validation.verdict === 'ok') {
        better.attempts = attempts;
        return better;
      }
    } catch {
      // Дорога модель упала — у нас уже є відповідь від дешевої.
      // Віддати чек із чесним «перевірте» краще, ніж 500.
    }
  }

  result.attempts = attempts;
  return result;
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

    res.status(200).json(await read(body?.image));
  } catch (err) {
    // Клієнт має відрізняти «перезніміть фото» від «сервіс лежить»,
    // тому помилку не ковтаємо і не зводимо все до 500.
    res.status(err.status || 500).json({
      ok: false,
      reason: err.message || 'internal_error',
    });
  }
}

export { extract, read, parseDataUrl, setClient, MODEL, FALLBACK };
