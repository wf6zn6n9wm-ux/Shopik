/* ──────────────────────────────────────────────────────────────────
   Скриншоти для App Store і Google Play — з живого застосунку.

   Знімається справжній index.html у headless-браузері: проходить
   онбординг, вмикає демодані, відкриває потрібний екран. Потім кадр
   вкладається в маркетингову рамку із заголовком.

     node trainer/store/shots.js            усі мови
     node trainer/store/shots.js uk en      лише вибрані

   Результат — trainer/store/out/<мова>/<магазин>-<екран>.png
   (у git не потрапляє, див. .gitignore).

   Потрібен Chrome або Chromium. Шлях шукається сам; якщо не знайшовся —
   вкажіть змінною CHROME=/шлях/до/chrome.

   За замовчуванням екрани малюються з коду без браузерного React:
   prerender.js виконує застосунок у пісочниці й віддає готову розмітку.
   Тому інтернет не потрібен і нічого не треба прокликувати.

   LIVE=1 повертає старий шлях: справжній index.html, React і Babel з
   unpkg, скрипт-драйвер прокликує онбординг. Потрібен інтернет.

   Розміри. Знімок дорівнює --window-size × --force-device-scale-factor,
   а верстка ніколи не вужча за 500 CSS-пікселів (обмеження headless).
   Тому рамка малюється у великих CSS-розмірах із дробовим масштабом:
   856×1852 @1.5 = 1284×2778 (App Store 6.5"), 720×1280 @1.5 = 1080×1920
   (Google Play). Так виходить рівно те, що вимагають магазини.
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const {spawn, spawnSync} = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const PORT = 8749;

const CHROME = process.env.CHROME || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });

if (!CHROME){ console.error('Не знайшов Chrome. Вкажіть: CHROME=/шлях/до/chrome node trainer/store/shots.js'); process.exit(1); }

/* ─────────── що знімаємо ─────────── */
const FRAMES = [
  {key: 'home',    tab: 1},
  {key: 'cal',     tab: 2},
  {key: 'client',  tab: 3, then: '.rows button, .card.press'},   /* перший клієнт у списку */
  {key: 'finance', menu: 1},                                     /* меню → Фінанси */
  {key: 'sales',   tab: 4},
];

/* Заголовки над кадром — те саме, що в listing.md */
const CAPTION = {
  uk: {home:'Ваш день — на одному екрані', cal:'Розклад, який завжди під рукою',
       client:'Уся історія клієнта в одній картці', finance:'Гроші рахуються самі',
       sales:'Товари й абонементи — теж дохід'},
  ru: {home:'Ваш день — на одном экране', cal:'Расписание всегда под рукой',
       client:'Вся история клиента в одной карточке', finance:'Деньги считаются сами',
       sales:'Товары и абонементы — тоже доход'},
  en: {home:'Your day on one screen', cal:'A schedule that is always at hand',
       client:'The whole client history in one card', finance:'The money counts itself',
       sales:'Products and packages are income too'},
  pl: {home:'Twój dzień na jednym ekranie', cal:'Grafik zawsze pod ręką',
       client:'Cała historia klienta w jednej karcie', finance:'Pieniądze liczą się same',
       sales:'Towary i karnety to też dochód'},
};

const STORES = {
  /* App Store 6.5" — 1284×2778.
     Саме цей слот у App Store Connect і приймає знімки. 6.7" (1290×2796)
     він відхиляє: розміри мають збігатися точно, «майже той самий» там
     не рахується. 856×1852 @1.5 дають рівно 1284×2778. */
  ios:  {w: 856, h: 1852, dsf: 1.5},
  /* Google Play — 1080×1920 */
  play: {w: 720, h: 1280, dsf: 1.5},
  /* App Store, iPad Pro 13" — 2048×2732.
     Потрібен не тому, що застосунком користуються з планшета, а тому,
     що складання ставиться і на iPad: Apple не пускає версію на
     перевірку без знімка для нього. 1024×1366 @2 дають рівно
     2048×2732. Рамка та сама, застосунок усередині лишається вузьким —
     він такий і на планшеті. */
  ipad: {w: 1024, h: 1366, dsf: 2},
};

const sh = (bin, args) => spawnSync(bin, args, {encoding: 'utf8', maxBuffer: 1 << 28});
const shot = (url, file, {w, h, dsf}) => sh(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
  '--hide-scrollbars', '--window-size=' + w + ',' + h, '--force-device-scale-factor=' + dsf,
  '--virtual-time-budget=30000', '--screenshot=' + file, url]);

/* ─────────── 1. знімок самого застосунку ─────────── */
/* Знімаємо ширше, ніж треба (540 CSS), щоб оболонка застосунку (480px)
   вмістилась цілком; у рамці зображення вже масштабується. */
const APP = {w: 540, h: 1170, dsf: 2};

function appHarness(lang, frame){
  return `<meta charset="utf-8">
<script>
Object.defineProperty(navigator,'language',{value:'${lang}',configurable:true});
Object.defineProperty(navigator,'languages',{value:['${lang}'],configurable:true});
</script>`;
}

/* Клікаємо по структурі, а не по написах — інакше сценарій розсипався б
   на кожній мові. */
function driver(frame){
  return `<script>
const wait = ms => new Promise(r => setTimeout(r, ms));
const all = s => [...document.querySelectorAll(s)];
const vis = e => !!(e.offsetWidth || e.offsetHeight);
const pri = () => all('.ob button').filter(b => /pri/.test(b.className))[0];
document.head.insertAdjacentHTML('beforeend',
  '<style>*{transition:none!important;animation:none!important}</style>');
${require('./prerender.js').TRIM ? '' : ''}
(async () => {
  await wait(700);
  for (let i = 0; i < 3; i++){ const b = pri(); if (b){ b.click(); await wait(220); } }
  const li = document.querySelector('.ob .inp');
  if (li){ li.value = 'trainer@mail.com'; li.dispatchEvent(new Event('input', {bubbles:true})); await wait(180); }
  if (pri()){ pri().click(); await wait(450); }
  const nm = document.querySelector('.ob .inp');
  if (nm){ nm.value = 'Alex'; nm.dispatchEvent(new Event('input', {bubbles:true})); await wait(180); }
  if (pri()){ pri().click(); await wait(700); }
  if (pri()){ pri().click(); await wait(900); }          /* «почати безкоштовно» */
  ${frame.tab ? `const tab = all('.nav button')[${frame.tab - 1}]; if (tab){ tab.click(); await wait(600); }` : ''}
  ${frame.menu ? `const burger = document.querySelector('.appbar .iconbtn'); if (burger){ burger.click(); await wait(400); }
     const row = all('.sheet .setrow').filter(vis)[${frame.menu - 1}]; if (row){ row.click(); await wait(700); }` : ''}
  ${frame.then ? `const it = all('${frame.then}').filter(vis)[0]; if (it){ it.click(); await wait(700); }` : ''}
  await wait(400);
  ${require('./prerender.js').TRIM}
  await wait(150);
  document.title = 'ГОТОВО';
})();
</script>`;
}

/* ─────────── 2. маркетингова рамка ─────────── */
/* Дві поправки, без яких кадр виглядав би недбало:

   1. Знімок застосунку — 540 CSS завширшки, а сама оболонка всередині
      480: по краях лишались би білі поля. Тому зображення розтягуємо на
      540/480 і зсуваємо — у рамку потрапляє рівно оболонка.

   2. Верстка в headless нижча за вікно на 87 CSS-пікселів, тож унизу
      кадру лишалась би біла смуга. Закриваємо її суцільним кольором на
      html — тим самим, яким закінчується градієнт, тож стику не видно.
      Сам градієнт лишається на полотні: на html він не намалювався б,
      бо весь вміст поза потоком і висота кореня — нуль.               */
/* Останній стоп раніше 100%: під полотном іде суцільний BG_END, і якби
   градієнт доходив до кута, на стику була б помітна смуга. */
const BG = 'linear-gradient(165deg,#6B4DFF 0%,#4A2FD6 52%,#2B1A8F 88%)';
const BG_END = '#2B1A8F';
const CHROME_GAP = 87;              /* різниця між висотою вікна і версткою */
const SHELL = 480;                  /* ширина оболонки застосунку */

function frameHtml(caption, pngBase64, store){
  const s = STORES[store];
  const H = s.h - CHROME_GAP;                       /* стільки насправді верстається */
  const phoneW = Math.round(s.w * 0.70);
  const top = Math.round(H * 0.055);
  const gap = Math.round(H * 0.05);
  const capH = Math.round(s.w * 0.062 * 1.18 * 2);  /* два рядки заголовка */
  const phoneH = H - top - capH - gap - Math.round(H * 0.03);
  const zoom = APP.w / SHELL;                       /* 540/480 */
  return `<!doctype html><meta charset="utf-8">
<style>
  html{background:${BG_END};}
  html,body{margin:0;padding:0;}
  .canvas{position:fixed;left:0;top:0;width:${s.w}px;height:${H}px;overflow:hidden;background:${BG};
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    display:flex;flex-direction:column;align-items:center;}
  .cap{width:${Math.round(s.w * 0.84)}px;height:${capH}px;margin-top:${top}px;
    display:flex;align-items:center;justify-content:center;text-align:center;
    color:#fff;font-weight:800;letter-spacing:-.02em;line-height:1.18;
    font-size:${Math.round(s.w * 0.062)}px;}
  .phone{margin-top:${gap}px;width:${phoneW}px;height:${phoneH}px;overflow:hidden;
    border-radius:${Math.round(phoneW * 0.085)}px;background:#fff;
    box-shadow:0 ${Math.round(H * 0.018)}px ${Math.round(H * 0.05)}px rgba(20,10,60,.45);
    border:${Math.max(2, Math.round(phoneW * 0.007))}px solid rgba(255,255,255,.22);}
  /* прибираємо поля навколо оболонки застосунку */
  .phone img{display:block;width:${(zoom * 100).toFixed(3)}%;margin-left:${(-(zoom - 1) / 2 * 100).toFixed(3)}%;}
</style>
<div class="canvas">
  <div class="cap">${caption.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
  <div class="phone"><img src="data:image/png;base64,${pngBase64}"></div>
</div>`;
}

/* ─────────── прогін ─────────── */
const langs = process.argv.slice(2).filter(x => CAPTION[x]);
const LANGS = langs.length ? langs : Object.keys(CAPTION);

const LIVE = !!process.env.LIVE;
const prerender = LIVE ? null : require('./prerender.js');
const app = LIVE ? fs.readFileSync(process.env.APP || path.join(ROOT, 'index.html'), 'utf8') : '';
fs.mkdirSync(OUT, {recursive: true});
const tmp = path.join(OUT, '_tmp');
fs.mkdirSync(tmp, {recursive: true});

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', ROOT],
  {stdio: 'ignore'});
const pause = ms => spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},' + ms + ')']);
pause(800);

let made = 0;
try {
  for (const lang of LANGS){
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, {recursive: true});
    for (const f of FRAMES){
      /* сторінка застосунку з драйвером — лежить поруч, щоб origin збігався */
      const page = 'shot-' + lang + '-' + f.key + '.html';
      fs.writeFileSync(path.join(ROOT, page),
        LIVE ? appHarness(lang, f) + app + driver(f) : prerender.build(lang, f.key));
      const raw = path.join(tmp, lang + '-' + f.key + '.png');
      shot('http://127.0.0.1:' + PORT + '/' + page, raw, APP);
      fs.unlinkSync(path.join(ROOT, page));
      if (!fs.existsSync(raw)){ console.log('  ✗ ' + lang + '/' + f.key + ' — знімок не вийшов'); continue; }

      const b64 = fs.readFileSync(raw).toString('base64');
      for (const store of Object.keys(STORES)){
        const html = path.join(tmp, 'frame.html');
        fs.writeFileSync(html, frameHtml(CAPTION[lang][f.key], b64, store));
        const out = path.join(dir, store + '-' + f.key + '.png');
        shot('file://' + html, out, STORES[store]);
        if (fs.existsSync(out)) made++;
      }
      console.log('  ✓ ' + lang + '/' + f.key);
    }
  }
} finally {
  srv.kill();
  fs.rmSync(tmp, {recursive: true, force: true});
}

console.log('\nготово: ' + made + ' зображень у ' + path.relative(process.cwd(), OUT));
console.log('App Store 6.5" — ios-*.png (1284×2778), Google Play — play-*.png (1080×1920)');
