/* Статичний прев'ю Urok+ — щоб побачити дизайн без збірки й CDN.
   node urok/tools/preview.js [uk|ru|en] > urok/preview.html

   Ті самі компоненти, що й у застосунку, рендеряться в HTML і
   вставляються в дві рамки — світлу й темну — з тим самим CSS із
   index.html. Використовується для перевірки дизайн-системи й для
   скриншотів у сторі. Не входить у застосунок.                    */
const fs = require('fs');
const path = require('path');
const {boot} = require('../tests/harness');

const ROOT = path.join(__dirname, '..');
const LANG = (process.argv[2] || 'uk').toLowerCase();
/* другий аргумент — список екранів через кому (за замовчуванням усі) */
const ONLY = (process.argv[3] || '').split(',').map(x => x.trim()).filter(Boolean);

const {U} = boot();
const {A, store, makeT, loadDemo, todayISO} = U;

/* ── React-елемент → HTML ──────────────────────────────────── */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const UNITLESS = new Set(['opacity', 'fontWeight', 'lineHeight', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'gridColumn', 'gridRow']);
/* viewBox лишається як є: після kebab-case з нього виходить
   view-box, який браузер ігнорує — і всі іконки малюються не в
   тому масштабі. React це робить правильно, серіалізатор мусить теж. */
const ATTR = {className: 'class', htmlFor: 'for', autoFocus: 'autofocus', tabIndex: 'tabindex',
              readOnly: 'readonly', maxLength: 'maxlength', inputMode: 'inputmode', viewBox: 'viewBox'};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());

function styleString(obj){
  return Object.keys(obj).filter(k => obj[k] !== undefined && obj[k] !== null).map(k => {
    const v = obj[k];
    const val = typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : v;
    return `${kebab(k)}:${val}`;
  }).join(';');
}

function attrs(props){
  return Object.keys(props).map(k => {
    if (k === 'children' || k === 'key' || k === 'ref') return '';
    if (/^on[A-Z]/.test(k)) return '';
    const v = props[k];
    if (v === undefined || v === null || v === false) return '';
    if (k === 'style') return ` style="${esc(styleString(v))}"`;
    if (v === true) return ` ${ATTR[k] || kebab(k)}`;
    if (typeof v === 'object') return '';
    return ` ${ATTR[k] || (/^(aria|data)[A-Z-]/.test(k) ? kebab(k) : (ATTR[k] || kebab(k)))}="${esc(v)}"`;
  }).join('');
}

function html(node){
  if (node === null || node === undefined || node === false || node === true) return '';
  if (Array.isArray(node)) return node.map(html).join('');
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  if (!node.__el) return '';
  const {type, props} = node;
  if (typeof type === 'function') return html(type(props));
  if (type === 'Fragment') return html(props.children);
  const inner = props.children === undefined ? '' : html(props.children);
  if (VOID.has(type)) return `<${type}${attrs(props)}>`;
  return `<${type}${attrs(props)}>${inner}</${type}>`;
}

/* ── дані для прев'ю ───────────────────────────────────────── */
store.reset();
A.setAuth({status: 'authed', phone: '+380631112233', provider: 'phone', createdAt: todayISO()});
A.setProfile({name: LANG === 'en' ? 'Olena Kravets' : 'Олена Кравець'});
A.setSettings({lang: LANG});
store.set(s => ({...s, onboarded: true}));
const t = makeT(LANG);
loadDemo(t);
const s = store.get();
const nav = {push(){}, back(){}, replace(){}, reset(){}, go(){}};

const frames = [
  {id: 'calendar', title: t('nav.calendar'), node: {__el: true, type: U.CalendarScreen, props: {t, s, nav}}, nav: 'calendar'},
  {id: 'students', title: t('nav.students'), node: {__el: true, type: U.StudentsScreen, props: {t, s, nav}}, nav: 'students'},
  {id: 'student', title: t('st.title'), node: {__el: true, type: U.StudentScreen, props: {t, s, nav, params: {id: s.students[0].id}}}},
  {id: 'lesson-new', title: t('lesson.new'), node: {__el: true, type: U.LessonFormScreen, props: {t, s, nav, params: {date: todayISO()}}}},
  {id: 'market', title: t('nav.market'), node: {__el: true, type: U.MarketScreen, props: {t, s, nav}}, nav: 'market'},
  {id: 'profile', title: t('nav.profile'), node: {__el: true, type: U.ProfileScreen, props: {t, s, nav}}, nav: 'profile'},
  {id: 'premium', title: t('sub.title'), node: {__el: true, type: U.PremiumScreen, props: {t, s, nav, params: {}}}},
  {id: 'settings', title: t('se.title'), node: {__el: true, type: U.SettingsScreen, props: {t, s, nav}}},
  {id: 'onboarding', title: 'Onboarding', node: {__el: true, type: U.Onboarding, props: {t, onDone(){}}}},
  {id: 'auth', title: 'Sign in', node: {__el: true, type: U.AuthFlow, props: {t, onDone(){}}}},
  {id: 'empty', title: t('st.emptyT'), node: {__el: true, type: U.StudentsScreen, props: {t, s: {...s, students: [], lessons: []}, nav}}},
];

const shown = ONLY.length ? frames.filter(f => ONLY.includes(f.id)) : frames;

const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('<style>')[1].split('</style>')[0];

const phone = (f, theme) => `
  <figure class="pv-phone">
    <div class="pv-label">${esc(f.title)}</div>
    <div class="pv-screen" data-theme="${theme}">
      <div class="pv-shell">
        ${html(f.node)}
        ${f.nav ? html({__el: true, type: U.BottomNav, props: {t, tab: f.nav, onTab(){}}}) : ''}
      </div>
    </div>
  </figure>`;

process.stdout.write(`<!doctype html>
<html lang="${LANG}">
<head>
<meta charset="utf-8">
<title>Urok+ · preview (${LANG})</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Onest:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
${css}
/* ── лише для цієї сторінки ── */
body{background:#EEF0F3;padding:26px 20px 60px;overflow:auto;}
.pv-head{max-width:1400px;margin:0 auto 24px;font-family:'Onest',sans-serif;}
.pv-head h1{font-size:30px;font-weight:800;letter-spacing:-.04em;margin:0;color:#0C1015;}
.pv-head p{color:#5A626C;font-size:14px;margin:6px 0 0;font-family:'Manrope',sans-serif;}
.pv-band{max-width:1400px;margin:0 auto 34px;}
.pv-band > h2{font-family:'Onest',sans-serif;font-size:15px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:#7A828C;margin:0 0 14px;}
.pv-row{display:flex;gap:22px;flex-wrap:wrap;}
.pv-phone{margin:0;}
.pv-label{font-family:'Manrope',sans-serif;font-size:12px;font-weight:700;color:#7A828C;margin-bottom:8px;padding-left:4px;}
.pv-screen{width:392px;height:812px;border-radius:38px;overflow:hidden;position:relative;
  box-shadow:0 30px 60px -30px rgba(10,14,20,.5);border:1px solid rgba(0,0,0,.08);}
.pv-screen[data-theme="dark"]{border-color:rgba(255,255,255,.08);}
.pv-shell{position:absolute;inset:0;overflow:hidden;background:var(--bg);color:var(--ink);}
.pv-shell .app{min-height:100%;}
.pv-shell .nav,.pv-shell .fixedbar{position:absolute;}
.pv-shell .cover{min-height:100%;}
.pv-screen[data-theme="dark"]{background:#0B0D10;}
</style>
</head>
<body>
<div class="pv-head">
  <h1>Urok+ · design preview</h1>
  <p>Статичний рендер тих самих компонентів. Мова: ${LANG}. Зверху — світла тема, знизу — темна.</p>
</div>
<div class="pv-band">
  <h2>Light</h2>
  <div class="pv-row">${shown.map(f => phone(f, 'light')).join('')}</div>
</div>
<div class="pv-band">
  <h2>Dark</h2>
  <div class="pv-row">${shown.map(f => phone(f, 'dark')).join('')}</div>
</div>
</body>
</html>
`);
