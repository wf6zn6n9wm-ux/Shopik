// Підрахунок по пачці чеків. Навмисно без жодної залежності від SDK:
// усе тут детерміноване й перевіряється офлайн, без ключа і без мережі.
import { firstToken } from './normalize.js';
import { costOfAttempts, money } from './cost.js';

/**
 * Один розібраний чек → рядок статистики. Чиста функція, тестується офлайн.
 *
 * @param {Array<{model:string,usage:object}>} [attempts] спроби моделей,
 *        якщо чек справді ганяли через API. Їх може бути дві: дешева
 *        модель і ескалація на дорогу.
 */
function tally(name, result, attempts) {
  const items = result.items || [];
  const by = { dictionary: 0, model: 0, unknown: 0 };
  for (const i of items) by[i.category_source] = (by[i.category_source] || 0) + 1;
  const v = result.validation || {};
  return {
    name,
    store: (result.store && result.store.name) || '',
    date: (result.receipt && result.receipt.date) || '',
    total: (result.receipt && result.receipt.total) || 0,
    verdict: v.verdict || 'ok',
    sum_ok: !!(v.sum && v.sum.ok),
    lines: (result.stats && result.stats.lines_read) || 0,
    items: items.length,
    skipped: (result.skipped || []).length,
    by,
    attempts: attempts && attempts.length ? attempts : null,
    // Позиції, яких не знає словник — саме вони поповнять його наступними.
    unknown_tokens: items
      .filter((i) => i.category_source !== 'dictionary')
      .map((i) => ({ token: firstToken(i.raw), raw: i.raw, guess: i.category })),
    names: items.map((i) => i.name),
  };
}

/**
 * Скільки коштувала пачка. Рахується лише по тих чеках, де є спроби:
 * порахувати середнє по половині вибірки — гірше, ніж не рахувати.
 *
 * Окремо рахується, скільки чеків довелося перечитувати дорогою моделлю.
 * Саме ця частка й вирішує, скільки коштує сходинкова схема: якщо дешева
 * модель справляється з дев'ятьма чеками з десяти — ви платите майже
 * дешеву ціну за майже дорогу якість.
 */
function spend(rows) {
  const priced = rows.filter((r) => r.attempts);
  if (!priced.length) return null;
  const total = { usd: 0, uah: 0, in: 0, out: 0 };
  const byModel = new Map();
  let escalated = 0;
  let counted = 0;

  for (const r of priced) {
    const c = costOfAttempts(r.attempts);
    if (!c) continue;
    counted += 1;
    total.usd += c.usd;
    total.uah += c.uah;
    total.in += c.in;
    total.out += c.out;
    if (r.attempts.length > 1) escalated += 1;
    for (const a of r.attempts) {
      const cur = byModel.get(a.model) || { calls: 0, usd: 0 };
      cur.calls += 1;
      cur.usd += costOfAttempts([a])?.usd || 0;
      byModel.set(a.model, cur);
    }
  }
  if (!counted) return null;

  return {
    receipts: counted,
    escalated,
    escalation_share: escalated / counted,
    ...total,
    per_receipt_usd: total.usd / counted,
    in_per_receipt: Math.round(total.in / counted),
    out_per_receipt: Math.round(total.out / counted),
    by_model: [...byModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.usd - a.usd),
  };
}

/** Підсумок по всій пачці. Теж чиста функція. */
function summarize(rows) {
  const n = rows.length;
  const src = rows.reduce(
    (a, r) => ({
      dictionary: a.dictionary + (r.by.dictionary || 0),
      model: a.model + (r.by.model || 0),
      unknown: a.unknown + (r.by.unknown || 0),
    }),
    { dictionary: 0, model: 0, unknown: 0 },
  );
  const positions = src.dictionary + src.model + src.unknown;
  const tokens = new Map();
  for (const r of rows) {
    for (const u of r.unknown_tokens) {
      if (!u.token) continue;
      const cur = tokens.get(u.token) || { count: 0, examples: [], guess: u.guess };
      cur.count += 1;
      if (cur.examples.length < 3) cur.examples.push(u.raw);
      tokens.set(u.token, cur);
    }
  }
  return {
    receipts: n,
    sum_ok: rows.filter((r) => r.sum_ok).length,
    verdicts: {
      ok: rows.filter((r) => r.verdict === 'ok').length,
      partial: rows.filter((r) => r.verdict === 'partial').length,
      reshoot: rows.filter((r) => r.verdict === 'reshoot').length,
    },
    positions,
    src,
    dict_share: positions ? src.dictionary / positions : 0,
    spend: spend(rows),
    unknown_tokens: [...tokens.entries()]
      .map(([token, v]) => ({ token, ...v }))
      .sort((a, b) => b.count - a.count),
  };
}

function pct(x) {
  return (x * 100).toFixed(0) + '%';
}

function report(rows, sum, failed) {
  const L = [];
  L.push('# Прогін чеків\n');
  L.push(`Чеків оброблено: **${sum.receipts}**` + (failed.length ? ` · не вдалося: ${failed.length}` : ''));
  L.push(`Позицій розпізнано: **${sum.positions}**\n`);

  L.push('## Числа прочитані вірно\n');
  L.push('Сума позицій зійшлася з надрукованим підсумком — це найсильніше,');
  L.push('що можна перевірити без ручної звірки.\n');
  L.push(`- Зійшлося: **${sum.sum_ok} з ${sum.receipts}** (${pct(sum.receipts ? sum.sum_ok / sum.receipts : 0)})`);
  L.push(`- Вердикти: ok ${sum.verdicts.ok} · partial ${sum.verdicts.partial} · reshoot ${sum.verdicts.reshoot}\n`);

  L.push('## Словник\n');
  L.push(`- Категорію дав словник: **${sum.src.dictionary} з ${sum.positions}** (${pct(sum.dict_share)})`);
  L.push(`- Довелося питати модель: ${sum.src.model}`);
  L.push(`- Не визначено взагалі: ${sum.src.unknown}\n`);

  if (sum.unknown_tokens.length) {
    L.push('## Слова, яких немає у словнику\n');
    L.push('Кожен рядок — кандидат у `lib/dictionary.js`. Відсортовано за частотою.\n');
    L.push('| Перше слово | Разів | Приклад із чека | Здогад моделі |');
    L.push('|---|--:|---|---|');
    for (const t of sum.unknown_tokens) {
      L.push(`| \`${t.token}\` | ${t.count} | ${t.examples[0] || ''} | ${t.guess || '—'} |`);
    }
    L.push('');
  }

  if (sum.spend) {
    const s = sum.spend;
    L.push('## Скільки це коштує\n');
    L.push(`Порахували по ${s.receipts} чеках, з реального \`usage\` від API.\n`);
    L.push(`- **Один чек: ${money(s.per_receipt_usd)}**`);
    L.push(`- Токенів на чек: ${s.in_per_receipt} вхідних, ${s.out_per_receipt} вихідних`);
    L.push(`- Уся пачка: ${money(s.usd)}\n`);

    L.push('| Модель | Викликів | Витрачено |');
    L.push('|---|--:|--:|');
    for (const m of s.by_model) L.push(`| \`${m.model}\` | ${m.calls} | ${money(m.usd)} |`);
    L.push('');
    L.push(
      `Дешева модель не впоралась і довелося перечитувати дорогою: ` +
        `**${s.escalated} з ${s.receipts}** (${pct(s.escalation_share)}). ` +
        `Саме ця частка й визначає ціну — чим більший словник і чим кращі ` +
        `фото, тим вона нижча.\n`,
    );

    L.push('Прикидка на місяць, якщо людина фотографує 6 чеків:\n');
    L.push('| Активних людей | За місяць |');
    L.push('|--:|--:|');
    for (const users of [100, 1000, 10000]) {
      L.push(`| ${users} | ${money(s.per_receipt_usd * 6 * users)} |`);
    }
    L.push('');
    L.push('Вихідні токени дорожчі за вхідні вп\'ятеро, і «мислення» рахується');
    L.push('саме як вихід. Якщо цифра завелика — перший важіль `AI_EFFORT`,');
    L.push('другий `AI_MODEL`, і лише третій — стискати фото.\n');
  }

  L.push('## Для ручної звірки\n');
  L.push('Автоматично перевірити, чи вірно прочитані **назви**, неможливо —');
  L.push('порівняйте кілька чеків із фото очима.\n');
  for (const r of rows) {
    L.push(`### ${r.name}`);
    L.push(`${r.store || 'магазин не видно'} · ${r.date || 'дата не видна'} · ${r.total} ₴ · ${r.verdict}`);
    L.push(r.names.map((x) => `- ${x}`).join('\n') || '- (нічого)');
    L.push('');
  }

  if (failed.length) {
    L.push('## Не вдалося\n');
    for (const f of failed) L.push(`- **${f.name}** — ${f.error}`);
  }
  return L.join('\n');
}

export { tally, summarize, spend, report, pct };
