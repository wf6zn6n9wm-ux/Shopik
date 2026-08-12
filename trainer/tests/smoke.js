/* Перевірка PRO Trainer без браузера.
   JSX із index.html транспілюється (bun або @babel/standalone), код
   виконується в пісочниці з заглушкою React — і кожен екран реально
   рендериться. Ловить забуті змінні, биті екрани та помилки в грошах.

   node trainer/tests/smoke.js
   Потрібен bun (є в PATH) або встановлений @babel/standalone. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {webcrypto} = require('crypto');
const {spawnSync} = require('child_process');

const ROOT = path.join(__dirname, '..');

/* ── 1. дістаємо і транспілюємо скрипт ── */
function source(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const open = html.indexOf('data-presets="react">');
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < 0) throw new Error('не знайшов <script type="text/babel"> в index.html');
  return html.slice(open + 'data-presets="react">'.length, close);
}
function transpile(src){
  try {
    const babel = require('@babel/standalone');
    return babel.transform(src, {presets: ['react']}).code;
  } catch (e){
    if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'protrainer-'));
  const jsx = path.join(dir, 'app.jsx'), out = path.join(dir, 'out.js');
  fs.writeFileSync(jsx, src);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {jsx: 'react', jsxFactory: 'React.createElement', jsxFragmentFactory: 'React.Fragment', target: 'es2020'},
  }));
  const r = spawnSync('bun', ['build', '--no-bundle', jsx, '--outfile', out], {encoding: 'utf8'});
  if (r.status !== 0 || !fs.existsSync(out))
    throw new Error('не вдалося транспілювати JSX: постав bun або @babel/standalone\n' + (r.stderr || r.error || ''));
  return fs.readFileSync(out, 'utf8');
}

/* ── 2. пісочниця ── */
function sandbox(){
  const mem = new Map();
  const el = (type, props, ...children) => {
    const p = Object.assign({}, props);
    if (children.length) p.children = children.length === 1 ? children[0] : children;
    return {__el: true, type, props: p};
  };
  class Component {
    constructor(props){ this.props = props; this.state = {}; }
    setState(s){ this.state = Object.assign({}, this.state, typeof s === 'function' ? s(this.state) : s); }
  }
  Component.prototype.isReactComponent = {};
  const React = {
    createElement: el, Fragment: 'Fragment', Component,
    createContext: d => ({__ctx: true, _d: d, Provider: 'Provider', Consumer: 'Consumer'}),
    useState: v => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {}, useLayoutEffect: () => {},
    useRef: v => ({current: v}), useMemo: f => f(), useCallback: f => f,
    useContext: c => (c && c._d !== undefined ? c._d : {}),
  };
  const doc = {
    documentElement: {dataset: {}, lang: 'uk', style: {setProperty(){}}},
    body: {style: {}},
    getElementById: () => ({setAttribute(){}, style: {}}),
    createElement: () => ({click(){}, setAttribute(){}, style: {}}),
    addEventListener(){}, removeEventListener(){},
  };
  const ctx = {
    console, setTimeout, clearTimeout, clearInterval, setInterval: () => 0,
    Intl, Date, Math, JSON, URL, TextEncoder, TextDecoder,
    crypto: webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Blob: class {}, FileReader: class {},
    localStorage: {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k),
    },
    React, ReactDOM: {createRoot: () => ({render(){}})},
    navigator: {onLine: true},
    location: {protocol: 'http:', reload(){}},
    history: {pushState(){}, back(){}, go(){}, state: null},
    document: doc,
    fetch: async () => ({ok: true}),
    matchMedia: () => ({matches: false, addEventListener(){}, removeEventListener(){}}),
    addEventListener(){}, removeEventListener(){},
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  return {ctx: vm.createContext(ctx), el};
}

const EXPORTS = `;globalThis.__T = {split, stats, seedDB, emptyDB, periodRange, clientStats, clientFeed, isDebt,
  clientPrice, typedPrice, periodOf, periodLabel, deltaRange, RangeSheet, PeriodBar, iso, addDays,
  Store, Act, money, phoneMask, nSessions, fmtLong, I18n, ROUTES,
  Shell, Home, Calendar, Clients, Sales, Profile, Onboarding, Auth, Setup, PinLock};`;

const {ctx, el} = sandbox();
vm.runInContext(transpile(source()) + EXPORTS, ctx, {filename: 'protrainer.jsx'});
const T = ctx.__T;

/* ── 3. звіт ── */
let checks = 0, fails = 0;
const ok = (name, cond, extra) => {
  checks++;
  if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};
const part = title => console.log('\n── ' + title + ' ──');

/* обхід дерева: компоненти реально виконуються */
function walk(node){
  if (node == null || node === false || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + walk(x), 0);
  if (!node.__el) return 0;
  const {type, props} = node;
  if (typeof type === 'function'){
    const out = (type.prototype && type.prototype.isReactComponent) ? new type(props).render() : type(props);
    return 1 + walk(out);
  }
  return 1 + walk(props && props.children);
}
/* увесь текст піддерева — щоб перевіряти, що саме бачить тренер */
function textOf(node){
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return ' ' + node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node.__el) return '';
  const {type, props} = node;
  if (typeof type === 'function'){
    const out = (type.prototype && type.prototype.isReactComponent) ? new type(props).render() : type(props);
    return textOf(out);
  }
  return textOf(props && props.children);
}

const screen = (name, make) => {
  try { const n = walk(make()); ok(name, n > 3, n + ' вузлів'); }
  catch (e){ ok(name, false, e.message); }
};

part('демодані');
const db = T.seedDB({name: 'Олександр Тренер'});
T.Store.init(db);
ok('база заповнюється прикладом', db.clients.length === 8 && db.sessions.length > 100,
   db.clients.length + ' клієнтів, ' + db.sessions.length + ' тренувань');

part('гроші');
const p15 = T.split(800, {gymMode: 'percent', gymPercent: 15});
ok('800 ₴ при 15%: 120 залу, 680 тренеру', p15.gym === 120 && p15.net === 680);
const pFix = T.split(800, {gymMode: 'fixed', gymFixed: 200});
ok('фіксована комісія', pFix.gym === 200 && pFix.net === 600);
ok('без комісії', T.split(800, {gymMode: 'none'}).net === 800);
ok('комісія не з’їдає більше за оборот', T.split(100, {gymMode: 'fixed', gymFixed: 500}).net === 0);

const [df, dt] = T.periodRange('day', new Date());
const today = T.stats(db, df, dt);
ok('сьогодні 6 тренувань', today.count === 6, today.count + ' шт.');
ok('оборот = чистими + залу', today.gross === today.net + today.gym,
   T.money(today.gross) + ' = ' + T.money(today.net) + ' + ' + T.money(today.gym));
ok('скасовані не потрапляють у дохід',
   T.stats({...db, sessions: db.sessions.map(s => ({...s, status: 'canceled'}))}, df, dt).gross === 0);
const [mf, mt] = T.periodRange('month', new Date());
const month = T.stats(db, mf, mt);
ok('місяць рахується', month.count > 0 && month.avg > 0, month.count + ' трен., середня ' + T.money(month.avg));
ok('борг рахується в межах періоду', T.stats(db, mf, mt).debt <= T.stats(db, new Date(0), new Date(8.64e15)).debt);

part('клієнт');
const cs = T.clientStats(db, 'cl_0');
ok('історія й витрати', cs.done > 0 && cs.spent > 0, cs.done + ' трен., ' + T.money(cs.spent));
ok('активний абонемент', !!cs.sub);
const feed = T.clientFeed(db, 'cl_0');
ok('стрічка від нових до старих', feed.length > 0 && feed.every((x, i) => i === 0 || feed[i - 1].ts >= x.ts));
ok('є неоплачені тренування', db.sessions.filter(T.isDebt).length > 0);

part('дії');
const c = T.Act.addClient({name: 'Тест Тестовий'});
ok('клієнт додається', !!T.Store.state.clients.find(x => x.id === c.id));
const s1 = T.Act.addSession({clientId: c.id, price: 800, start: new Date().toISOString()});
T.Act.complete(s1.id, true);
ok('тренування проводиться', T.Store.state.sessions.find(x => x.id === s1.id).status === 'done');
const sub = T.Act.buyPackage(c.id, {id: 'pk_1', sessions: 8, price: 5600, days: 60});
const s2 = T.Act.addSession({clientId: c.id, subId: sub.id, price: 700, start: new Date().toISOString()});
T.Act.complete(s2.id, false);
ok('абонемент списує заняття', T.Store.state.subs.find(x => x.id === sub.id).used === 1);
T.Act.cancel(s2.id);
ok('скасування повертає заняття', T.Store.state.subs.find(x => x.id === sub.id).used === 0);
const stock = T.Store.state.products[0].stock;
T.Act.sell({clientId: c.id, productId: T.Store.state.products[0].id, qty: 2, price: 1400});
ok('продаж зменшує залишок', T.Store.state.products[0].stock === stock - 2);
T.Act.delClient(c.id);
ok('видалення прибирає й тренування клієнта',
   !T.Store.state.sessions.some(x => x.clientId === c.id));

const SCREENS = [
  ['Головна', () => el(T.Home, {loading: false})],
  ['Головна · завантаження', () => el(T.Home, {loading: true})],
  ['Календар', () => el(T.Calendar, {loading: false})],
  ['Клієнти', () => el(T.Clients, {loading: false})],
  ['Продажі', () => el(T.Sales, {loading: false})],
  ['Профіль', () => el(T.Profile, {loading: false})],
  ['Оболонка', () => el(T.Shell, {})],
  ['Онбординг', () => el(T.Onboarding, {onDone(){}})],
  ['Вхід', () => el(T.Auth, {onReady(){}})],
  ['Майстер налаштувань', () => el(T.Setup, {account: null, onDone(){}})],
  ['PIN', () => el(T.PinLock, {mode: 'enter', onPin(){}})],
];
const ROUTES = [
  ['notifs', {}], ['client', {id: 'cl_0'}], ['client.new', {}], ['session.new', {}],
  ['session.new', {clientId: 'cl_0'}], ['finance', {}], ['stats', {}], ['settings', {}],
  ['debts', {}], ['lapsed', {}], ['sell', {}], ['product.new', {id: 'pr_1'}], ['product.new', {}],
  ['package.new', {}], ['packages', {}], ['remind', {clientId: 'cl_1', sum: 800}],
];

part('ціна тренування');
ok('своя ціна клієнта', T.clientPrice(db, 'cl_6') === 900, T.money(T.clientPrice(db, 'cl_6')));
ok('без своєї — ціна за замовчуванням', T.clientPrice(db, 'cl_0') === db.settings.price);
ok('невідомий клієнт не ламає розрахунок', T.clientPrice(db, 'нема') === db.settings.price);
ok('тип коригує суму', T.typedPrice(800, 'online') === 560 && T.typedPrice(800, 'split') === 1120 && T.typedPrice(800, 'personal') === 800,
   [T.typedPrice(800,'online'), T.typedPrice(800,'personal'), T.typedPrice(800,'split')].join(' / '));
try {
  const form = textOf(T.ROUTES['session.new']({params: {clientId: 'cl_6'}, onClose(){}}));
  ok('форма підставляє ціну клієнта', /900/.test(form) && !/ 800 /.test(form.split('Вартість')[1] || ''));
  const card = textOf(T.ROUTES['client']({params: {id: 'cl_6'}, onClose(){}}));
  ok('картка показує закріплену ціну', /900/.test(card));
  const card0 = textOf(T.ROUTES['client']({params: {id: 'cl_0'}, onClose(){}}));
  ok('без своєї ціни картка каже «за замовчуванням»', card0.includes('за замовчуванням'));
} catch (e){ ok('ціна в екранах', false, e.message); }

part('наскрізний сценарій');
{
  const base = T.emptyDB();
  T.Store.init({...base, onboarded: true, settings: {...base.settings, price: 800, gymMode: 'percent', gymPercent: 15}});
  const S = () => T.Store.state;
  const [df2, dt2] = T.periodRange('day', new Date());
  const now = () => new Date().toISOString();

  const cl = T.Act.addClient({name: 'Наскрізний Клієнт', price: 900});
  ok('клієнт створений з власною ціною', T.clientPrice(S(), cl.id) === 900);

  const ses = T.Act.addSession({clientId: cl.id, price: T.clientPrice(S(), cl.id), start: now()});
  T.Act.complete(ses.id, false);
  let st = T.stats(S(), df2, dt2);
  ok('дохід порахований з ціни клієнта', st.gross === 900, T.money(st.gross));
  ok('комісія 15% знята', st.gym === 135 && st.net === 765, T.money(st.gym) + ' / ' + T.money(st.net));
  ok('неоплачене стало боргом', st.debt === 900, T.money(st.debt));

  T.Act.payClient(cl.id);
  ok('оплата закрила борг', T.stats(S(), df2, dt2).debt === 0);

  const pkg = T.Act.addPackage({title: '8 тренувань', sessions: 8, price: 5600, days: 60});
  const sub = T.Act.buyPackage(cl.id, pkg);
  const ses2 = T.Act.addSession({clientId: cl.id, subId: sub.id, price: Math.round(pkg.price / pkg.sessions), start: now()});
  T.Act.complete(ses2.id, false);
  ok('абонемент списав заняття', S().subs.find(x => x.id === sub.id).used === 1);
  ok('тренування з абонемента не створює борг', T.stats(S(), df2, dt2).debt === 0);
  ok('покупка абонемента врахована окремо', T.stats(S(), df2, dt2).subsSold === 5600);

  const pr = T.Act.addProduct({name: 'Протеїн', price: 1400, cost: 1000, stock: 2});
  T.Act.sell({clientId: cl.id, productId: pr.id, qty: 1, price: 1400});
  st = T.stats(S(), df2, dt2);
  ok('продаж зменшив залишок', S().products.find(x => x.id === pr.id).stock === 1);
  ok('прибуток з товару в фінансах', st.salesProfit === 400, T.money(st.salesProfit));
  ok('товар не обкладається комісією залу', st.gym === T.split(st.gross, S().settings).gym);

  const before = T.stats(S(), df2, dt2).net;
  T.Act.settings({gymMode: 'none'});
  st = T.stats(S(), df2, dt2);
  ok('зміна комісії перерахувала дохід', st.net === st.gross && st.net > before, T.money(before) + ' → ' + T.money(st.net));
  T.Act.settings({gymMode: 'percent'});

  st = T.stats(S(), df2, dt2);
  ok('статистика бачить клієнта і навантаження', st.clients === 1 && st.count === 2 && st.sesPerClient === 2,
     st.clients + ' клієнт, ' + st.count + ' трен.');
  ok('історія клієнта зібрала все', T.clientFeed(S(), cl.id).length === 4,
     T.clientFeed(S(), cl.id).length + ' записів');

  const ses3 = T.Act.addSession({clientId: cl.id, price: 900, start: now()});
  T.Act.noshow(ses3.id);
  ok('«не прийшов» не потрапляє в дохід', T.stats(S(), df2, dt2).count === 2);
}

part('свій період');
const rng = T.periodOf({kind:'custom', from:'2026-08-05', to:'2026-08-12'});
ok('діапазон включає обидві межі', Math.round((+rng[1] - +rng[0]) / 86400000) === 8,
   Math.round((+rng[1] - +rng[0]) / 86400000) + ' днів');
ok('без діапазону — звичайний період', +T.periodOf({kind:'month'})[0] === +T.periodRange('month', new Date())[0]);
ok('один день теж діапазон', Math.round((+T.periodOf({kind:'custom', from:'2026-08-05'})[1] - +T.periodOf({kind:'custom', from:'2026-08-05'})[0]) / 86400000) === 1);
ok('підпис періоду', T.periodLabel({kind:'custom'}, rng[0], rng[1]).includes('—'), T.periodLabel({kind:'custom'}, rng[0], rng[1]));
{
  const [wf, wt] = T.periodOf({kind:'custom', from: T.iso(T.addDays(new Date(), -6)), to: T.iso(new Date())});
  const whole = T.stats(db, wf, wt);
  let byDay = 0;
  for (let i = 0; i < 7; i++){ const d = T.addDays(wf, i); byDay += T.stats(db, d, T.addDays(d, 1)).net; }
  ok('сума по днях сходиться з періодом', whole.net === byDay, T.money(whole.net) + ' = ' + T.money(byDay));
  ok('динаміка рахується на довільному відрізку', Number.isFinite(T.deltaRange(db, wf, wt)));
}
screen('шторка вибору періоду', () => el(T.RangeSheet, {open: true, onClose(){}, onPick(){},
  value: {kind: 'custom', from: '2026-08-05', to: '2026-08-12'}}));
screen('панель періоду', () => el(T.PeriodBar, {value: {kind: 'custom', from: '2026-08-05', to: '2026-08-12'}, onChange(){}}));

part('екрани на демоданих');
T.Store.init(T.seedDB({name: 'Олександр'}));
SCREENS.forEach(([n, f]) => screen(n, f));
ROUTES.forEach(([r, p]) => screen('маршрут ' + r, () => T.ROUTES[r]({params: p, onClose(){}})));

part('порожній кабінет');
T.Store.init({...T.emptyDB(), onboarded: true});
SCREENS.slice(0, 6).forEach(([n, f]) => screen(n, f));
[['client', {id: 'нема'}], ['finance', {}], ['stats', {}], ['sell', {}], ['packages', {}],
 ['debts', {}], ['lapsed', {}], ['notifs', {}], ['session.new', {}]]
  .forEach(([r, p]) => screen('маршрут ' + r, () => T.ROUTES[r]({params: p, onClose(){}})));

part('битий стан');
T.Store.init({...T.emptyDB(), onboarded: true,
  clients: [{id: 'x', name: 'Без полів'}],
  sessions: [{id: 's', clientId: 'нема', start: new Date().toISOString(), price: 800, status: 'planned', type: 'невідомий'}],
  subs: [{id: 'u', clientId: 'нема', packageId: 'нема', total: 8, used: 3, price: 5600, ts: Date.now(), expiresAt: Date.now()}],
  sales: [{id: 'l', clientId: 'нема', productId: 'нема', qty: 1, price: 100, ts: Date.now()}]});
SCREENS.slice(0, 6).forEach(([n, f]) => screen(n + ' витримує биті дані', f));
screen('картка клієнта витримує биті дані', () => T.ROUTES['client']({params: {id: 'x'}, onClose(){}}));

part('мови');
['uk', 'ru', 'en', 'pl'].forEach(l => {
  T.I18n.set(l);
  screen('головна · ' + l, () => el(T.Home, {loading: false}));
});
ok('скелет перекладу віддається', Object.keys(T.I18n.missing('pl')).length > 50,
   Object.keys(T.I18n.missing('pl')).length + ' ключів для pl');
T.I18n.set('uk');

part('дрібниці');
ok('відмінювання', T.nSessions(1) === '1 тренування' && T.nSessions(5) === '5 тренувань',
   [T.nSessions(1), T.nSessions(2), T.nSessions(5), T.nSessions(11)].join(' · '));
ok('телефонна маска', T.phoneMask('0631234567') === '+380 63 123 45 67', T.phoneMask('0631234567'));
ok('дата з великої літери', /^[А-ЯІЇЄҐ]/.test(T.fmtLong(new Date())), T.fmtLong(new Date()));

console.log('\n══════ ' + (checks - fails) + ' з ' + checks + (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
process.exit(fails ? 1 : 0);
