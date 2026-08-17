/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · знімки застосунку для онбордингу

   Навіщо. Перші три екрани показували намальовані іконки: прямокутники,
   що натякають на застосунок. Тренер, який відкрив сайт, написав прямо:
   «Хочу одразу побачити, як виглядає програма, а не уявляти». Він має
   рацію — намальований натяк нічого не доводить.

   Беремо справжні екрани. Ті самі сторінки, з яких робляться знімки для
   магазинів (store/prerender.js), тільки знімаємо їх меншими: в
   онбордингу картинка живе в невеликому полі, і зайві пікселі — це лише
   зайві кілобайти на першому відкритті сайту.

   Мова одна, українська. Знімки чотирма мовами важили б під мегабайт, а
   тренер дивиться на устрій застосунку, а не читає написи на картинці.

   Висота вікна навмисно однакова для всіх трьох і невелика: нижня
   панель у застосунку прикріплена до низу екрана, тож вона опиняється
   внизу кадру за будь-якої висоти — кадр виходить схожим на повний
   екран телефона, а не на обрізок. Нижче — тільки порожнє поле, і
   тримати його в картинці означає платити кілобайтами за ніщо.

     node trainer/store/onboard.js
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const HERE = __dirname;
const PRE = path.join(HERE, 'out', 'pre');
const OUT = path.join(HERE, '..', 'ob');

/* 540 — щоб оболонка застосунку (480px) вмістилась цілком із полями.
   Півтори — розумний компроміс: на екрані картинка вдвічі менша, тож
   різкості вистачає, а вага лишається в межах сотні кілобайтів. */
const W = 540, H = 430, DSF = 1.5;
const LANG = 'uk';

/* Який екран під яким слайдом. Порядок той самий, що в застосунку. */
const SLIDES = [
  ['home',    'ob-1.png'],
  ['client',  'ob-2.png'],
  ['finance', 'ob-3.png'],
];

const CHROME = process.env.CHROME || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });

if (!CHROME){ console.error('не знайшов Chrome — вкажіть CHROME=/шлях/до/chrome'); process.exit(1); }

/* Сторінки готує prerender: він малює екрани застосунку з коду, без
   браузера й без кліків. Якщо їх ще немає — робимо зараз. */
if (!fs.existsSync(path.join(PRE, LANG + '-home.html'))){
  console.log('спершу малюю сторінки…');
  spawnSync(process.execPath, [path.join(HERE, 'prerender.js'), LANG], {stdio: 'inherit'});
}

fs.mkdirSync(OUT, {recursive: true});

SLIDES.forEach(([screen, file]) => {
  const src = path.join(PRE, LANG + '-' + screen + '.html');
  if (!fs.existsSync(src)) throw new Error('немає сторінки ' + src);
  const dst = path.join(OUT, file);
  const r = spawnSync(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--window-size=' + W + ',' + H,
    '--force-device-scale-factor=' + DSF, '--virtual-time-budget=10000',
    '--screenshot=' + dst, 'file://' + src], {encoding: 'utf8'});
  if (!fs.existsSync(dst)) throw new Error('не знявся ' + screen + '\n' + (r.stderr || ''));
  console.log('  ✓ ' + file + '  ' + screen + '  ' + Math.round(fs.statSync(dst).size / 1024) + ' КБ');
});

console.log('\n══════ ' + SLIDES.length + ' знімки для онбордингу ══════');
