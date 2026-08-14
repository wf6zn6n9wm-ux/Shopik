/* ──────────────────────────────────────────────────────────────────
   Складання версії для сайту: JSX компілюється тут, а не в браузері.

   index.html зручний тим, що це один файл: відкрив і працює. Плата за
   це — Babel, який тягнеться з CDN (2,7 МБ) і компілює застосунок при
   кожному відкритті. Через нього ж застосунок одного разу перестав
   запускатись зовсім: CDN віддав наступний мажор Babel, і на екрані
   лишилась біла сторінка.

   Тут ми компілюємо той самий скрипт заздалегідь — тим самим bun, яким
   це роблять тести. На виході той самий один файл, тільки:
     • без <script src="…/babel.min.js">
     • <script type="text/babel"> стає звичайним <script>
   React лишається з CDN: він маленький, стабільний і не компілює нічого.

     node trainer/build.js               → trainer/dist/index.html
     node trainer/build.js --in-place    перезаписати index.html (для викладки)
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const {transpile} = require('./tests/app.js');

const ROOT = __dirname;
const OPEN = 'data-presets="react">';

function build(html){
  const open = html.indexOf(OPEN);
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < 0) throw new Error('не знайшов <script type="text/babel"> в index.html');

  const head = html.slice(0, open);
  const code = html.slice(open + OPEN.length, close);
  const tail = html.slice(close);

  /* рядок «</script>» усередині коду обірвав би тег */
  const js = transpile(code).split('</script>').join('<\\/script>');

  /* Babel більше не потрібен — його тег прибираємо цілком */
  const noBabel = head.replace(/[ \t]*<!--[^]*?-->\s*\n?[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"><\/script>\n?/,
                               '')
                      .replace(/[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"><\/script>\n?/, '');
  if (noBabel.includes('@babel/standalone')) throw new Error('не вдалося прибрати тег Babel');

  /* <script type="text/babel" data-presets="react"> → <script> */
  const opened = noBabel.replace(/<script type="text\/babel" $/, '<script>');
  if (opened.endsWith(OPEN.slice(0, -1)) || /text\/babel/.test(opened.slice(-80)))
    throw new Error('не вдалося переписати тег скрипта');

  return opened + js + tail;
}

if (require.main === module){
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = build(src);
  const inPlace = process.argv.includes('--in-place');
  const file = inPlace ? path.join(ROOT, 'index.html') : path.join(ROOT, 'dist', 'index.html');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, out);
  const kb = n => Math.round(n / 1024) + ' КБ';
  console.log('зібрано: ' + kb(src.length) + ' → ' + kb(out.length) + '  ' + path.relative(process.cwd(), file));
  console.log('Babel більше не завантажується — мінус 2,7 МБ і компіляція на старті');
}

module.exports = {build};
