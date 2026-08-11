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
 *
 * Що НЕ вимірюється автоматично: чи правильно прочитані назви. Для цього
 * потрібне око — тому в звіті є розділ для ручної звірки з фото.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extract } from '../api/receipt.js';
import { build } from '../lib/pipeline.js';
import { tally, summarize, report, pct } from '../lib/batchstats.js';

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const MIME = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('вкажіть теку з фото:  node tools/batch.js ./photos');
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
      const raw = await extract(`data:image/${MIME[ext]};base64,${bytes.toString('base64')}`);
      const row = tally(file, build(raw));
      rows.push(row);
      process.stderr.write(`${row.items} позицій · ${row.verdict}\n`);
    } catch (e) {
      failed.push({ name: file, error: e.message });
      process.stderr.write(`помилка: ${e.message}\n`);
    }
  }

  const sum = summarize(rows);
  const out = path.join(dir, 'report.md');
  await fs.writeFile(out, report(rows, sum, failed), 'utf8');

  console.log('');
  console.log(`Чеків: ${sum.receipts}, позицій: ${sum.positions}`);
  console.log(`Сума зійшлася: ${sum.sum_ok}/${sum.receipts}`);
  console.log(`Словник знав: ${sum.src.dictionary}/${sum.positions} (${pct(sum.dict_share)})`);
  console.log(`Нових слів для словника: ${sum.unknown_tokens.length}`);
  console.log(`Звіт: ${out}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((c) => process.exit(c));
}
