/* Запускает все проверки по очереди и печатает сводку.
   Каждая проверка — отдельный процесс: падение одной не уносит остальные.

   node tests/run.js            — все
   node tests/run.js hero money — только названные */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ВСЕ = ['source', 'layout', 'smoke', 'state', 'money', 'games', 'economy',
             'hero', 'bonus', 'referral', 'daily', 'fee', 'crash', 'avatar', 'server',
             'withdraw'];

const выбор = process.argv.slice(2);
const список = выбор.length ? выбор : ВСЕ;

const итоги = [];
for (const имя of список) {
  const файл = path.join(__dirname, имя + '.js');
  if (!fs.existsSync(файл)) { console.log('нет такой проверки: ' + имя); итоги.push([имя, null]); continue; }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [файл], { stdio: 'inherit' });
  итоги.push([имя, r.status === 0, Math.round((Date.now() - t0) / 1000)]);
}

console.log('\n══════════ сводка ══════════');
let плохо = 0;
for (const [имя, ок, сек] of итоги) {
  if (ок === null) { console.log('  ? ' + имя + ' — не найдена'); плохо++; continue; }
  console.log('  ' + (ок ? '✓' : '✗') + ' ' + имя.padEnd(9) + (сек !== undefined ? сек + ' с' : ''));
  if (!ок) плохо++;
}
console.log(плохо ? '\n' + плохо + ' из ' + итоги.length + ' с замечаниями' : '\nвсё чисто');
process.exit(плохо ? 1 : 0);
