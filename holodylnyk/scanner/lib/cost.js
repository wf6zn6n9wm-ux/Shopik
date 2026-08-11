// Скільки коштує один чек — і чим саме моделі відрізняються.
//
// Ціни: долари за 1 000 000 токенів, станом на 2026-06-24. Вони
// змінюються; перед тим як будувати на них бізнес-модель, звіртеся
// з anthropic.com/pricing.
//
// Важливе, що легко проґавити: токени «мислення» рахуються як ВИХІДНІ,
// а вихідні дорожчі за вхідні вп'ятеро. Тому головна стаття витрат —
// не картинка, а те, скільки модель думала. Звідси й поле `thinking`:
//
//   'adaptive'  мислення увімкнене за замовчуванням (Opus 4.6+, Sonnet 4.6+).
//               Глибина керується `effort`, і це головний регулятор ціни.
//   'off'       моделі до 4.6 не думають, якщо не попросити. Найдешевший
//               режим не треба вмикати — він і є типовий.
//
// `effort` розуміють не всі моделі: відправити його туди, де його немає,
// означає отримати 400 замість чека. Тому прапорець, а не здогад.

const MODELS = {
  'claude-fable-5': { in: 10, out: 50, effort: true, thinking: 'adaptive' },
  'claude-opus-5': { in: 5, out: 25, effort: true, thinking: 'adaptive' },
  'claude-opus-4-8': { in: 5, out: 25, effort: true, thinking: 'adaptive' },
  'claude-opus-4-7': { in: 5, out: 25, effort: true, thinking: 'adaptive' },
  'claude-opus-4-6': { in: 5, out: 25, effort: true, thinking: 'adaptive' },
  // Sonnet 5 до 2026-08-31 має вступну ціну $2/$10. Тут стоїть повна:
  // краще порахувати дорожче, ніж потім здивуватися рахунку.
  'claude-sonnet-5': { in: 3, out: 15, effort: true, thinking: 'adaptive' },
  'claude-sonnet-4-6': { in: 3, out: 15, effort: true, thinking: 'adaptive' },
  'claude-haiku-4-5': { in: 1, out: 5, effort: false, thinking: 'off' },
};

// Курс приблизний і навмисно винесений назовні: UAH_PER_USD=41.5 node …
const UAH_PER_USD = Number(process.env.UAH_PER_USD) || 42;

/** Модель → її властивості. Невідома модель — не привід тихо порахувати нуль. */
function modelInfo(model) {
  return MODELS[model] || null;
}

function priceOf(model) {
  return MODELS[model] || null;
}

/**
 * usage від API → гроші. Кешовані токени рахуються за своїми ставками:
 * запис 1.25×, читання 0.1× від вхідної ціни.
 *
 * @returns {{usd:number, uah:number, in:number, out:number}|null}
 */
function costOf(usage, model) {
  const p = priceOf(model);
  if (!p || !usage) return null;
  const fresh = usage.input_tokens || 0;
  const written = usage.cache_creation_input_tokens || 0;
  const read = usage.cache_read_input_tokens || 0;
  const out = usage.output_tokens || 0;
  const usd = ((fresh + written * 1.25 + read * 0.1) * p.in + out * p.out) / 1e6;
  return { usd, uah: usd * UAH_PER_USD, in: fresh + written + read, out };
}

/**
 * Один чек може коштувати двох викликів: дешева модель, а за нею дорога,
 * якщо чек не зійшовся. Тому ціна рахується по всіх спробах, і кожна —
 * за ціною своєї моделі.
 *
 * @param {Array<{model:string, usage:object}>} attempts
 */
function costOfAttempts(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return null;
  const total = { usd: 0, uah: 0, in: 0, out: 0 };
  let counted = 0;
  for (const a of attempts) {
    const c = costOf(a.usage, a.model);
    if (!c) continue;
    total.usd += c.usd;
    total.uah += c.uah;
    total.in += c.in;
    total.out += c.out;
    counted += 1;
  }
  return counted ? total : null;
}

function money(usd) {
  return `$${usd.toFixed(4)} (${(usd * UAH_PER_USD).toFixed(2)} ₴)`;
}

export { MODELS, UAH_PER_USD, modelInfo, priceOf, costOf, costOfAttempts, money };
