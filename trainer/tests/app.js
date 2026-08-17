/* Складання застосунку поза браузером.

   index.html — один файл із JSX усередині. Щоб перевіряти його тестами
   й малювати з нього скриншоти, потрібне те саме: витягти скрипт,
   транспілювати і виконати з заглушкою React. Тримаємо це в одному
   місці — інакше тести й генератор скриншотів збирали б застосунок
   по-різному, і знімки показували б не те, що перевірено.

   module.exports = {source, transpile, sandbox, EXPORTS, load}          */
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

const EXPORTS = `;globalThis.__T = {split, stats, seedDB, emptyDB, markDemo, periodRange, clientStats, clientFeed, isDebt,
  clientPrice, typedPrice, periodOf, periodLabel, deltaRange, RangeSheet, PeriodBar, iso, addDays,
  Access, IAP, PLANS, TRIAL_DAYS, planById, Disk, Box, Notifier, Paywall, TrialIntro, Subscription, AccessCard, AppGate, DAY,
  Store, Act, money, phoneMask, nSessions, fmtLong, I18n, ROUTES, Toaster, Photo, PHOTO, Web, WEB,
  financeCsv, Files, inRange, LEGAL, LEGAL_DOCS, Legal, netByBucket,
  PHRASES, LANGS, t, _seen, carryAccess, statusTitle, typeTitle, goalTitle, fill, monthWord, byGroup, bdIn, owed, Ic,
  Shell, Home, Calendar, Clients, Sales, Profile, Onboarding, Auth, Setup, PinLock};`;


/* застосунок, готовий до вжитку: {T, el} */
function load(){
  const {ctx, el} = sandbox();
  vm.runInContext(transpile(source()) + EXPORTS, ctx, {filename: 'protrainer.jsx'});
  return {T: ctx.__T, el, ctx};
}

module.exports = {source, transpile, sandbox, EXPORTS, load, ROOT};
