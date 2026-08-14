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

const APP = path.join(__dirname, '..', '..');          // trainer/
const NATIVE = path.join(__dirname, '..');             // trainer/native/
const WWW = path.join(NATIVE, 'www');
const SELL = process.argv.includes('--sell');

const FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg'];

fs.rmSync(WWW, {recursive: true, force: true});
fs.mkdirSync(WWW, {recursive: true});
FILES.forEach(f => fs.copyFileSync(path.join(APP, f), path.join(WWW, f)));

const idx = path.join(WWW, 'index.html');
let html = fs.readFileSync(idx, 'utf8');

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
console.log('www/ готова:', FILES.length, 'файлів,',
  SELL ? 'вбудовані покупки увімкнено' : 'безкоштовна збірка: оплата на сайті');
