/* Збирає www/ для Capacitor: копіює веб-застосунок і налаштовує його під
   збірку для магазину. Веб-версія (Vercel) лишається недоторканою — усе,
   що з'являється нижче, живе тільки в нативній збірці.

   За замовчуванням збірка безкоштовна: усередині нічого не продається,
   підписку людина оформлює на сайті, а застосунок лише впускає її за
   вже сплаченим логіном. Так з платежу не йде комісія магазину, а гроші
   приходять від клієнта напряму.

   Ключ --sell повертає вбудовані покупки: тоді підключається міст до
   магазину, а прапорець безкоштовної збірки не ставиться. Знадобиться,
   коли продажі підуть через магазини. */
const fs = require('fs');
const path = require('path');

const {build} = require(path.join(__dirname, '..', '..', 'build.js'));

const APP = path.join(__dirname, '..', '..');          // trainer/
const NATIVE = path.join(__dirname, '..');             // trainer/native/
const WWW = path.join(NATIVE, 'www');
const SELL = process.argv.includes('--sell');

const FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg'];
/* Знімки онбордингу. Усередині застосунку мережі може не бути взагалі,
   тож вони їдуть у збірку разом із рештою. */
const DIRS = ['ob'];

fs.rmSync(WWW, {recursive: true, force: true});
fs.mkdirSync(WWW, {recursive: true});
FILES.forEach(f => fs.copyFileSync(path.join(APP, f), path.join(WWW, f)));
DIRS.forEach(d => fs.cpSync(path.join(APP, d), path.join(WWW, d), {recursive: true}));

const idx = path.join(WWW, 'index.html');
let html = fs.readFileSync(idx, 'utf8');

/* ─── збірка без інтернету ───
   Веб-версія тягне React і Babel з CDN: у браузері це нормально, бо
   сторінка й так із мережі, а далі все кешує service worker. Усередині
   застосунку так не можна. Магазинна збірка встановлюється з магазину й
   відкривається де завгодно — у залі без зв'язку теж, — а з CDN вона
   першого разу не запуститься зовсім: порожній екран замість застосунку.
   До того ж це три мегабайти чужого коду на кожен холодний старт.

   Тому JSX компілюємо тут-таки, тим самим build.js, що й для сайту, а
   React кладемо поруч із застосунком, із node_modules. Після цього в
   збірці не лишається жодного зовнішнього посилання. */
html = build(html);

const VENDOR = path.join(WWW, 'vendor');
fs.mkdirSync(VENDOR, {recursive: true});
/* Шлях будуємо від package.json, а не просимо Node знайти сам файл.
   React у своєму package.json перелічує, що з нього дозволено брати
   ззовні, і umd/ у тому переліку немає: пряме звернення до нього Node
   відхиляє, хоча файл лежить на місці. Спершу цього не було видно —
   перевіряв на заглушці, у якої такого переліку немає, і вона мовчки
   підтвердила те, чого насправді не працює. */
const umd = [
  ['react', 'umd/react.production.min.js', 'react.js'],
  ['react-dom', 'umd/react-dom.production.min.js', 'react-dom.js'],
];
umd.forEach(([pkg, from, to]) => {
  let root;
  try { root = path.dirname(require.resolve(pkg + '/package.json', {paths: [NATIVE]})); }
  catch { throw new Error('немає ' + pkg + ' у native/node_modules — виконайте npm install у trainer/native'); }
  const src = path.join(root, from);
  if (!fs.existsSync(src))
    throw new Error('у ' + pkg + ' немає ' + from + ' — потрібна саме 18-та версія, у новіших збірок UMD уже не буває');
  fs.copyFileSync(src, path.join(VENDOR, to));
});
html = html
  .replace(/<script crossorigin src="https:\/\/unpkg\.com\/react@18[^"]*"><\/script>/,
           '<script src="vendor/react.js"></script>')
  .replace(/<script crossorigin src="https:\/\/unpkg\.com\/react-dom@18[^"]*"><\/script>/,
           '<script src="vendor/react-dom.js"></script>');
if (/unpkg\.com/.test(html))
  throw new Error('у збірці лишилось посилання на CDN — застосунок не запуститься без мережі');

if (SELL) {
  fs.copyFileSync(path.join(NATIVE, 'iap-bridge.js'), path.join(WWW, 'iap-bridge.js'));
  if (!html.includes('iap-bridge.js')) {
    html = html.replace('</body>', '<script src="iap-bridge.js"></script>\n</body>');
  }
} else {
  /* Прапорець читає STORE.free() у застосунку: він прибирає покупку і,
     головне, всі посилання, які вели б на оплату. */
  html = html.replace('</body>', '<script>window.PRO_TRAINER_FREE = true;</script>\n</body>');
}

fs.writeFileSync(idx, html);
console.log('www/ готова:', FILES.length + umd.length + fs.readdirSync(path.join(WWW, 'ob')).length, 'файлів, без жодного зовнішнього посилання,',
  SELL ? 'вбудовані покупки увімкнено' : 'безкоштовна збірка: оплата на сайті');
