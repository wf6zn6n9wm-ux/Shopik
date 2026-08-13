/* Спільна пісочниця для тестів Urok+.
   Джерела з src/ склеюються в тому ж порядку, що й у index.html,
   транспілюються (bun або @babel/standalone) і виконуються з
   заглушками React, localStorage і document. Так кожен екран
   реально викликається — без браузера й без збірки. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {webcrypto} = require('crypto');
const {spawnSync} = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/* Порядок беремо з index.html, а не з сортування файлів: якщо
   хтось додасть скрипт у розмітку й забуде тут — тест впаде. */
function sourceFiles(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const re = /<script type="text\/babel"[^>]*src="src\/([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  if (!out.length) throw new Error('в index.html не знайдено жодного src/*.js');
  out.forEach(f => {
    if (!fs.existsSync(path.join(SRC, f))) throw new Error('index.html посилається на неіснуючий src/' + f);
  });
  const onDisk = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
  onDisk.forEach(f => {
    if (!out.includes(f)) throw new Error(`src/${f} не підключений в index.html`);
  });
  return out;
}

function transpile(src){
  try {
    const babel = require('@babel/standalone');
    return babel.transform(src, {presets: ['react']}).code;
  } catch (e){
    if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urok-'));
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

/* ── заглушки середовища ───────────────────────────────────── */
function makeEnv(){
  const mem = new Map();
  const localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
    clear: () => mem.clear(),
  };
  const el = (type, props, ...children) => {
    const p = Object.assign({}, props);
    if (children.length) p.children = children.length === 1 ? children[0] : children;
    return {__el: true, type, props: p};
  };
  const React = {
    createElement: el,
    Fragment: 'Fragment',
    useState: v => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useRef: v => ({current: v === undefined ? null : v}),
    useReducer: (r, init) => [init, () => {}],
    useContext: c => (c && c._d),
    createContext: d => ({__ctx: true, _d: d}),
    memo: c => c,
  };
  const noop = () => {};
  const fakeNode = {
    style: {}, setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop,
    remove: noop, click: noop, querySelector: () => null, addEventListener: noop, removeEventListener: noop,
    scrollIntoView: noop,
  };
  const document = {
    documentElement: Object.assign({}, fakeNode),
    body: Object.assign({}, fakeNode),
    /* null — щоб застосунок не монтувався сам: у тестах ми рендеримо екрани вручну */
    getElementById: () => null,
    createElement: () => Object.assign({}, fakeNode),
    addEventListener: noop, removeEventListener: noop,
  };
  const window = {
    localStorage,
    matchMedia: () => ({matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop}),
    navigator: {language: 'uk-UA'},
    location: {href: '', protocol: 'https:'},
    history: {pushState: noop, back: noop, state: null},
    addEventListener: noop, removeEventListener: noop, open: noop,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  window.window = window;
  const sandbox = {
    window, document, localStorage, navigator: window.navigator, location: window.location,
    React, ReactDOM: {createRoot: () => ({render: noop})},
    console, crypto: webcrypto, Intl, Blob: class {}, URL: {createObjectURL: () => '', revokeObjectURL: noop},
    setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON,
  };
  sandbox.globalThis = sandbox;
  return sandbox;
}

function boot(){
  const files = sourceFiles();
  const src = files.map(f => `\n/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
  const code = transpile(src);
  const sandbox = makeEnv();
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {filename: 'urok-bundle.js'});
  return {U: sandbox.window.U, sandbox, files};
}

/* ── рендер дерева ─────────────────────────────────────────── */
function render(node, out, depth){
  out = out || {texts: [], types: [], count: 0};
  depth = depth || 0;
  if (depth > 90) throw new Error('надто глибоке дерево — схоже на рекурсію');
  if (node === null || node === undefined || node === false || node === true) return out;
  if (Array.isArray(node)) { node.forEach(n => render(n, out, depth + 1)); return out; }
  if (typeof node === 'string' || typeof node === 'number') { out.texts.push(String(node)); return out; }
  if (!node.__el) return out;
  out.count++;
  const {type, props} = node;
  if (typeof type === 'function'){
    out.types.push(type.name || 'anon');
    return render(type(props), out, depth + 1);
  }
  Object.keys(props).forEach(k => {
    if (k === 'children') return;
    const v = props[k];
    if (v && v.__el) render(v, out, depth + 1);
    else if (Array.isArray(v)) v.forEach(x => { if (x && x.__el) render(x, out, depth + 1); });
  });
  if (props.children !== undefined) render(props.children, out, depth + 1);
  return out;
}

module.exports = {boot, render, sourceFiles, ROOT, SRC};
