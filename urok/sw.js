/* Urok+ · сервіс-воркер.
   Оболонка кешується, щоб застосунок відкривався без мережі; дані
   й так живуть у localStorage. Версію піднімаємо руками — інакше
   користувач місяцями сидітиме на старому кеші. */
const CACHE = 'urok-v3';
const SHELL = [
  './', './index.html', './pay.html', './icon.svg', './manifest.webmanifest',
  './src/00-i18n.js', './src/10-core.js', './src/20-ui.js', './src/30-auth.js',
  './src/40-calendar.js', './src/45-lesson.js', './src/48-homework.js',
  './src/50-students.js', './src/55-finance.js',
  './src/60-market.js', './src/70-profile.js', './src/90-app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Мережа перша, кеш — запасний: свіжий код важливіший за миттєвий
   старт, а офлайн усе одно працює. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        if (res.ok && new URL(req.url).origin === location.origin)
          caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
