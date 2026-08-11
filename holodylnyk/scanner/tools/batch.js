/**
 * Прогін пачки справжніх чеків. Це та перевірка, без якої цифра
 * «90% точності» нічого не означає.
 *
 *   ANTHROPIC_API_KEY=sk-ant-… node tools/batch.js ./photos
 *
 * Розгорнутий ендпоінт не потрібен: тут ми звертаємось до моделі
 * напряму, тому для перевірки достатньо ключа й Node.
 *
 * Що вимірюється автоматично:
 *
 *   Сума зійшлася      сильний непрямий доказ, що числа прочитані вірно:
 *                      сума позицій дорівнює надрукованому підсумку.
 *   Словник знав       частка позицій, категорію яким дав словник, а не
 *                      модель. Це і є те, що росте з кожним чеком.
 *   Ціна чека          скільки коштує одне фото. Рахується з usage, який
 *                      повертає сам API, — не з прикидки.
 *
 * Що НЕ вимірюється автоматично: чи правильно прочитані назви. Для цього
 * потрібне око — тому в звіті є розділ для ручної звірки з фото.
 *
 * Модель, запасна модель і глибина мислення беруться з AI_MODEL,
 * AI_MODEL_FALLBACK та AI_EFFORT — щоб можна було прогнати ту саму пачку
 * кілька разів і порівняти точність із ціною:
 *
 *   node tools/batch.js ./photos                          сходинками
 *   AI_MODEL_FALLBACK= node tools/batch.js ./photos        тільки дешева
 *   AI_MODEL=claude-opus-5 AI_MODEL_FALLBACK= …            тільки дорога
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { read, MODEL, FALLBACK } from '../api/receipt.js';
import { tally, summarize, report, pct } from '../lib/batchstats.js';
import { money } from '../lib/cost.js';

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const MIME = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };

async function main() {
  const dir = process.argv[2];
  // Другий аргумент — куди покласти звіт. Потрібен, щоб прогнати ту саму
  // пачку в кількох режимах і не затерти попередній звіт наступним.
  const out = process.argv[3] || path.join(dir || '.', 'report.md');
  if (!dir) {
    console.error('вкажіть теку з фото:  node tools/batch.js ./photos [звіт.md]');
    return 1;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('немає ANTHROPIC_API_KEY');
    return 1;
  }

  const files = (await fs.readdir(dir))
    .filter((f) => EXT.has(path.extname(f).toLowerCase()))
    .sort();
  if (!files.length) {
    console.error(`у ${dir} немає зображень`);
    return 1;
  }

  const rows = [];
  const failed = [];
  for (const [k, file] of files.entries()) {
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) {
      failed.push({ name: file, error: `формат ${ext} модель не приймає — переведіть у jpeg` });
      continue;
    }
    process.stderr.write(`[${k + 1}/${files.length}] ${file} … `);
    try {
      const bytes = await fs.readFile(path.join(dir, file));
      const result = await read(`data:image/${MIME[ext]};base64,${bytes.toString('base64')}`);
      const row = tally(file, result, result.attempts);
      rows.push(row);
      const up = result.attempts.length > 1 ? ' · ескалація' : '';
      process.stderr.write(`${row.items} позицій · ${row.verdict}${up}\n`);
    } catch (e) {
      failed.push({ name: file, error: e.message });
      process.stderr.write(`помилка: ${e.message}\n`);
    }
  }

  const sum = summarize(rows);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, report(rows, sum, failed), 'utf8');

  console.log('');
  console.log(`Чеків: ${sum.receipts}, позицій: ${sum.positions}`);
  console.log(`Сума зійшлася: ${sum.sum_ok}/${sum.receipts}`);
  console.log(`Словник знав: ${sum.src.dictionary}/${sum.positions} (${pct(sum.dict_share)})`);
  console.log(`Нових слів для словника: ${sum.unknown_tokens.length}`);
  if (sum.spend) {
    console.log(`Ескалацій на ${FALLBACK}: ${sum.spend.escalated}/${sum.spend.receipts}`);
    console.log(`Один чек коштує: ${money(sum.spend.per_receipt_usd)}`);
    console.log(`Уся пачка: ${money(sum.spend.usd)}`);
  }
  console.log(`Звіт: ${out}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((c) => process.exit(c));
}
