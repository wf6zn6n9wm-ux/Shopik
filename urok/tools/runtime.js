/* ══════════════════════════════════════════════════════════════════
   UROK+ · АВТОНОМНИЙ РАНТАЙМ
   ------------------------------------------------------------------
   Мінімальна заміна React + ReactDOM для однофайлової збірки
   (tools/bundle.js). Потрібна там, де сторінка не може ходити в
   мережу: прев'ю, артефакти, офлайн-демо.

   У застосунок НЕ входить — там працює справжній React із CDN.
   Задача рантайму одна: щоб той самий код екранів працював без
   змін. Тому підтримуємо рівно те, чим користується Urok+:

     createElement, Fragment, ключі, масиви, фрагменти
     useState, useEffect, useMemo, useRef, useCallback
     createRoot().render()

   Оновлення — повний перерендер кореня з порівнянням дерева. Для
   застосунку на кілька сотень вузлів це дешевше, ніж здається, і
   зберігає фокус у полях: DOM-вузли не пересоздаються, а лише
   правляться.
   ══════════════════════════════════════════════════════════════════ */
(function(global){
'use strict';

const SVG_TAGS = new Set(['svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'g', 'defs', 'linearGradient', 'radialGradient', 'stop', 'text', 'tspan', 'use', 'clipPath', 'mask']);
const SVG_NS = 'http://www.w3.org/2000/svg';
/* Властивості, які треба ставити саме як property, а не атрибут:
   інакше керовані поля живуть своїм життям. */
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'autofocus']);
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow',
  'flexShrink', 'order', 'gridColumn', 'gridRow']);
const ATTR_ALIAS = {className: 'class', htmlFor: 'for', tabIndex: 'tabindex', inputMode: 'inputmode',
  maxLength: 'maxlength', readOnly: 'readonly', autoFocus: 'autofocus', autoComplete: 'autocomplete'};

const Fragment = {__fragment: true};

function createElement(type, props, ...children){
  const p = {};
  let key = null;
  if (props) Object.keys(props).forEach(k => {
    if (k === 'key') key = String(props[k]);
    else p[k] = props[k];
  });
  if (children.length) p.children = children.length === 1 ? children[0] : children;
  return {__v: true, type, props: p, key};
}

/* Плоский список дітей: null/false/масиви прибираємо тут, щоб
   порівняння дерева не думало про них. */
function flatten(children, out){
  out = out || [];
  const walk = x => {
    if (x === null || x === undefined || x === false || x === true) return;
    if (Array.isArray(x)) return x.forEach(walk);
    out.push(x);
  };
  walk(children);
  return out;
}
const isText = el => typeof el === 'string' || typeof el === 'number';

/* ── стилі й атрибути ──────────────────────────────────────── */
function setStyle(dom, next, prev){
  const style = dom.style;
  if (typeof next === 'string'){ style.cssText = next; return; }
  if (prev && typeof prev === 'object'){
    Object.keys(prev).forEach(k => { if (!next || next[k] === undefined) style[k] = ''; });
  }
  if (!next) return;
  Object.keys(next).forEach(k => {
    const v = next[k];
    if (v === undefined || v === null || v === false) { style[k] = ''; return; }
    style[k] = typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : v;
  });
}

function setProp(dom, name, value, prev, svg){
  if (name === 'children' || name === 'key' || name === 'ref') return;
  if (name === 'style') return setStyle(dom, value, prev);
  if (/^on[A-Z]/.test(name)){
    /* Слухач вішаємо один раз, а міняємо лише посилання на обробник:
       так не буде мигання підписок на кожному кадрі.

       onChange навмисно слухає input, а не change: у React це подія
       на кожен символ, і код екранів написаний саме під неї. З
       нативним change поле оновлювало б стан лише після втрати
       фокуса — тобто пошук і форми мовчали б під час набору. */
    const type = name === 'onChange' ? 'input' : name.slice(2).toLowerCase();
    const map = dom.__h || (dom.__h = {});
    if (!map[type]) dom.addEventListener(type, e => {
      const fn = (dom.__h || {})[type];
      if (fn) fn(e);
    });
    map[type] = typeof value === 'function' ? value : null;
    return;
  }
  const attr = ATTR_ALIAS[name] || name;
  if (!svg && PROPS.has(attr)){
    const v = value === undefined || value === null ? '' : value;
    if (attr === 'value'){ if (dom.value !== String(v)) dom.value = v; return; }
    dom[attr] = attr === 'disabled' || attr === 'checked' || attr === 'selected' || attr === 'autofocus'
      ? !!value : v;
    if (attr === 'disabled' || attr === 'autofocus'){
      if (value) dom.setAttribute(attr, ''); else dom.removeAttribute(attr);
    }
    return;
  }
  if (value === undefined || value === null || value === false) dom.removeAttribute(attr);
  else if (value === true) dom.setAttribute(attr, '');
  else dom.setAttribute(attr, String(value));
}

function applyProps(dom, next, prev, svg){
  prev = prev || {};
  Object.keys(prev).forEach(k => {
    if (k === 'children' || k === 'style') return;
    if (!(k in next)) setProp(dom, k, null, prev[k], svg);
  });
  Object.keys(next).forEach(k => {
    if (k === 'children') return;
    if (k === 'style' || next[k] !== prev[k]) setProp(dom, k, next[k], prev[k], svg);
  });
}

/* ── хуки ──────────────────────────────────────────────────── */
let current = null, hookIndex = 0;
const pendingEffects = [];
let scheduled = false, rootRef = null;

function scheduleRender(){
  if (scheduled || !rootRef) return;
  scheduled = true;
  Promise.resolve().then(() => {
    scheduled = false;
    rootRef.rerender();
  });
}

function hookAt(i, init){
  const hooks = current.hooks;
  if (hooks.length <= i) hooks[i] = init();
  return hooks[i];
}

function useState(initial){
  const fiber = current;
  const hook = hookAt(hookIndex++, () => ({value: typeof initial === 'function' ? initial() : initial}));
  if (!hook.set) hook.set = v => {
    const next = typeof v === 'function' ? v(hook.value) : v;
    if (Object.is(next, hook.value)) return;
    hook.value = next;
    fiber.dirty = true;
    scheduleRender();
  };
  return [hook.value, hook.set];
}

const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
  && a.every((x, i) => Object.is(x, b[i]));

function useEffect(fn, deps){
  const hook = hookAt(hookIndex++, () => ({deps: null, cleanup: null, first: true}));
  const changed = hook.first || !deps || !sameDeps(hook.deps, deps);
  hook.first = false;
  hook.deps = deps;
  if (changed) pendingEffects.push(hook, fn);
}

function useMemo(fn, deps){
  const hook = hookAt(hookIndex++, () => ({deps: null, value: undefined, first: true}));
  if (hook.first || !deps || !sameDeps(hook.deps, deps)){
    hook.value = fn();
    hook.deps = deps;
    hook.first = false;
  }
  return hook.value;
}
const useCallback = (fn, deps) => useMemo(() => fn, deps);
function useRef(initial){
  return hookAt(hookIndex++, () => ({current: initial === undefined ? null : initial}));
}
function useReducer(reducer, initial){
  const [state, set] = useState(initial);
  return [state, action => set(prev => reducer(prev, action))];
}

/* ── дерево ────────────────────────────────────────────────── */
/* Фібра: {kind, type, key, props, dom, children[], hooks[]}.
   host/text тримають свій DOM-вузол, comp/frag — лише дітей. */

function createFiber(el){
  if (isText(el)) return {kind: 'text', text: String(el), dom: null, children: []};
  if (typeof el.type === 'function') return {kind: 'comp', type: el.type, key: el.key, props: el.props, hooks: [], children: []};
  if (el.type === Fragment || el.type === 'Fragment') return {kind: 'frag', key: el.key, props: el.props, children: []};
  return {kind: 'host', type: el.type, key: el.key, props: el.props, dom: null, children: []};
}

const sameType = (fiber, el) => {
  if (isText(el)) return fiber.kind === 'text';
  if (typeof el.type === 'function') return fiber.kind === 'comp' && fiber.type === el.type;
  if (el.type === Fragment || el.type === 'Fragment') return fiber.kind === 'frag';
  return fiber.kind === 'host' && fiber.type === el.type;
};

function renderComponent(fiber){
  const prev = current, prevIndex = hookIndex;
  current = fiber; hookIndex = 0;
  let out;
  try { out = fiber.type(fiber.props); }
  finally { current = prev; hookIndex = prevIndex; }
  return out;
}

function mount(el, parentDom, svg){
  const fiber = createFiber(el);
  if (fiber.kind === 'text'){
    fiber.dom = document.createTextNode(fiber.text);
    return fiber;
  }
  if (fiber.kind === 'host'){
    const isSvg = svg || SVG_TAGS.has(fiber.type);
    fiber.svg = isSvg;
    fiber.dom = isSvg ? document.createElementNS(SVG_NS, fiber.type) : document.createElement(fiber.type);
    applyProps(fiber.dom, fiber.props, null, isSvg);
    fiber.children = flatten(fiber.props.children).map(child => mount(child, fiber.dom, isSvg));
    arrange(fiber.dom, fiber.children);
    if (el.props && el.props.ref) el.props.ref.current = fiber.dom;
    return fiber;
  }
  const output = fiber.kind === 'comp' ? renderComponent(fiber) : fiber.props.children;
  fiber.children = flatten(output).map(child => mount(child, parentDom, svg));
  return fiber;
}

function unmount(fiber){
  if (fiber.kind === 'comp'){
    fiber.hooks.forEach(h => { if (h && typeof h.cleanup === 'function'){ try { h.cleanup(); } catch (e) {} h.cleanup = null; } });
  }
  fiber.children.forEach(unmount);
  if (fiber.dom && fiber.dom.parentNode) fiber.dom.parentNode.removeChild(fiber.dom);
}

function update(fiber, el, parentDom, svg){
  if (!sameType(fiber, el)){
    const fresh = mount(el, parentDom, svg);
    unmount(fiber);
    return fresh;
  }
  if (fiber.kind === 'text'){
    const text = String(el);
    if (fiber.text !== text){ fiber.text = text; fiber.dom.nodeValue = text; }
    return fiber;
  }
  if (fiber.kind === 'host'){
    applyProps(fiber.dom, el.props, fiber.props, fiber.svg);
    fiber.props = el.props;
    fiber.children = reconcile(fiber.children, flatten(el.props.children), fiber.dom, fiber.svg);
    arrange(fiber.dom, fiber.children);
    if (el.props.ref) el.props.ref.current = fiber.dom;
    return fiber;
  }
  fiber.props = el.props;
  const output = fiber.kind === 'comp' ? renderComponent(fiber) : el.props.children;
  fiber.children = reconcile(fiber.children, flatten(output), parentDom, svg);
  return fiber;
}

/* Порівняння списку дітей. З ключем шукаємо ту саму дитину, без
   ключа — беремо ту, що стояла на цьому ж місці. Так список занять
   не пересоздається, коли зверху додали ще одне. */
function reconcile(oldChildren, elements, parentDom, svg){
  const used = new Set();
  const byKey = new Map();
  oldChildren.forEach((child, i) => {
    if (child.key !== null && child.key !== undefined) byKey.set(child.key, child);
  });
  const next = elements.map((el, i) => {
    const key = !isText(el) && el.key !== null && el.key !== undefined ? el.key : null;
    let old = null;
    if (key !== null){
      old = byKey.get(key);
      if (old && used.has(old)) old = null;
    } else {
      const candidate = oldChildren[i];
      if (candidate && !used.has(candidate)
          && (candidate.key === null || candidate.key === undefined)) old = candidate;
    }
    if (old){
      used.add(old);
      return update(old, el, parentDom, svg);
    }
    return mount(el, parentDom, svg);
  });
  oldChildren.forEach(child => { if (!used.has(child) && next.indexOf(child) < 0) unmount(child); });
  return next;
}

/* DOM-вузли фібри: компонент і фрагмент своїх не мають, тому
   спускаємось до найближчих host/text. */
function collect(fiber, out){
  out = out || [];
  if (fiber.dom) out.push(fiber.dom);
  else fiber.children.forEach(child => collect(child, out));
  return out;
}

/* Ставимо вузли в потрібному порядку, не чіпаючи ті, що вже
   стоять правильно: зайвий insertBefore забирає фокус із поля. */
function arrange(parentDom, children){
  const want = [];
  children.forEach(child => collect(child, want));
  let cursor = parentDom.firstChild;
  want.forEach(node => {
    if (node === cursor){ cursor = cursor.nextSibling; return; }
    parentDom.insertBefore(node, cursor);
  });
}

function flushEffects(){
  while (pendingEffects.length){
    const hook = pendingEffects.shift();
    const fn = pendingEffects.shift();
    if (typeof hook.cleanup === 'function'){ try { hook.cleanup(); } catch (e) {} }
    let cleanup = null;
    try { cleanup = fn(); } catch (e) { console.error(e); }
    hook.cleanup = typeof cleanup === 'function' ? cleanup : null;
  }
}

function createRoot(container){
  const root = {
    container, fiber: null, element: null,
    render(element){
      root.element = element;
      rootRef = root;
      if (!root.fiber){
        root.fiber = mount(element, container, false);
        arrange(container, [root.fiber]);
      } else {
        root.fiber = update(root.fiber, element, container, false);
        arrange(container, [root.fiber]);
      }
      flushEffects();
    },
    rerender(){ if (root.element) root.render(root.element); },
    unmount(){ if (root.fiber) unmount(root.fiber); root.fiber = null; },
  };
  return root;
}

global.React = {
  createElement, Fragment, useState, useEffect, useLayoutEffect: useEffect,
  useMemo, useCallback, useRef, useReducer,
  memo: fn => fn,
  createContext: value => ({__ctx: true, _d: value}),
  useContext: ctx => ctx && ctx._d,
};
global.ReactDOM = {createRoot};
})(typeof window !== 'undefined' ? window : globalThis);
