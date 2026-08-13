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
    Intl, Date, Math, JSON, URL, URLSearchParams, TextEncoder, TextDecoder,
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
    location: {protocol: 'https:', origin: 'https://protrainer.test', reload(){}},
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
  Access, IAP, PLANS, TRIAL_DAYS, planById, Disk, Box, Notifier, Paywall, TrialIntro, Subscription, AccessCard, AppGate, DAY,
  Store, Act, money, phoneMask, nSessions, fmtLong, I18n, ROUTES, Toaster, Photo, PHOTO, Web, WEB,
  financeCsv, Files, inRange, LEGAL, LEGAL_DOCS, Legal, netByBucket,
  PHRASES, LANGS, t, _seen, statusTitle, typeTitle, goalTitle, fill, monthWord, byGroup, bdIn, owed,
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

/* далі — сценарії; частина з них асинхронна (покупки), тому в async-обгортці */
(async () => {

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
/* день народження: у налаштуваннях обіцяно нагадати, тож рахунок днів
   має бути правильним і на межі року */
{
  const at = new Date(2026, 7, 14);            /* 14 серпня */
  ok('сьогоднішній день народження — нуль днів', T.bdIn('1990-08-14', at) === 0, String(T.bdIn('1990-08-14', at)));
  ok('через тиждень', T.bdIn('1990-08-21', at) === 7, String(T.bdIn('1990-08-21', at)));
  ok('минулий цього року рахується на наступний', T.bdIn('1990-08-13', at) === 364, String(T.bdIn('1990-08-13', at)));
  ok('через новий рік', T.bdIn('1990-01-05', at) > 100 && T.bdIn('1990-01-05', at) < 200, String(T.bdIn('1990-01-05', at)));
  ok('без дати — нічого не рахуємо', T.bdIn('', at) === null && T.bdIn(null, at) === null);
}

/* заміри — необов'язкові, тому головне, щоб без них нічого не ламалось */
{
  const c5 = T.Act.addClient({name: 'Замір Тестовий'});
  ok('нова база має список замірів', Array.isArray(T.emptyDB().measures));
  /* кабінет попередньої версії просто не має цього поля */
  const oldDb = T.emptyDB();
  delete oldDb.measures;
  ok('стара база без поля не ламає підрахунки', T.clientStats(oldDb, c5.id).debt === 0);

  const m1 = T.Act.addMeasure({clientId: c5.id, weight: 82.4, waist: 88});
  const m2 = T.Act.addMeasure({clientId: c5.id, weight: 80.1, waist: 84});
  ok('замір зберігається', T.Store.state.measures.length === 2);
  ok('найновіший перший', T.Store.state.measures[0].id === m2.id);
  ok('порожні поля лишаються нулями', m1.chest === 0 && m1.hip === 0);
  T.Act.delMeasure(m1.id);
  ok('замір видаляється', T.Store.state.measures.length === 1);
  T.Act.delClient(c5.id);
  ok('разом із клієнтом ідуть і його заміри',
     !T.Store.state.measures.some(m => m.clientId === c5.id));
}

/* перенесення тренування */
{
  const c3 = T.Act.addClient({name: 'Перенос Тестовий'});
  const c4 = T.Act.addClient({name: 'Сусід Тестовий'});
  const at = new Date(Date.now() + 86400000).toISOString();
  const one = T.Act.addSession({clientId: c3.id, price: 800, start: at});
  const to = new Date(Date.now() + 3 * 86400000);
  T.Act.moveSession(one.id, to);
  const got = id => T.Store.state.sessions.find(x => x.id === id);
  ok('тренування переїжджає на нову дату', got(one.id).start === to.toISOString());

  /* групове рухається цілком, інакше учасники розсипались би по днях */
  const mate = T.Act.joinSession(one.id, c4.id);
  const to2 = new Date(Date.now() + 5 * 86400000);
  T.Act.moveSession(mate.id, to2);
  ok('групове переноситься разом з усіма',
     got(one.id).start === to2.toISOString() && got(mate.id).start === to2.toISOString());
  T.Act.delClient(c3.id); T.Act.delClient(c4.id);
}

/* часткова оплата боргу */
{
  const c2 = T.Act.addClient({name: 'Боржник Тестовий'});
  const mk = daysBack => {
    const at = new Date(Date.now() - daysBack * 86400000).toISOString();
    const x = T.Act.addSession({clientId: c2.id, price: 800, start: at});
    T.Act.complete(x.id, false);
    return x;
  };
  const d1 = mk(9), d2 = mk(5), d3 = mk(2);
  const debt = () => T.clientStats(T.Store.state, c2.id).debt;
  ok('борг рахується сумою тренувань', debt() === 2400, T.money(debt()));

  T.Act.payClient(c2.id, 1000);
  const after = id => T.Store.state.sessions.find(x => x.id === id);
  ok('часткова оплата зменшує борг на віддане', debt() === 1400, T.money(debt()));
  ok('гаситься найстаріше', after(d1.id).paid === true);
  ok('решта лягає часткою на наступне', after(d2.id).paid === false && after(d2.id).paidPart === 200);
  ok('до якого не дійшло — не чіпаємо', (after(d3.id).paidPart || 0) === 0);

  /* на цьому тренуванні лишалось 600, а не 200 — частку добиваємо саме нею */
  T.Act.payClient(c2.id, 600);
  ok('добиваємо частку до кінця', after(d2.id).paid === true && debt() === 800,
     T.money(debt()));

  T.Act.payClient(c2.id);
  ok('без суми закривається весь борг', debt() === 0);
  T.Act.delClient(c2.id);
}

/* дописати клієнта в уже створене тренування */
{
  const a = T.Act.addClient({name: 'Учасник Один'});
  const b = T.Act.addClient({name: 'Учасник Два'});
  const base = T.Act.addSession({clientId: a.id, price: 700, start: new Date().toISOString(), paid: true});
  const mate = T.Act.joinSession(base.id, b.id);
  const now0 = T.Store.state.sessions;
  const first = now0.find(x => x.id === base.id);
  ok('одиночне стає груповим', !!mate && !!first.groupId && mate.groupId === first.groupId);
  ok('новий учасник ще не платив', mate.paid === false && mate.subId === null);
  ok('оплата першого не чіпається', first.paid === true);
  ok('ціна й час беруться з тренування', mate.price === 700 && mate.start === first.start);
  ok('двічі того самого не додати', T.Act.joinSession(base.id, b.id) === null);
  ok('самого себе не додати', T.Act.joinSession(base.id, a.id) === null);
  T.Act.delClient(a.id); T.Act.delClient(b.id);
}

/* групове тренування показується однією подією, а не трьома рядками */
{
  const at = new Date().toISOString();
  const g = [{id:'a', groupId:'g1', start:at}, {id:'b', groupId:'g1', start:at},
             {id:'c', start:at}, {id:'d', groupId:'g1', start:at}];
  const rows = T.byGroup(g);
  ok('група склеюється в один рядок', rows.length === 2, rows.length + ' рядки');
  ok('усі учасники лишаються всередині', rows[0].length === 3 && rows[1].length === 1);
  ok('порядок подій зберігається', rows[0][0].id === 'a' && rows[1][0].id === 'c');
}

/* серія: знімаємо тільки заплановане попереду, історію не чіпаємо */
const rep = 'rep_test';
const DAY_MS = 86400000;
const back = new Date(Date.now() - 7 * DAY_MS).toISOString();
const soon = new Date(Date.now() + 7 * DAY_MS).toISOString();
const later = new Date(Date.now() + 14 * DAY_MS).toISOString();
const past = T.Act.addSession({clientId: c.id, price: 800, start: back, repeatId: rep, status: 'done'});
T.Act.addSession({clientId: c.id, price: 800, start: soon, repeatId: rep});
T.Act.addSession({clientId: c.id, price: 800, start: later, repeatId: rep});
T.Act.delSeries(rep, Date.now());
const rest = T.Store.state.sessions.filter(x => x.repeatId === rep);
ok('серія знімається одним дотиком', rest.length === 1 && rest[0].id === past.id,
   rest.length + ' лишилось');
ok('проведене з серії лишається в історії', rest[0].status === 'done');

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

part('доступ: пробний період');
{
  const day = 86400000;
  const setTrial = daysAgo => { const m = T.Disk.readMeta() || {}; T.Disk.writeMeta({...m, access: {trialStartedAt: Date.now() - daysAgo * day, status: 'trial'}}); };

  T.Disk.writeMeta({});                              /* новий кабінет */
  ok('до старту доступ не блокується', T.Access.state().kind === 'TRIAL_NOT_STARTED' && T.Access.allowed());
  T.Access.startTrial();
  let a = T.Access.state();
  ok('пробний стартував на 14 днів', a.kind === 'TRIAL_ACTIVE' && a.left === T.TRIAL_DAYS, a.left + ' днів');
  const startedAt = T.Access.read().trialStartedAt;
  T.Access.startTrial();
  ok('повторний старт не подовжує пробний', T.Access.read().trialStartedAt === startedAt);

  setTrial(1);  ok('день 1 — повний доступ', T.Access.state().allowed && T.Access.state().left === 13, T.Access.state().left + ' днів');
  setTrial(7);  ok('день 7 — залишилось 7', T.Access.state().left === 7);
  setTrial(13); ok('день 13 — залишився 1 день', T.Access.state().left === 1);
  setTrial(14);
  a = T.Access.state();
  ok('день 14 — пробний завершено', a.kind === 'TRIAL_EXPIRED' && !a.allowed);
  ok('дані після завершення на місці', T.Store.state.clients.length > 0 && T.Store.state.sessions.length > 0,
     T.Store.state.clients.length + ' клієнтів');
}

part('доступ: підписка');
{
  const day = 86400000;
  T.IAP.demo.fail = false;
  const r = await T.Access.purchase('quarterly');
  let a = T.Access.state();
  ok('покупка активувала підписку', r.ok && a.kind === 'SUBSCRIPTION_ACTIVE' && a.allowed);
  ok('строк — рівно 3 місяці', a.until - Date.now() > 87 * day && a.until - Date.now() < 93 * day,
     Math.round((a.until - Date.now()) / day) + ' днів');
  ok('дата продовження — те саме число місяця', new Date(a.until).getDate() === new Date().getDate(),
     new Date(a.until).toISOString().slice(0, 10));
  ok('план записаний', T.Access.read().plan === 'quarterly' && T.Access.read().productId === 'pro_trainer_quarterly');

  const was = T.Access.read().expiresAt;
  await T.Access.purchase('monthly');
  ok('продовження додається до чинного строку', T.Access.read().expiresAt > was + 25 * day,
     Math.round((T.Access.read().expiresAt - was) / day) + ' днів зверху');

  T.Access.cancel();
  a = T.Access.state();
  ok('після скасування доступ лишається до дати', a.kind === 'SUBSCRIPTION_CANCELLED' && a.allowed);
  T.Access.resume();
  ok('автопродовження можна повернути', T.Access.state().kind === 'SUBSCRIPTION_ACTIVE');

  T.Access.write({expiresAt: Date.now() - day});
  a = T.Access.state();
  ok('після дати — потрібне продовження', a.kind === 'SUBSCRIPTION_EXPIRED' && !a.allowed);
  ok('дані підписка не чіпає', T.Store.state.clients.length > 0);
}

part('доступ: відновлення, помилка, офлайн');
{
  const day = 86400000;
  const m = T.Disk.readMeta() || {};
  T.Disk.writeMeta({...m, access: {}});               /* ніби перевстановили застосунок */
  ok('після перевстановлення доступу немає', !T.Access.state().allowed || T.Access.state().kind === 'TRIAL_NOT_STARTED');
  const rest = await T.Access.restore();
  ok('покупка відновлюється з магазину', rest.ok && T.Access.state().kind === 'SUBSCRIPTION_ACTIVE',
     T.Access.state().kind);

  T.Access.write({plan: null, expiresAt: 0, status: null});
  T.IAP.demo.fail = true;
  const bad = await T.Access.purchase('monthly');
  const af = T.Access.state();
  ok('невдала оплата не ламає акаунт', !bad.ok && af.kind === 'PAYMENT_FAILED' && !af.allowed, af.kind);
  ok('дані після невдалої оплати на місці', T.Store.state.clients.length > 0);
  T.IAP.demo.fail = false;
  const retry = await T.Access.purchase('monthly');
  ok('повторна спроба спрацювала', retry.ok && T.Access.state().kind === 'SUBSCRIPTION_ACTIVE');

  const online = ctx.navigator.onLine;
  ctx.navigator.onLine = false;
  const v = await T.Access.verify();
  ok('без мережі доступ не блокується', v.offline === true && T.Access.state().allowed);
  ctx.navigator.onLine = online;

  T.Access.write({trialStartedAt: Date.now() - 3 * day});
  T.Disk.clear();
  ok('очищення даних не дає новий пробний період', !!(T.Disk.readMeta() || {}).access.trialStartedAt);
}

part('сховище переживає очищення WebView');
{
  const native = new Map();
  ctx.window.Capacitor = {getPlatform: () => 'ios', Plugins: {Preferences: {
    async get({key}){ return {value: native.has(key) ? native.get(key) : null}; },
    async set({key, value}){ native.set(key, value); },
    async remove({key}){ native.delete(key); },
  }}};
  T.Box.cache.clear();

  T.Store.init(T.seedDB({name: 'Олександр'}));
  T.Act.addClient({name: 'Після очищення'});
  await new Promise(r => setTimeout(r, 30));
  ok('база пишеться і в нативне сховище', native.has('protrainer.v1'), [...native.keys()].join(', '));

  ctx.localStorage.removeItem('protrainer.v1');       /* система звільнила місце у WebView */
  T.Box.cache.clear();
  await T.Disk.hydrate();
  const back = JSON.parse(T.Disk.readRaw() || 'null');
  ok('дані повертаються з нативного сховища', !!back && back.clients.some(c => c.name === 'Після очищення'),
     back ? back.clients.length + ' клієнтів' : 'порожньо');
  ok('копія повернулась і в localStorage', !!ctx.localStorage.getItem('protrainer.v1'));

  T.Access.write({trialStartedAt: Date.now() - 5 * 86400000});
  await new Promise(r => setTimeout(r, 30));
  ctx.localStorage.removeItem('protrainer.v1.meta');
  T.Box.cache.clear();
  await T.Disk.hydrate();
  ok('пробний період не скидається після очищення', !!(T.Disk.readMeta() || {}).access.trialStartedAt);

  delete ctx.window.Capacitor;
  T.Box.cache.clear();
  ok('без Capacitor працює як раніше', !T.Box.native() && !!T.Disk.readRaw());
}

part('сховище переповнене');
{
  /* Квота localStorage — 5 МБ на весь кабінет. Раніше запис просто не
     відбувався, і тренер дізнавався про втрату, лише відкривши застосунок
     наступного дня. Тепер про це кажуть уголос — і рівно один раз. */
  T.Box.cache.clear();
  T.Store.init(T.seedDB({name: 'Олександр'}));
  T.Toaster.list = [];
  T.Store.warned = false;
  const real = ctx.localStorage.setItem;
  ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  T.Act.addClient({name: 'Не влізе'});
  await new Promise(r => setTimeout(r, 30));
  const said = T.Toaster.list.filter(x => x.kind === 'bad');
  ok('переповнення не проходить мовчки', said.length === 1, said.length ? said[0].text : 'тиші');
  T.Act.addClient({name: 'І цей не влізе'});
  await new Promise(r => setTimeout(r, 30));
  ok('попереджаємо один раз, а не на кожен дотик',
     T.Toaster.list.filter(x => x.kind === 'bad').length === 1);
  ctx.localStorage.setItem = real;
  T.Act.addClient({name: 'А цей влізе'});
  await new Promise(r => setTimeout(r, 30));
  ok('після звільнення місця запис іде далі', !!ctx.localStorage.getItem('protrainer.v1') && !T.Store.warned);
}

part('фото клієнта');
{
  ok('стеля ваги фото розумна', T.PHOTO.side <= 512 && T.PHOTO.budget <= 64 * 1024,
     T.PHOTO.side + ' px, до ' + Math.round(T.PHOTO.budget / 1024) + ' КБ');
  ok('великий файл навіть не декодуємо',
     await T.Photo.fromFile({type: 'image/jpeg', size: 20 * 1024 * 1024}).then(() => false, e => e.message === 'big'));
  ok('не-зображення відхиляється',
     await T.Photo.fromFile({type: 'application/pdf', size: 1000}).then(() => false, e => e.message === 'type'));
  ok('без фото нічого не перероблюємо', (await T.Photo.shrinkStored()) === 0);
}

part('нагадування наперед');
{
  const box = {scheduled: [], cancelled: []};
  ctx.window.Capacitor = {getPlatform: () => 'ios', Plugins: {LocalNotifications: {
    async requestPermissions(){ return {display: 'granted'}; },
    async schedule({notifications}){ box.scheduled.push(...notifications); },
    async cancel({notifications}){ box.cancelled.push(...notifications.map(n => n.id)); },
  }}};
  T.Box.cache.clear();

  const base = T.emptyDB();
  T.Store.init({...base, onboarded: true, settings: {...base.settings, notif: {...base.settings.notif, before: [60, 15]}}});
  const cl = T.Act.addClient({name: 'Завтрашній Клієнт'});
  const at = new Date(Date.now() + 26 * 3600 * 1000);
  const ses = T.Act.addSession({clientId: cl.id, start: at.toISOString(), price: 800});

  ok('оболонка бачить плагін', T.Notifier.native());
  const plan = T.Notifier.plan(T.Store.state);
  ok('на кожен інтервал своє нагадування', plan.length === 2, plan.length + ' шт.');
  ok('час порахований від початку тренування',
     Math.round((+at - +plan[0].at) / 60000) === 60 && Math.round((+at - +plan[1].at) / 60000) === 15,
     plan.map(x => Math.round((+at - +x.at) / 60000) + ' хв').join(', '));
  ok('у тексті ім’я клієнта і час', plan[0].body.includes('Завтрашній') && /\d{2}:\d{2}/.test(plan[0].body), plan[0].body);
  ok('id стабільний і числовий', plan.every(x => Number.isInteger(x.id) && x.id > 0) &&
     plan[0].id === T.Notifier.id(ses.id, 60));

  const r = await T.Notifier.sync(T.Store.state);
  ok('розклад відданий у систему', r.ok && box.scheduled.length === 2, box.scheduled.length + ' заплановано');

  T.Act.cancel(ses.id);
  box.scheduled = [];
  const r2 = await T.Notifier.sync(T.Store.state);
  ok('скасоване тренування знімається з розкладу', r2.ok && box.scheduled.length === 0 && box.cancelled.length === 2,
     'знято ' + box.cancelled.length);

  const far = T.Act.addSession({clientId: cl.id, start: new Date(Date.now() + 45 * 86400000).toISOString(), price: 800});
  ok('далі місяця наперед не плануємо — розклад ще зміниться', T.Notifier.plan(T.Store.state).length === 0);
  T.Act.delSession(far.id);

  /* Бюджет. iOS тримає не більше 64 запланованих на застосунок, тож
     головне питання не «як далеко», а «на що витратити слоти». */
  const DAY_MS = 86400000;
  const busy = [];
  for (let d = 0; d < 30; d++) for (let h = 0; h < 6; h++){
    const when = new Date(Date.now() + d * DAY_MS);
    when.setHours(8 + h * 2, 0, 0, 0);
    if (+when > Date.now()) busy.push(T.Act.addSession({clientId: cl.id, start: when.toISOString(), price: 800}));
  }
  const big = T.Notifier.plan(T.Store.state);
  const cov = T.Notifier.coverage(T.Store.state);
  ok('у ліміт вкладаємось', big.length <= 57, big.length + ' сповіщень');
  const days = (cov.until - Date.now()) / DAY_MS;
  /* раніше два інтервали на кожне тренування з'їдали бюджет за 5 днів */
  ok('розклад тягнеться далеко за п’ять днів', days > 7, days.toFixed(1) + ' дн.');
  ok('чесно кажемо, що розклад обрізаний', cov.truncated === true);
  const refresh = big.filter(x => x.body.indexOf('Відкрийте застосунок') >= 0);
  ok('останнім — нагадування відкрити застосунок', refresh.length === 1, refresh.length + ' шт.');
  ok('воно стоїть після останнього покритого тренування', +refresh[0].at > cov.until);

  /* найближчим тренуванням другий інтервал усе одно дістається */
  const soonest = busy.filter(x => +new Date(x.start) < Date.now() + 2 * DAY_MS);
  const twice = soonest.filter(x => big.some(n => n.id === T.Notifier.id(x.id, 60)) &&
                                    big.some(n => n.id === T.Notifier.id(x.id, 15)));
  ok('найближчі тренування зберігають обидва інтервали', twice.length >= Math.min(3, soonest.length),
     twice.length + ' з ' + soonest.length);

  /* а коли тренувань мало — ніяких обрізань і зайвих нагадувань */
  busy.forEach(x => T.Act.delSession(x.id));
  const calm = T.Act.addSession({clientId: cl.id, start: new Date(Date.now() + 3 * DAY_MS).toISOString(), price: 800});
  const small = T.Notifier.plan(T.Store.state);
  ok('вільний розклад — обидва інтервали й без зайвих нагадувань',
     small.length === 2 && !T.Notifier.coverage(T.Store.state).truncated, small.length + ' шт.');
  T.Act.delSession(calm.id);

  delete ctx.window.Capacitor;
  T.Box.cache.clear();
  ok('без оболонки лишається браузерний режим', !T.Notifier.native());
}

part('доступ: міст до магазину');
{
  const day = 86400000;
  const until = Date.now() + 200 * day;
  ctx.window.ProTrainerIAP = {
    platform: 'ios',
    async buy(productId){ return {ok:true, transactionId:'tx_native', ts:Date.now(), expiresAt: until}; },
    async restore(){ return {ok:true, purchases:[{productId:'pro_trainer_yearly', transactionId:'tx_native', ts:Date.now(), expiresAt: until}]}; },
    async status(){ return {ok:true, active:true, productId:'pro_trainer_yearly', expiresAt: until, autoRenew:false}; },
  };
  ok('міст видно застосунку', T.IAP.connected() && T.IAP.platform() === 'ios');
  await T.Access.purchase('yearly');
  ok('строк береться з магазину, а не рахується', T.Access.read().expiresAt === until,
     Math.round((T.Access.read().expiresAt - Date.now()) / day) + ' днів');
  await T.Access.verify();
  ok('статус із магазину підхоплюється', T.Access.state().kind === 'SUBSCRIPTION_CANCELLED',
     T.Access.state().kind);
  T.Access.write({expiresAt: 0, plan: null, status: null, autoRenew: true});
  const rr = await T.Access.restore();
  ok('відновлення через міст', rr.ok && T.Access.read().productId === 'pro_trainer_yearly');
  delete ctx.window.ProTrainerIAP;
  ok('без моста повертаємось у демо-режим', !T.IAP.connected() && T.IAP.platform() === 'demo');
}

const CH_Q = String.fromCharCode(34);
part('графіки на великій базі');
{
  /* Точки графіка тепер беруться з кошиків, а не рахуються через stats()
     на кожен день. Перевіряємо, що вони дають ті самі числа — інакше
     пришвидшення виявилось би підміною. */
  const db = T.seedDB({name: 'Олександр'});
  T.Store.init(db);
  const [from, to] = T.periodOf({kind: 'month'});
  const box = T.netByBucket(db, from, to, false);
  let same = 0, diff = null;
  for (let d = new Date(from); +d < +to; d = T.addDays(d, 1)){
    const mine = box.get(T.iso(d)) || 0;
    const slow = T.stats(db, d, T.addDays(d, 1)).net;
    if (mine === slow) same++; else if (!diff) diff = T.iso(d) + ': ' + mine + ' проти ' + slow;
  }
  ok('по днях сходиться з повним підрахунком', !diff, diff || same + ' днів');

  const [yf, yt] = T.periodOf({kind: 'year'});
  const months = T.netByBucket(db, yf, yt, true);
  const year = T.stats(db, yf, yt).net;
  const sumMonths = [...months.values()].reduce((a, x) => a + x, 0);
  ok('сума місяців дорівнює року', sumMonths === year, sumMonths + ' проти ' + year);

  /* сесії поза періодом у кошики не потрапляють */
  const before = T.netByBucket(db, from, to, false).size;
  T.Act.addSession({clientId: db.clients[0].id, start: new Date(+from - 40 * 86400000).toISOString(), price: 800});
  ok('чуже минуле в період не залазить', T.netByBucket(T.Store.state, from, to, false).size === before);
}

part('юридичні документи');
{
  /* Магазини перевіряють, що документи справжні, а не заглушка. */
  const docs = T.LEGAL_DOCS;
  ok('реквізити підставлені, а не плейсхолдер',
     !/\[НАЗВА|\[EMAIL|\[САЙТ/.test(JSON.stringify(docs)) && T.LEGAL.company.length > 3,
     T.LEGAL.company + ' · ' + T.LEGAL.email);
  ok('обидва документи на місці', docs.terms.blocks.length >= 10 && docs.privacy.blocks.length >= 10,
     docs.terms.blocks.length + ' і ' + docs.privacy.blocks.length + ' розділів');
  /* те, чого магазини й закон вимагають прямо */
  const all = JSON.stringify(docs);
  [['автопродовження', /автопродовження/], ['повернення коштів', /поверн/], ['вік користувача', /18 років/],
   ['право, що застосовується', /законодавство України/], ['видалення даних', /видал/],
   ['підстава обробки', /виконання договору/]].forEach(([what, re]) =>
    ok('згадано: ' + what, re.test(all)));

  /* розділ із кількох абзаців має показуватись абзацами, а не суцільним текстом */
  const multi = docs.terms.blocks.find(b => b[1].indexOf('\n\n') > 0);
  ok('є розділи з кількох абзаців', !!multi, multi ? multi[0] : 'немає');
  const tx = textOf(el(T.Legal, {params: {doc: 'terms'}, onClose(){}}));
  ok('на екрані видно обидва абзаци',
     multi && multi[1].split('\n\n').every(par => tx.indexOf(par.slice(0, 40)) >= 0));
  ok('переносів рядків на екрані не лишилось', tx.indexOf('\n\n') < 0);
}

part('вивантаження фінансів');
{
  T.Box.cache.clear();
  const db = T.seedDB({name: 'Олександр'});
  T.Store.init(db);
  /* рік, а не місяць: у демо абонементи куплені 3–4 тижні тому і в
     поточний місяць не потрапляють, а перевірити треба саме їх */
  const [from, to] = T.periodOf({kind: 'year'});
  const st = T.stats(db, from, to);
  const text = T.financeCsv(db, from, to);
  const lines = text.replace(/^\ufeff/, '').trim().split('\r\n');
  /* розбір рядка з урахуванням лапок */
  const cells = ln => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < ln.length; i++){
      const ch = ln[i];
      if (q){ if (ch === CH_Q && ln[i+1] === CH_Q){ cur += CH_Q; i++; } else if (ch === CH_Q) q = false; else cur += ch; }
      else if (ch === CH_Q) q = true;
      else if (ch === ';'){ out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const cell = (ln, i) => cells(ln)[i];
  const num = v => Number(String(v || '0').replace(/[^0-9-]/g, '')) || 0;

  ok('файл починається з BOM — інакше Excel зіпсує кирилицю', text.charCodeAt(0) === 0xFEFF);
  ok('перший рядок — заголовки', lines[0].startsWith('Дата;'), lines[0].slice(0, 40));
  const moves = st.count
    + db.sales.filter(x => T.inRange(x.ts, from, to)).length
    + db.subs.filter(x => T.inRange(x.ts, from, to)).length;
  /* заголовок + рухи + два підсумкові рядки (другий — куплені абонементи) */
  const feet = st.subsSold ? 2 : 1;
  ok('рядків стільки ж, скільки рухів грошей', lines.length === moves + 1 + feet,
     lines.length + ' рядків на ' + moves + ' рухів');
  const body = lines.slice(1, -feet);
  ok('рядки відсортовані за датою', body.every((l, i, a) => !i || cell(a[i-1], 0) <= cell(l, 0)));
  const subs = body.filter(l => cell(l, 2) === 'Абонемент');
  ok('покупка абонемента є у файлі', subs.length > 0, subs.length + ' шт.');
  ok('але в дохід вона не входить', subs.every(l => cell(l, 9) === 'ні'));
  ok('і в «Чистими» у неї нуль', subs.every(l => num(cell(l, 7)) === 0));
  const fromSub = body.filter(l => cell(l, 8) === 'З абонемента');
  ok('тренування з абонемента, навпаки, в доході',
     fromSub.length > 0 && fromSub.every(l => cell(l, 9) === 'так'), fromSub.length + ' шт.');

  const counted = body.filter(l => cell(l, 9) === 'так');
  const sumNet = counted.reduce((a, l) => a + num(cell(l, 7)), 0);
  ok('сума «Чистими» по рядках сходиться з екраном «Фінанси»', sumNet === st.total, sumNet + ' проти ' + st.total);
  const totalRow = lines[lines.length - feet];
  ok('підсумковий рядок теж сходиться', cell(totalRow, 0) === 'Разом' && num(cell(totalRow, 7)) === st.total, cell(totalRow, 7));
  /* стовпець «Сума» має сходитись, якщо скласти обидва підсумки */
  const subRow = lines[lines.length - 1];
  ok('куплені абонементи виведені окремим підсумком',
     cell(subRow, 0) === 'Абонемент' && num(cell(subRow, 5)) === st.subsSold, cell(subRow, 5));
  const colSum = body.reduce((a, l) => a + num(cell(l, 5)), 0);
  ok('сума стовпця «Сума» = обидва підсумки разом',
     colSum === num(cell(totalRow, 5)) + num(cell(subRow, 5)), colSum + ' = ' + cell(totalRow, 5) + ' + ' + cell(subRow, 5));

  /* кома й лапки в імені не мають розсунути стовпці */
  T.Act.addClient({name: 'Іванов, Іван ' + CH_Q + 'Залізний' + CH_Q});
  const c = T.Store.state.clients.find(x => x.name.indexOf(',') > 0);
  T.Act.addSession({clientId: c.id, start: new Date().toISOString(), price: 800});
  const risky = T.financeCsv(T.Store.state, from, to).split('\r\n').find(l => l.indexOf('Іванов') >= 0);
  ok('кома й лапки в імені екрануються',
     cells(risky).length === 10 && cell(risky, 3) === c.name, cells(risky).length + ' стовпців');

  /* англійська локаль — інший роздільник, інакше Excel зліпить усе в один стовпець */
  T.I18n.set('en');
  const en = T.financeCsv(db, from, to).split('\r\n')[0];
  ok('для англійської роздільник — кома', en.indexOf('Date,Time,Type') >= 0, en.slice(0, 30));
  T.I18n.set('uk');

  /* порожній період не має ламатись */
  const [ef, et] = T.periodOf({kind: 'custom', from: '2019-01-01', to: '2019-01-07'});
  const empty = T.financeCsv(db, ef, et).replace(/^\ufeff/, '').trim().split('\r\n');
  ok('порожній період дає заголовки й нулі', empty.length === 2 && num(cell(empty[1], 7)) === 0, empty.length + ' рядки');
}

part('оплата на сайті');
{
  /* Застосунок не бачить карток: він відкриває сторінку оплати і потім
     питає сервер, чи з'явилась ліцензія. Тут сервер — заглушка. */
  const calls = [];
  let licence = {ok: true, active: false};
  ctx.fetch = async url => { calls.push(String(url)); return {ok: true, json: async () => licence}; };

  T.Box.cache.clear();
  T.Disk.writeMeta({account: {login: 'trainer@mail.com', kind: 'email'}, access: {}});
  T.Store.init(T.seedDB({name: 'Олександр'}));

  ok('кнопка вмикається, коли є домен', T.Web.enabled(), T.Web.base());

  /* Нативна оболонка на Android відкриває WebView на https://localhost —
     якщо взяти цю адресу за домен, кнопка поведе в нікуди. Поки домен
     не заданий, кнопки не має бути взагалі. */
  const realBase = T.WEB.base;
  ctx.window.Capacitor = {getPlatform: () => 'android', Plugins: {}};
  T.WEB.base = '';
  ok('у нативній збірці без домену кнопки немає', !T.Web.enabled(), T.Web.base() || 'порожньо');
  T.WEB.base = 'https://pro-trainer.test';
  ok('із заданим доменом кнопка працює і в нативній', T.Web.base() === 'https://pro-trainer.test');
  T.WEB.base = '';
  delete ctx.window.Capacitor;
  ok('без заданого домену у вебі береться адреса сторінки', T.Web.base() === 'https://protrainer.test', T.Web.base());
  T.WEB.base = realBase;
  ok('заданий домен головніший за адресу сторінки', T.Web.base() === realBase, T.Web.base());
  const url = T.Web.payUrl('yearly');
  ok('у посилання їде план, логін і пристрій',
     url.includes('plan=yearly') && url.includes('trainer%40mail.com') && /device=dev_/.test(url), url.slice(0, 80));
  ok('ідентифікатор пристрою сталий', T.Web.device() === T.Web.device(), T.Web.device());
  const dev = T.Web.device();
  T.Disk.clear();
  ok('очищення даних не з’їдає слот пристрою', T.Web.device() === dev);

  T.Disk.writeMeta({...(T.Disk.readMeta() || {}), account: {login: 'trainer@mail.com', kind: 'email'}});
  ok('ціни на сайті нижчі за магазинні', T.PLANS.every(p => p.web < p.price),
     T.PLANS.map(p => '$' + p.web + '<' + p.price).join(', '));

  /* оплата ще не пройшла → доступу немає */
  const nope = await T.Access.awaitWeb(() => false);
  ok('поки оплати немає — доступ не видаємо', !nope.ok);

  /* сервер підтвердив ліцензію */
  const until = Date.now() + 300 * 86400000;
  licence = {ok: true, active: true, plan: 'yearly', expiresAt: until, autoRenew: true, orderId: 'pt_1'};
  const got = await T.Access.awaitWeb(() => true);
  const st = T.Access.state();
  ok('ліцензія з сайту вмикає доступ', got.ok && st.kind === 'SUBSCRIPTION_ACTIVE', st.kind);
  ok('джерело записано як web', T.Access.read().source === 'web');
  ok('строк узятий із сервера, а не порахований', T.Access.read().expiresAt === until);

  /* перевірка статусу йде на сайт, а не в магазин */
  calls.length = 0;
  await T.Access.verify();
  ok('статус веб-підписки питаємо в сервера', calls.some(u => u.includes('/api/licence')), calls[0]);

  /* сервер каже, що підписки більше немає */
  licence = {ok: true, active: false};
  await T.Access.verify();
  ok('коли сервер каже «неактивна» — доступ закінчується',
     T.Access.state().kind === 'SUBSCRIPTION_EXPIRED', T.Access.state().kind);

  /* відновлення на новому пристрої */
  licence = {ok: true, active: true, plan: 'monthly', expiresAt: Date.now() + 20 * 86400000, autoRenew: true};
  calls.length = 0;
  const back = await T.Access.restore();
  ok('«Відновити покупку» спершу питає сайт', back.ok && calls.some(u => u.includes('/api/claim')), calls[0]);

  /* ліміт пристроїв доїжджає до застосунку окремою помилкою */
  licence = {ok: true, active: false, error: 'device_limit'};
  T.IAP.demoWrite(null);
  const limit = await T.Access.restore();
  ok('ліміт пристроїв повертається окремою помилкою', limit.error === 'device_limit', limit.error);

  /* без мережі нічого не ламається */
  ctx.fetch = async () => { throw new Error('offline'); };
  const off = await T.Web.licence();
  ok('без зв’язку з сервером просто немає відповіді', off.ok === false && off.error === 'network');
  ctx.fetch = async () => ({ok: true, json: async () => licence});
}

part('пробний період не переживає перевстановлення');
{
  /* Раніше дата старту лежала тільки на пристрої: видалив застосунок —
     отримав нові 14 днів. Тепер її пам'ятає сервер. */
  const DAY = 86400000;
  let trial = {ok: true, started: false};
  const asked = [];
  ctx.fetch = async url => {
    asked.push(String(url));
    return {ok: true, json: async () => (String(url).includes('/api/trial') ? trial : {ok: true, active: false})};
  };

  T.Box.cache.clear();
  T.Disk.writeMeta({account: {login: 'trainer@mail.com', kind: 'email'}, access: {}});
  T.Store.init(T.seedDB({name: 'Олександр'}));

  T.Access.startTrial();
  ok('пробний період починається локально, не чекаючи сервера',
     T.Access.state().kind === 'TRIAL_ACTIVE', T.Access.state().kind);
  await new Promise(r => setTimeout(r, 20));
  ok('серверу сказали, що пробний почався', asked.some(u => u.includes('/api/trial') && u.includes('start=1')), asked[0]);

  /* сервер пам'ятає, що насправді все почалось 10 днів тому */
  const real = Date.now() - 10 * DAY;
  trial = {ok: true, started: true, startedAt: real, endsAt: real + 14 * DAY, expired: false};
  await T.Access.verify();
  ok('дата з сервера головніша за локальну', T.Access.read().trialStartedAt === real);
  ok('лишилось 4 дні, а не 14', T.Access.state().left === 4, T.Access.state().left + ' дн.');

  /* підсунути пізнішу дату й подовжити собі пробний не вийде */
  trial = {ok: true, started: true, startedAt: Date.now(), endsAt: Date.now() + 14 * DAY, expired: false};
  await T.Access.verify();
  ok('пізнішою датою пробний не подовжується', T.Access.read().trialStartedAt === real);

  /* ось воно: перевстановлення — локальних даних немає, логін той самий */
  T.Disk.clear();
  T.Box.cache.clear();
  T.Disk.writeMeta({account: {login: 'trainer@mail.com', kind: 'email'}, access: {}});
  ok('після перевстановлення локальної дати немає', !T.Access.read().trialStartedAt);
  trial = {ok: true, started: true, startedAt: real, endsAt: real + 14 * DAY, expired: false};
  await T.Access.verify();
  ok('сервер повертає ту саму дату — нових 14 днів немає',
     T.Access.state().kind === 'TRIAL_ACTIVE' && T.Access.state().left === 4, T.Access.state().left + ' дн.');

  /* а якщо пробний уже вигорів — одразу вибір плану */
  const long = Date.now() - 30 * DAY;
  trial = {ok: true, started: true, startedAt: long, endsAt: long + 14 * DAY, expired: true};
  await T.Access.verify();
  ok('вигорілий пробний не перезапускається', T.Access.state().kind === 'TRIAL_EXPIRED', T.Access.state().kind);

  /* найважливіше: без мережі застосунок працює як раніше */
  ctx.fetch = async () => { throw new Error('offline'); };
  T.Box.cache.clear();
  T.Disk.writeMeta({account: {login: 'trainer@mail.com', kind: 'email'}, access: {}});
  T.Access.startTrial();
  await T.Access.verify();
  ok('без сервера пробний період усе одно працює',
     T.Access.state().kind === 'TRIAL_ACTIVE' && T.Access.state().allowed, T.Access.state().kind);
  ctx.fetch = async () => ({ok: true, json: async () => ({ok: true, active: false})});
}

part('доступ: екрани');
screen('вступ до пробного періоду', () => el(T.TrialIntro, {onStart(){}}));
screen('вибір плану (після пробного)', () => el(T.Paywall, {mode: 'gate'}));
screen('вибір плану (з профілю)', () => el(T.Paywall, {mode: 'page', onClose(){}}));
screen('керування підпискою', () => el(T.Subscription, {onClose(){}}));
screen('картка доступу в профілі', () => el(T.AccessCard, {}));
ok('усі три плани на місці', T.PLANS.length === 3 && T.PLANS.every(p => p.productId.indexOf('pro_trainer_') === 0),
   T.PLANS.map(p => p.productId + ' $' + p.price).join(', '));
ok('ціни саме ті', T.planById('monthly').price === 4.99 && T.planById('quarterly').price === 12.99 && T.planById('yearly').price === 49.99);

part('мови');
['uk', 'ru', 'en', 'pl'].forEach(l => {
  T.I18n.set(l);
  screen('головна · ' + l, () => el(T.Home, {loading: false}));
});
/* Кожен рядок у таблиці має всі чотири мови й ніде не лишився українським
   (крім слів, що збігаються в обох мовах — їх звіряємо окремо нижче). */
ok('таблиця перекладів заповнена',
   T.PHRASES.length > 500 && T.PHRASES.every(r => r.length === 4 && r.every(v => typeof v === 'string' && v.length)),
   T.PHRASES.length + ' фраз × 4 мови');
/* Скелет неперекладеного порожній: усе, що застосунок показав, перекладено. */
['ru', 'en', 'pl'].forEach(l => {
  const gap = T.I18n.missing(l);
  ok('без пропусків · ' + l, Object.keys(gap).length === 0,
     Object.keys(gap).length ? Object.keys(gap).slice(0, 3).join(' | ') : 'усі ' + T._seen.size + ' рядків на місці');
});
/* Переклад справді підставляється — і за ключем, і за самим текстом. */
const say = (l, key, uk) => { T.I18n.set(l); return T.t(key, uk); };
ok('переклад за ключем', say('ru', 'nav.clients', 'Клієнти') === 'Клиенты'
   && say('en', 'nav.clients', 'Клієнти') === 'Clients'
   && say('pl', 'nav.clients', 'Клієнти') === 'Klienci',
   ['ru', 'en', 'pl'].map(l => say(l, 'nav.clients', 'Клієнти')).join(' · '));
ok('переклад за текстом, без заведеного ключа',
   say('en', 'ключа.такого.нема', 'Зберегти') === 'Save'
   && say('pl', 'ключа.такого.нема', 'Зберегти') === 'Zapisz',
   ['ru', 'en', 'pl'].map(l => say(l, 'ключа.такого.нема', 'Зберегти')).join(' · '));
/* Один ключ у двох місцях із різними написами не має їх плутати. */
ok('текст із місця виклику головніший за ключ',
   say('en', 'subs.till', 'до') === 'until' && say('en', 'subs.till', 'Діє до') === 'Valid until',
   say('en', 'subs.till', 'до') + ' / ' + say('en', 'subs.till', 'Діє до'));
/* Точковий виняток: «Продовжити» біля абонемента — це «подовжити». */
ok('виняток за ключем головніший за таблицю',
   say('en', 'subs.renew', 'Продовжити') === 'Renew' && say('en', 'auth.go', 'Продовжити') === 'Continue',
   say('en', 'subs.renew', 'Продовжити') + ' / ' + say('en', 'auth.go', 'Продовжити'));
/* Дані, що лежать у базі українською, показуються мовою застосунку. */
T.I18n.set('pl');
ok('статуси, типи й цілі перекладаються',
   T.statusTitle('done') === 'Odbyty' && T.typeTitle('online') === 'Online' && T.goalTitle('Сила') === 'Siła',
   [T.statusTitle('done'), T.typeTitle('online'), T.goalTitle('Сила')].join(' · '));
/* Форми числа: у польській три, в англійській дві. */
T.I18n.set('pl');
const pl = [1, 2, 5].map(n => T.nSessions(n)).join(' · ');
T.I18n.set('en');
const en = [1, 2, 5].map(n => T.nSessions(n)).join(' · ');
ok('відмінювання по мовах', pl === '1 trening · 2 treningi · 5 treningów' && en === '1 session · 2 sessions · 5 sessions', pl + ' | ' + en);
/* Готові повідомлення клієнту теж перекладаються, підстановки лишаються. */
T.I18n.set('en');
const msg = T.fill(T.t('msg.debt.1', '{name}, доброго дня! Нагадую про оплату за тренування — {sum}. Дякую!'), {name:'Anna', sum:'800 ₴'});
ok('шаблон повідомлення перекладено й заповнено',
   msg.indexOf('Anna') === 6 && msg.includes('800 ₴') && !/[Ѐ-ӿ]/.test(msg), msg);
/* Місяць: «серпень», але «August». */
ok('назва місяця по-англійськи з великої', /^[A-Z]/.test(T.monthWord(new Date())), T.monthWord(new Date()));
T.I18n.set('uk');
ok('назва місяця українською з малої', /^[а-яіїєґ]/.test(T.monthWord(new Date())), T.monthWord(new Date()));
/* Застосунок відкривається українською, хай яка мова в телефоні. */
ok('мова за замовчуванням — українська', T.emptyDB().settings.lang === 'uk', T.emptyDB().settings.lang);
ok('усі мови з переліку доступні для вибору', T.LANGS.length === 4 && T.LANGS[0].code === 'uk',
   T.LANGS.map(l => l.code).join(', '));
T.I18n.set('uk');

part('дрібниці');
ok('відмінювання', T.nSessions(1) === '1 тренування' && T.nSessions(5) === '5 тренувань',
   [T.nSessions(1), T.nSessions(2), T.nSessions(5), T.nSessions(11)].join(' · '));
ok('телефонна маска', T.phoneMask('0631234567') === '+380 63 123 45 67', T.phoneMask('0631234567'));
ok('дата з великої літери', /^[А-ЯІЇЄҐ]/.test(T.fmtLong(new Date())), T.fmtLong(new Date()));

console.log('\n══════ ' + (checks - fails) + ' з ' + checks + (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
process.exit(fails ? 1 : 0);

})();
