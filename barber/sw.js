/* Про Барбер · офлайн-режим

   Барбер работает в кресле, а не за столом: сеть в подвальной студии
   пропадает регулярно. Данные и так лежат на устройстве — не хватало
   только самой оболочки, без неё браузер показывал пустую страницу.

   Оболочка кешируется при установке, внешние библиотеки (React, Babel,
   шрифты) — при первой загрузке. Дальше кабинет открывается без сети.

   Чего здесь намеренно нет: кеша для /api/. Ответы про заявки, лицензию
   и пробный период — про «сейчас»; отдать вчерашний ответ хуже, чем не
   отдать ничего. Поэтому они всегда идут в сеть и честно падают офлайн,
   а приложение это уже умеет пережить.                                */
const V = 'probarber-v3';

/* Всё, без чего кабинет не откроется. Публичная страница записи тоже
   здесь: барбер показывает её клиенту со своего телефона. */
const SHELL = [
  './',
  './index.html',
  './book.html',
  './pay.css',
  './icon.svg',
  './manifest.webmanifest',
];

/* Внешние библиотеки: без них кабинет не соберётся вовсе — ни React,
   ни Babel, который прямо в браузере превращает JSX в рабочий код.

   Кешируем их при установке, а не при первой загрузке. На самой первой
   загрузке теги <script> уходят в сеть раньше, чем worker успевает
   активироваться, — то есть через него они не проходят и в кеше не
   оказываются. Барбер, закрывший вкладку и потерявший связь, увидел бы
   пустой экран вместо своего расписания.

   Адреса обязаны совпадать с тем, что подключено в index.html: разъедутся
   молча, поэтому на это есть проверка.                                */
const VENDOR = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7/babel.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

/* куда падаем офлайн, если открытой страницы в кеше нет */
const HOME = new URL('./index.html', self.location.href).href;
const ROOT = new URL('./', self.location.href).href;

/* Сначала обычным запросом, потом без CORS: часть CDN не отдаёт нужные
   заголовки, и тогда ответ можно сохранить только «непрозрачным» — тела
   мы не увидим, но браузеру для <script> его достаточно. */
const stash = (c, u) =>
  c.add(u).catch(() => c.add(new Request(u, {mode: 'no-cors'}))).catch(() => {});

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      /* по одному: если одного файла нет, addAll отменил бы установку
         целиком и офлайна не было бы вовсе */
      .then(c => Promise.all(SHELL.concat(VENDOR).map(u => stash(c, u))))
      .then(() => self.skipWaiting())
  );
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

  let url;
  try { url = new URL(req.url); } catch (err){ return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const external = url.origin !== self.location.origin;

  /* сервер: заявки, лицензия, пробный период — только живой ответ */
  if (!external && url.pathname.startsWith('/api/')) return;

  /* страница: сперва сеть, чтобы видеть свежую версию, потом кеш.
     Кешируем под её собственным адресом — страниц несколько, и подменять
     оплату кабинетом нельзя.

     Адреса везде абсолютные: Cache API всё равно приводит ключи к полному
     URL, и если класть по одному виду, а искать по другому, запасной
     вариант молча не найдётся — ровно тогда, когда он и нужен. */
  if (req.mode === 'navigate'){
    const key = url.href;
    e.respondWith(
      fetch(req)
        .then(r => {
          if (r && r.ok){
            const copy = r.clone();
            caches.open(V).then(c => c.put(key, copy)).catch(() => {});
          }
          return r;
        })
        .catch(() => caches.match(key)
          .then(hit => hit || caches.match(HOME))
          .then(hit => hit || caches.match(ROOT)))
    );
    return;
  }

  /* библиотеки, шрифты и статика: сперва кеш, обновляем в фоне */
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(r => {
        /* opaque — ответ стороннего домена без CORS: тела не видно, но
           отдать его браузеру можно, поэтому кладём и такой */
        if (r && (r.ok || (external && r.type === 'opaque'))){
          const copy = r.clone();
          caches.open(V).then(c => c.put(req, copy)).catch(() => {});
        }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
