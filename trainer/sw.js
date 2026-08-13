/* PRO Trainer · офлайн-режим
   Оболонка застосунку кешується під час встановлення, зовнішні бібліотеки
   (React, Babel, шрифти) — під час першого завантаження. Далі застосунок
   відкривається без мережі: усі дані й так лежать на пристрої. */
const V = 'protrainer-v1';
const SHELL = ['./', './index.html', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const external = url.origin !== self.location.origin;

  /* сторінка: спершу мережа (щоб бачити свіжу версію), потім кеш */
  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(V).then(c => c.put('./index.html', copy));
        return r;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* бібліотеки та шрифти: спершу кеш, оновлюємо у фоні */
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(r => {
        if (r && (r.ok || (external && r.type === 'opaque'))){
          const copy = r.clone();
          caches.open(V).then(c => c.put(req, copy));
        }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
