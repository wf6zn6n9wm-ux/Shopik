// Скільки коштує один чек.
//
// Ціни — прайс Anthropic API, долари за 1 000 000 токенів, станом на
// 2026-06-24. Вони змінюються: перед тим як будувати на цих числах
// бізнес-модель, звіртеся з anthropic.com/pricing.
//
// Важливе, що легко проґавити: токени «мислення» рахуються як ВИХІДНІ.
// На Opus 5 мислення увімкнене за замовчуванням, тому вихід — а не
// картинка — зазвичай і є основна стаття витрат.

const PRICES = {
  'claude-fable-5': { in: 10, out: 50 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  // Sonnet 5 до 2026-08-31 має вступну ціну $2/$10. Тут стоїть повна:
  // краще порахувати дорожче, ніж потім здивуватися.
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

// Курс приблизний і навмисно винесений назовні: UAH_PER_USD=41.5 node …
const UAH_PER_USD = Number(process.env.UAH_PER_USD) || 42;

/** Модель → ціна. Невідома модель — не привід тихо порахувати нуль. */
function priceOf(model) {
  return PRICES[model] || null;
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
  const usd =
    ((fresh + written * 1.25 + read * 0.1) * p.in + out * p.out) / 1e6;
  return { usd, uah: usd * UAH_PER_USD, in: fresh + written + read, out };
}

function money(usd) {
  return `$${usd.toFixed(4)} (${(usd * UAH_PER_USD).toFixed(2)} ₴)`;
}

export { PRICES, UAH_PER_USD, priceOf, costOf, money };
