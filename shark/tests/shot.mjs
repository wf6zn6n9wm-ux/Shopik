// Скриншоты экранов Shark через CDP — инструмент, а не тест.
//
//   SCENES='[["home","(()=>{go(\'home\');return 1})()"]]' node tests/shot.mjs out/
//
// Каждая сцена — пара [имя файла, JS-выражение, которое приводит приложение в
// нужное состояние]. Анимации глушим, чтобы снимок был воспроизводимым.
import { writeFileSync, mkdirSync } from 'node:fs';
import { openApp, wait } from './browser.mjs';

const OUT = process.argv[2] || '.';
mkdirSync(OUT, { recursive: true });

const { cmd, close } = await openApp({
  port: Number(process.env.SHOT_PORT) || 9333,
  settle: 1400,
  extraArgs: ['--force-device-scale-factor=2']
});

await cmd('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

const evalJs = async (expr) =>
  (await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;

// анимации мешают детерминизму снимка
await evalJs(`(()=>{const s=document.createElement('style');s.textContent='*{transition-duration:0s!important;animation-duration:0s!important}';document.head.appendChild(s);})()`);

async function shot(name, setup) {
  const r = await evalJs(setup);
  if (r && r.subtype === 'error') { console.log('JS ERROR в ' + name + ': ' + r.description); }
  await wait(350);
  const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('  → ' + name + '.png');
}

const scenes = JSON.parse(process.env.SCENES || '[]');
for (const [name, setup] of scenes) await shot(name, setup);

// диагностика: собрать метрики после последней сцены
if (process.env.PROBE) {
  const r = await evalJs(process.env.PROBE);
  console.log(JSON.stringify(r.value, null, 1));
}
close();
process.exit(0);
