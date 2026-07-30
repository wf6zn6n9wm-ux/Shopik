// Общий раннер. Полный прогон перед релизом:
//
//   node tests/run.mjs
//
// Без Chromium (только серверная часть):
//
//   node tests/run.mjs --node-only
//
// Код выхода 1, если упал хотя бы один набор — годится для CI как есть.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from './browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Браузерные наборы держат каждый свой порт отладчика, но гоняем их всё равно
// по очереди: параллельный headless-Chromium на слабой машине даёт таймауты,
// которые читаются как «тест упал», хотя упало окружение.
const SUITES = [
  { file: 'contract.js',      kind: 'node',    about: 'имена полей: сервер ↔ клиент' },
  { file: 'adm_test.js',      kind: 'node',    about: 'админка: права, выдача, PVP-изоляция' },
  { file: 'star_games.js',    kind: 'node',    about: 'ставки, RTP рулетки, статистика' },
  { file: 'cases.js',         kind: 'node',    about: 'кейсы: маржа, оплата, provably-fair' },
  { file: 'ref_revenue.js',   kind: 'node',    about: 'реферальные начисления и идемпотентность' },
  { file: 'pvp_stuck.js',     kind: 'node',    about: 'застрявшие PVP-раунды и добивка из cron' },
  { file: 'gifts_inv.js',     kind: 'node',    about: 'инвентарь подарков и очередь выдачи' },
  { file: 'claims.js',        kind: 'node',    about: 'заявки на выигрыш и задания' },
  { file: 'i18n_check.js',    kind: 'node',    about: 'полнота локализации uk/ru/en' },
  { file: 'boot_check.mjs',   kind: 'browser', about: 'ошибки времени выполнения на всех экранах' },
  { file: 'gifts_client.mjs', kind: 'browser', about: 'рендер инвентаря в DOM' },
  { file: 'e8_client.mjs',    kind: 'browser', about: 'интерфейс, заявки, запретный словарь' }
];

const nodeOnly = process.argv.includes('--node-only');
const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');

let browserReason = '';
if (!nodeOnly) {
  try { chromiumPath(); } catch (e) { browserReason = e.message; }
}

function runOne(suite) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(HERE, suite.file)], { cwd: HERE });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
const results = [];

for (const s of SUITES) {
  if (s.kind === 'browser' && (nodeOnly || browserReason)) {
    console.log('  ⊘ ' + pad(s.file, 18) + 'пропущен — ' + (nodeOnly ? 'запрошен --node-only' : 'нет Chromium'));
    results.push({ ...s, skipped: true });
    continue;
  }
  // Печатаем строку одну — целиком и после завершения. Прогресс через \r
  // выглядит нормально только в терминале, а в логе CI оставляет мусор.
  const { code, out } = await runOne(s);
  const last = out.trim().split('\n').filter(Boolean).pop() || '';
  console.log((code === 0 ? '  ✓ ' : '  ✗ ') + pad(s.file, 18) + last);
  if (code !== 0 || verbose) console.log(out.split('\n').map((l) => '      ' + l).join('\n'));
  results.push({ ...s, code });
}

const failed = results.filter((r) => !r.skipped && r.code !== 0);
const skipped = results.filter((r) => r.skipped);
const passed = results.filter((r) => !r.skipped && r.code === 0);

console.log('');
console.log('  пройдено: ' + passed.length + ', провалено: ' + failed.length + ', пропущено: ' + skipped.length);
if (browserReason && !nodeOnly) console.log('  ' + browserReason);
if (skipped.length && !failed.length) {
  console.log('  ВНИМАНИЕ: браузерные наборы не запускались — это не полный прогон.');
}
process.exit(failed.length ? 1 : 0);
