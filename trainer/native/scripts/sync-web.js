/* Збирає www/ для Capacitor: копіює веб-застосунок і підключає міст до
   магазину. Веб-версія (Vercel) лишається недоторканою — тег <script>
   з'являється лише в нативній збірці. */
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..');          // trainer/
const NATIVE = path.join(__dirname, '..');             // trainer/native/
const WWW = path.join(NATIVE, 'www');

const FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg'];

fs.rmSync(WWW, {recursive: true, force: true});
fs.mkdirSync(WWW, {recursive: true});
FILES.forEach(f => fs.copyFileSync(path.join(APP, f), path.join(WWW, f)));
fs.copyFileSync(path.join(NATIVE, 'iap-bridge.js'), path.join(WWW, 'iap-bridge.js'));

const idx = path.join(WWW, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
if (!html.includes('iap-bridge.js')) {
  html = html.replace('</body>', '<script src="iap-bridge.js"></script>\n</body>');
  fs.writeFileSync(idx, html);
}
console.log('www/ готова:', FILES.length + 1, 'файлів, міст до магазину підключено');
