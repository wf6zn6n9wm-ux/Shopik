/* PRO Trainer · офлайн-режим
   Оболонка застосунку кешується під час встановлення, зовнішні бібліотеки
   (React, Babel, шрифти) — під час першого завантаження. Далі застосунок
   відкривається без мережі: усі дані й так лежать на пристрої. */
/* Нову назву беремо, щоб activate прибрав старий кеш: у ньому могли
   осісти відповіді /api, які туди ніколи не мали потрапити. */
const V = 'protrainer-v2';
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

  /* Серверні відповіді не кешуємо ніколи. Правило нижче — «спершу кеш,
     оновлюємо у фоні» — правильне для оболонки й шрифтів і руйнівне для
     /api: підписка, пробний період і копія бази — це стан, а не файл.
     Через це новий пристрій міг спитати «чи є копія?», отримати вчорашнє
     «немає» й почати з порожнього кабінету, а оплачена підписка ще
     якийсь час показувалась би неоплаченою. Сервер і так каже
     no-store — тут ми просто не заважаємо. */
  if (url.pathname.startsWith('/api/')) return;

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
