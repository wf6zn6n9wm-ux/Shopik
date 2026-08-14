/* ──────────────────────────────────────────────────────────────────
   Екрани застосунку — у статичний HTML.

   Скриншоти для магазинів раніше знімались із живого index.html: браузер
   вантажив React і Babel з unpkg, скрипт прокликував онбординг і відкривав
   потрібний екран. Це працює, поки є інтернет, і розсипається, щойно його
   немає — а ще залежить від таймінгів кліків.

   Тут інакше: застосунок виконується в тій самій пісочниці, що й у
   тестах, дерево елементів серіалізується в розмітку, і виходить
   сторінка, яку лишається тільки сфотографувати. Ні мережі, ні кліків,
   ні очікувань — і знімок показує рівно те, що перевірено тестами.

   Інтерактивності немає й не треба: знімок статичний.

     node trainer/store/prerender.js              усі екрани, усі мови
     node trainer/store/prerender.js uk home      вибірково

   Результат — trainer/store/out/pre/<мова>-<екран>.html
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const {load, ROOT} = require('../tests/app.js');

const OUT = path.join(__dirname, 'out', 'pre');

/* ─────────── серіалізація дерева ─────────── */

/* Порожні теги HTML: закривати їх не можна. Теги SVG сюди не входять —
   усередині <svg> браузер розбирає розмітку як XML, і там працює `/>`. */
const VOID = new Set(['area','base','br','col','embed','hr','img','input',
                      'link','meta','param','source','track','wbr']);
/* Атрибути, які в React пишуться інакше, ніж у розмітці */
const ATTR = {className: 'class', htmlFor: 'for', xlinkHref: 'xlink:href'};
const SKIP = new Set(['key', 'ref', 'children', 'dangerouslySetInnerHTML']);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* strokeWidth → stroke-width; але viewBox і preserveAspectRatio лишаються */
const KEEP = new Set(['viewBox', 'preserveAspectRatio', 'baseProfile']);
const dash = k => KEEP.has(k) ? k : k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const cssName = k => k.startsWith('--') ? k : k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
/* числа без одиниць — пікселі, як у React */
const UNITLESS = new Set(['opacity','zIndex','flex','flexGrow','flexShrink','fontWeight',
                          'lineHeight','order','zoom','strokeWidth','strokeDasharray',
                          'strokeDashoffset','fillOpacity','strokeOpacity']);
const style = o => Object.keys(o || {}).filter(k => o[k] !== null && o[k] !== undefined && o[k] !== '')
  .map(k => cssName(k) + ':' + (typeof o[k] === 'number' && !UNITLESS.has(k) ? o[k] + 'px' : o[k]))
  .join(';');

function attrs(props){
  const out = [];
  Object.keys(props || {}).forEach(k => {
    if (SKIP.has(k) || k.startsWith('on')) return;
    const v = props[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'style'){ const s = style(v); if (s) out.push('style="' + esc(s) + '"'); return; }
    if (v === true){ out.push(dash(ATTR[k] || k)); return; }
    out.push((ATTR[k] || dash(k)) + '="' + esc(v) + '"');
  });
  return out.length ? ' ' + out.join(' ') : '';
}

function html(node){
  if (node === null || node === undefined || node === false || node === true) return '';
  if (Array.isArray(node)) return node.map(html).join('');
  if (typeof node !== 'object') return esc(node);
  if (!node.__el) return '';
  const {type, props} = node;
  /* компонент — виконуємо і серіалізуємо те, що він повернув */
  if (typeof type === 'function'){
    const out = (type.prototype && type.prototype.isReactComponent)
      ? new type(props).render() : type(props);
    return html(out);
  }
  /* Fragment і Provider розмітки не дають, лише дітей */
  if (type === 'Fragment' || type === 'Provider' || type === 'Consumer') return html(props && props.children);
  const inner = html(props && props.children);
  if (VOID.has(type)) return '<' + type + attrs(props) + '>';
  return '<' + type + attrs(props) + '>' + inner + '</' + type + '>';
}

/* ─────────── екрани ─────────── */
/* Оболонку (нижнє меню, порядок шарів) відтворюємо тут, а не рендеримо
   Shell: у ньому вкладка живе в useState, а заглушка завжди повертає
   початкове значення — вибрати «Календар» через нього не вийшло б. */
const SCREENS = {
  home:    {tab: 0, screen: T => [T.Home, {loading: false}]},
  cal:     {tab: 1, screen: T => [T.Calendar, {loading: false}]},
  client:  {tab: 2, screen: T => [T.Clients, {loading: false}],
            page: T => T.ROUTES.client({params: {id: 'cl_1'}, onClose(){}})},
  finance: {tab: 0, screen: T => [T.Home, {loading: false}],
            page: T => T.ROUTES.finance({params: {}, onClose(){}})},
  sales:   {tab: 3, screen: T => [T.Sales, {loading: false}]},
};

const TABS = [
  {ic: 'home',  key: 'nav.home'},
  {ic: 'cal',   key: 'nav.cal'},
  {ic: 'users', key: 'nav.clients'},
  {ic: 'bag',   key: 'nav.sales'},
  {ic: 'user',  key: 'nav.profile'},
];
const TAB_TITLE = {
  uk: ['Головна', 'Календар', 'Клієнти', 'Продажі', 'Профіль'],
  ru: ['Главная', 'Календарь', 'Клиенты', 'Продажи', 'Профиль'],
  en: ['Home', 'Calendar', 'Clients', 'Sales', 'Profile'],
  pl: ['Główna', 'Kalendarz', 'Klienci', 'Sprzedaż', 'Profil'],
};

function navHtml(T, el, lang, active){
  const names = TAB_TITLE[lang] || TAB_TITLE.uk;
  const items = TABS.map((x, i) =>
    '<button class="' + (i === active ? 'on' : '') + '">' +
      html(el(T.Ic[x.ic], {size: 23})) + '<span>' + esc(names[i]) + '</span></button>').join('');
  return '<nav class="nav">' + items + '</nav>';
}

function page(css, lang, body){
  return '<!doctype html><html lang="' + lang + '" data-theme="light"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' + css + '</style>' +
    /* знімок має бути однаковим щоразу: жодних анімацій і кареток.
       Меню в застосунку напівпрозоре з розмиттям — у headless розмиття
       не малюється, і крізь меню просвічує текст. Для знімка робимо
       його суцільним: на телефоні воно виглядає саме так. */
    '<style>*{animation:none !important;transition:none !important;caret-color:transparent !important}' +
    '.nav{background:var(--bg-2) !important;backdrop-filter:none !important}</style>' +
    '</head><body><div id="root">' + body + '</div></body></html>';
}

function build(lang, key){
  const {T, el} = load();
  T.I18n.set(lang);
  T.Store.init(T.seedDB({name: 'Alex', phone: '+380631234567', email: 'trainer@mail.com'}));
  const conf = SCREENS[key];
  const [Comp, props] = conf.screen(T);
  let body = '<div class="app">' + html(el(Comp, props)) + navHtml(T, el, lang, conf.tab);
  if (conf.page) body += '<div style="z-index:50;position:relative">' + html(conf.page(T)) + '</div>';
  body += '</div>';

  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
  return page(css, lang, body);
}

if (require.main === module){
  const args = process.argv.slice(2);
  const langs = args.filter(a => TAB_TITLE[a]);
  const keys = args.filter(a => SCREENS[a]);
  const LANGS = langs.length ? langs : Object.keys(TAB_TITLE);
  const KEYS = keys.length ? keys : Object.keys(SCREENS);

  fs.mkdirSync(OUT, {recursive: true});
  let made = 0, bad = 0;
  for (const lang of LANGS){
    for (const key of KEYS){
      try {
        const file = path.join(OUT, lang + '-' + key + '.html');
        fs.writeFileSync(file, build(lang, key));
        made++;
        console.log('  ✓ ' + lang + '/' + key + ' — ' + Math.round(fs.statSync(file).size / 1024) + ' КБ');
      } catch (e){
        bad++;
        console.log('  ✗ ' + lang + '/' + key + ' — ' + e.message);
      }
    }
  }
  console.log('\n══════ ' + made + ' сторінок' + (bad ? ' · не вийшло: ' + bad : '') + ' ══════');
  process.exit(bad ? 1 : 0);
}

module.exports = {build, html, SCREENS};
