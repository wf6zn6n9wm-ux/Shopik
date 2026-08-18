/* ──────────────────────────────────────────────────────────────────
   Іконки й обкладинка для магазинів.

   У застосунку іконка векторна (icon.svg), а магазини приймають лише
   растр і рівно в своїх розмірах. Малюємо їх з того самого вихідника,
   щоб іконка на сайті, в застосунку й у магазині не розповзлись.

   Кути не заокруглюємо: і App Store, і Google Play накладають маску
   самі, а якщо принести вже заокруглену — обріжуть удруге й вийде
   рамка. Прозорості теж не лишаємо, Apple її не приймає.

     node trainer/store/icons.js

   Результат — trainer/store/out/icons/
     app-store-1024.png     іконка App Store
     play-512.png           іконка Google Play
     play-feature-1024x500.png   обкладинка Google Play
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const png = require('./png.js');

/* верстка в headless на стільки пікселів нижча за вікно */
const GAP = 87;

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'icons');
const PORT = 8757;

const CHROME = process.env.CHROME || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!CHROME){ console.error('не знайшов Chrome — вкажіть CHROME=/шлях/до/chrome'); process.exit(1); }

const ACCENT_1 = '#8B6BFF';
const ACCENT_2 = '#5636E8';
const BG = '#08080b';        /* --bg застосунку й backgroundColor у capacitor.config.json */

/* сама позначка: та сама гантель, що в icon.svg */
const mark = (size, stroke) => `
<svg viewBox="0 0 192 192" width="${size}" height="${size}">
  <g fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round">
    <path d="M40 76v40M62 66v60M130 66v60M152 76v40M62 96h68"/>
  </g>
</svg>`;

const iconPage = size => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#fff;}
  .i{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
     background:linear-gradient(135deg,${ACCENT_1},${ACCENT_2});}
  svg{display:block;}
</style>
<div class="i">${mark(Math.round(size * 0.62), 11)}</div>`;

/* обкладинка: назва читається з мініатюри, тому крупно й коротко */
const featurePage = (w, h) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;}
  .c{width:${w}px;height:${h}px;display:flex;align-items:center;gap:${Math.round(w * 0.05)}px;
     padding:0 ${Math.round(w * 0.07)}px;box-sizing:border-box;
     background:linear-gradient(135deg,${ACCENT_1},${ACCENT_2});
     font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;}
  .badge{width:${Math.round(h * 0.42)}px;height:${Math.round(h * 0.42)}px;flex:none;
     border-radius:${Math.round(h * 0.1)}px;background:rgba(255,255,255,.14);
     display:flex;align-items:center;justify-content:center;}
  .t b{display:block;font-size:${Math.round(h * 0.155)}px;font-weight:800;letter-spacing:-.02em;}
  .t span{display:block;margin-top:${Math.round(h * 0.03)}px;
     font-size:${Math.round(h * 0.072)}px;font-weight:600;opacity:.92;line-height:1.3;}
</style>
<div class="c">
  <div class="badge">${mark(Math.round(h * 0.26), 13)}</div>
  <div class="t"><b>PRO Trainer</b><span>Клієнти, розклад і гроші —<br>в одному місці</span></div>
</div>`;

/* Заставка на час запуску нативної збірки. Тло те саме, що в
   capacitor.config.json: інакше на дотику блимне чужий колір, а це
   перше, що людина бачить після значка на екрані. */
const splashPage = size => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:${BG};}
  .s{width:${size}px;height:${size}px;background:${BG};
     display:flex;align-items:center;justify-content:center;}
  .b{width:${Math.round(size * 0.22)}px;height:${Math.round(size * 0.22)}px;
     border-radius:${Math.round(size * 0.05)}px;
     background:linear-gradient(135deg,${ACCENT_1},${ACCENT_2});
     display:flex;align-items:center;justify-content:center;}
  svg{display:block;}
</style>
<div class="s"><div class="b">${mark(Math.round(size * 0.14), 11)}</div></div>`;

/* Знімаємо вікном на GAP вищим, ніж треба, і відрізаємо низ: інакше
   верстка не дотягнеться до потрібної висоти й знизу лишиться біла
   смуга, а іконці потрібен точний розмір. */
const shot = (file, page, w, h) => {
  fs.writeFileSync(path.join(ROOT, '_icon.html'), page);
  spawnSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--window-size=' + w + ',' + (h + GAP), '--force-device-scale-factor=1',
    '--virtual-time-budget=4000', '--screenshot=' + file,
    'http://127.0.0.1:' + PORT + '/_icon.html'], {encoding: 'utf8'});
  fs.unlinkSync(path.join(ROOT, '_icon.html'));
  if (fs.existsSync(file)) png.crop(file, w, h);
};

const pngSize = file => { const s = png.size(file); return s.w + '×' + s.h; };

const srv = spawnSync('sh', ['-c',
  'python3 -m http.server ' + PORT + ' --bind 127.0.0.1 --directory ' + ROOT + ' >/dev/null 2>&1 & echo $!'],
  {encoding: 'utf8'});
const pid = (srv.stdout || '').trim();
spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},800)']);

fs.mkdirSync(OUT, {recursive: true});
const jobs = [
  ['app-store-1024.png', iconPage(1024), 1024, 1024],
  ['play-512.png', iconPage(512), 512, 512],
  ['play-feature-1024x500.png', featurePage(1024, 500), 1024, 500],
  ['splash-2732.png', splashPage(2732), 2732, 2732],
];

/* Ці два файли лягають у репозиторій, а не лишаються в out/. Складальна
   машина Apple — це macOS без Chrome, намалювати їх там нічим; а без
   іконки застосунок їде в TestFlight із синім хрестиком Capacitor, і
   таку збірку Apple відхиляє. Тому картинки готуються тут і зберігаються
   готовими. */
const NATIVE = path.join(__dirname, '..', 'native', 'assets');
const COPY = [['app-store-1024.png', 'icon.png'], ['splash-2732.png', 'splash.png']];
let bad = 0;
try {
  for (const [name, page, w, h] of jobs){
    const file = path.join(OUT, name);
    shot(file, page, w, h);
    if (fs.existsSync(file)) console.log('  ✓ ' + name + ' — ' + pngSize(file));
    else { console.log('  ✗ ' + name); bad++; }
  }
} finally {
  if (pid) spawnSync('kill', [pid]);
}
if (!bad){
  fs.mkdirSync(NATIVE, {recursive: true});
  for (const [from, to] of COPY){
    fs.copyFileSync(path.join(OUT, from), path.join(NATIVE, to));
    console.log('  ✓ native/assets/' + to + ' — ' + pngSize(path.join(NATIVE, to)));
  }
}
console.log('\n' + (bad ? 'не вийшло: ' + bad : 'готово, ' + jobs.length + ' файли у store/out/icons'));
process.exit(bad ? 1 : 0);
