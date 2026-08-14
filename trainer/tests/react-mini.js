/* ──────────────────────────────────────────────────────────────────
   Маленький React — рівно стільки, щоб застосунок ожив у браузері.

   Навіщо. У цьому середовищі немає мережі, а справжній React живе на
   CDN. Через це застосунок неможливо було прокликати машинно: усі інші
   перевірки виконують його в пісочниці без DOM, де немає ні кліків, ні
   фокуса, ні полів вводу.

   ⚠️ Чого це НЕ доводить. Що застосунок поводиться так само під
   справжнім React. Тут інша реалізація: простіша, синхронна, без
   планувальника. Перевірки на ній ловлять зламану логіку застосунку —
   але не розбіжності з React. Тому файл лежить у tests/ і нікуди, крім
   перевірок, не потрапляє.

   Що вміє: createElement, Fragment, класові компоненти з
   getDerivedStateFromError і componentDidCatch, createContext, useState,
   useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext,
   createRoot().render().

   Чим відрізняється від справжнього, свідомо:
     • ефекти виконуються одразу після коміту, а не після відмальовки;
     • оновлення стану збирається в один прохід через мікрозадачу;
     • немає Suspense, порталів, memo, forwardRef — застосунку не треба.
   ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var FRAGMENT = {__fragment: true};

  function createElement(type, props){
    var p = {};
    if (props) for (var k in props) p[k] = props[k];
    var kids = Array.prototype.slice.call(arguments, 2);
    if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
    return {__el: true, type: type, props: p, key: props && props.key != null ? String(props.key) : null};
  }

  function Component(props){ this.props = props; this.state = {}; }
  Component.prototype.isReactComponent = {};
  Component.prototype.setState = function (s){
    var next = typeof s === 'function' ? s(this.state) : s;
    this.state = Object.assign({}, this.state, next);
    schedule();
  };

  function createContext(def){
    var ctx = {__ctx: true, _cur: def, _def: def};
    ctx.Provider = function (props){ return {__provider: true, ctx: ctx, props: props}; };
    ctx.Consumer = function (props){ return props.children(ctx._cur); };
    return ctx;
  }

  /* ─────────── стан компонентів ───────────
     Кожен компонент упізнається шляхом у дереві: «третя дитина другої
     дитини кореня» плюс сама функція. Цього досить, поки список не
     перемішують без ключів — а там, де перемішують, у застосунку ключі є. */
  var store = new Map();       /* path → {hooks:[], i:0, inst, effects:[]} */
  var pending = [];            /* ефекти, які треба виконати після коміту */
  var current = null;          /* запис компонента, який рендериться зараз */
  var root = null;

  function slot(path){
    var rec = store.get(path);
    if (!rec){ rec = {hooks: [], i: 0, inst: null, alive: true}; store.set(path, rec); }
    rec.i = 0;
    rec.alive = true;
    return rec;
  }

  function hook(init){
    var rec = current;
    var i = rec.i++;
    if (rec.hooks.length <= i) rec.hooks[i] = init();
    return rec.hooks[i];
  }

  function useState(v){
    var h = hook(function (){ return {v: typeof v === 'function' ? v() : v}; });
    var rec = current;
    return [h.v, function (next){
      var val = typeof next === 'function' ? next(h.v) : next;
      if (Object.is(val, h.v)) return;
      h.v = val;
      if (rec.alive) schedule();
    }];
  }

  function useRef(v){ return hook(function (){ return {current: v}; }); }

  function same(a, b){
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }

  function useMemo(fn, deps){
    var h = hook(function (){ return {deps: null, v: undefined, first: true}; });
    if (h.first || !same(h.deps, deps)){ h.v = fn(); h.deps = deps; h.first = false; }
    return h.v;
  }
  function useCallback(fn, deps){ return useMemo(function (){ return fn; }, deps); }

  function useEffect(fn, deps){
    var h = hook(function (){ return {deps: null, off: null, first: true}; });
    if (h.first || deps === undefined || !same(h.deps, deps)){
      h.deps = deps;
      h.first = false;
      pending.push(h, fn);
    }
  }

  function useContext(ctx){ return ctx ? ctx._cur : undefined; }

  /* ─────────── рендер: дерево елементів → плоске дерево вузлів ─────────── */
  function render(node, path){
    if (node == null || node === false || node === true || node === '') return null;
    if (typeof node === 'string' || typeof node === 'number') return {text: String(node)};
    if (Array.isArray(node)){
      var out = [];
      for (var i = 0; i < node.length; i++){
        var kid = node[i];
        var k = kid && kid.__el && kid.key != null ? 'k:' + kid.key : 'i:' + i;
        var r = render(kid, path + '/' + k);
        if (r) out.push(r);
      }
      return {list: out};
    }
    if (node.__provider){
      var was = node.ctx._cur;
      node.ctx._cur = node.props.value;
      var inner = render(node.props.children, path + '/p');
      node.ctx._cur = was;
      return inner;
    }
    if (!node.__el) return null;

    var type = node.type;
    if (type === FRAGMENT) return render(node.props.children, path + '/f');

    if (typeof type === 'function'){
      var rec = slot(path + '/' + (type.name || 'c'));
      /* класовий компонент */
      if (type.prototype && type.prototype.isReactComponent){
        if (!rec.inst){ rec.inst = new type(node.props); rec.inst.__path = path; }
        rec.inst.props = node.props;
        try {
          return render(rec.inst.render(), path + '/r');
        } catch (e){
          if (type.getDerivedStateFromError){
            rec.inst.state = Object.assign({}, rec.inst.state, type.getDerivedStateFromError(e));
            if (rec.inst.componentDidCatch) rec.inst.componentDidCatch(e);
            return render(rec.inst.render(), path + '/r');
          }
          throw e;
        }
      }
      var prev = current;
      current = rec;
      var out2;
      try { out2 = type(node.props); }
      finally { current = prev; }
      return render(out2, path + '/r');
    }

    /* звичайний тег */
    var kids = render(node.props.children, path + '/c');
    return {tag: type, props: node.props, kids: kids, key: node.key};
  }

  /* ─────────── коміт: дерево вузлів → DOM ───────────
     Вузли переиспользуются за типом і ключем — інакше поле вводу
     перестворювалось би на кожну літеру й губило фокус. */
  var SVG = 'http://www.w3.org/2000/svg';
  var ATTR = {className: 'class', htmlFor: 'for'};

  function flat(node, out){
    if (!node) return out;
    if (node.list){ for (var i = 0; i < node.list.length; i++) flat(node.list[i], out); return out; }
    out.push(node);
    return out;
  }

  function setProps(el, props, old, svg){
    old = old || {};
    for (var k in old){
      if (k === 'children' || k === 'key') continue;
      if (!(k in props)){
        if (k.slice(0, 2) === 'on') el[evtName(k)] = null;
        else if (k === 'ref') { if (old.ref) old.ref.current = null; }
        else el.removeAttribute(ATTR[k] || dash(k));
      }
    }
    for (var p in props){
      if (p === 'children' || p === 'key') continue;
      var v = props[p];
      if (p === 'ref'){ if (v) v.current = el; continue; }
      if (p.slice(0, 2) === 'on'){ el[evtName(p)] = typeof v === 'function' ? v : null; continue; }
      if (p === 'style'){ setStyle(el, v); continue; }
      if (p === 'value' || p === 'checked'){ if (el[p] !== v) el[p] = v == null ? '' : v; continue; }
      if (v === false || v == null){ el.removeAttribute(ATTR[p] || dash(p)); continue; }
      if (v === true){ el.setAttribute(ATTR[p] || dash(p), ''); continue; }
      var name = ATTR[p] || (svg ? dash(p) : (p === 'class' ? 'class' : dash(p)));
      if (el.getAttribute(name) !== String(v)) el.setAttribute(name, v);
    }
  }
  /* onChange у React — це подія input, а не change: він спрацьовує на
     кожній літері, а не після втрати фокуса. Застосунок розраховує саме
     на це, тож і тут має бути так. */
  function evtName(k){ return k === 'onChange' ? 'oninput' : k.toLowerCase(); }

  var KEEP = {viewBox: 1, preserveAspectRatio: 1, baseProfile: 1};
  function dash(k){
    if (KEEP[k]) return k;
    return k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }
  var UNITLESS = {opacity:1, zIndex:1, flex:1, flexGrow:1, flexShrink:1, fontWeight:1,
                  lineHeight:1, order:1, zoom:1, strokeWidth:1, strokeDasharray:1,
                  strokeDashoffset:1, fillOpacity:1, strokeOpacity:1};
  function setStyle(el, o){
    el.style.cssText = '';
    if (!o) return;
    for (var k in o){
      var v = o[k];
      if (v == null || v === '') continue;
      var name = k.charAt(0) === '-' ? k : dash(k);
      el.style.setProperty(name, typeof v === 'number' && !UNITLESS[k] ? v + 'px' : String(v));
    }
  }

  function commit(parent, node, svg){
    var want = flat(node, []);
    var have = parent.__nodes || [];
    var i;
    for (i = 0; i < want.length; i++){
      var w = want[i], h = have[i], el;
      var isSvg = svg || w.tag === 'svg';
      if (w.text != null){
        if (h && h.text != null && h.el.nodeType === 3){ el = h.el; if (el.data !== w.text) el.data = w.text; }
        else { el = document.createTextNode(w.text); replace(parent, i, el); }
      } else {
        var reuse = h && h.tag === w.tag && h.key === w.key && h.el && h.el.nodeType === 1;
        if (reuse){ el = h.el; setProps(el, w.props, h.props, isSvg); }
        else {
          el = isSvg ? document.createElementNS(SVG, w.tag) : document.createElement(w.tag);
          setProps(el, w.props, null, isSvg);
          replace(parent, i, el);
        }
        commit(el, w.kids, isSvg);
      }
      w.el = el;
    }
    /* зайве прибираємо з кінця */
    while (parent.childNodes.length > want.length) parent.removeChild(parent.lastChild);
    parent.__nodes = want;
  }
  function replace(parent, i, el){
    var at = parent.childNodes[i];
    if (at) parent.replaceChild(el, at);
    else parent.appendChild(el);
  }

  /* ─────────── цикл ─────────── */
  var queued = false;
  function schedule(){
    if (queued || !root) return;
    queued = true;
    Promise.resolve().then(function (){ queued = false; draw(); });
  }
  function draw(){
    store.forEach(function (rec){ rec.alive = false; });
    pending.length = 0;
    var tree = render(root.node, '');
    commit(root.el, tree, false);
    /* прибираємо стан компонентів, яких більше немає на екрані */
    store.forEach(function (rec, key){
      if (rec.alive) return;
      rec.hooks.forEach(function (h){ if (h && typeof h.off === 'function'){ try { h.off(); } catch (e){} } });
      store.delete(key);
    });
    for (var i = 0; i < pending.length; i += 2){
      var h = pending[i], fn = pending[i + 1];
      if (typeof h.off === 'function'){ try { h.off(); } catch (e){} }
      try { h.off = fn(); } catch (e){ console.error('[effect]', e); }
    }
    pending.length = 0;
  }

  function createRoot(el){
    return {render: function (node){
      el.innerHTML = '';
      el.__nodes = [];
      root = {el: el, node: node};
      draw();
    }};
  }

  window.React = {
    createElement: createElement,
    Fragment: FRAGMENT,
    Component: Component,
    createContext: createContext,
    useState: useState,
    useEffect: useEffect,
    useLayoutEffect: useEffect,
    useRef: useRef,
    useMemo: useMemo,
    useCallback: useCallback,
    useContext: useContext,
    __mini: true,
  };
  window.ReactDOM = {createRoot: createRoot};
})();
