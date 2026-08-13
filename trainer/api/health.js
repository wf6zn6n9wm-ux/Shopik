/* Перевірка, що сервер налаштований.

   Без сховища ліцензії живуть у пам'яті процесу й зникають між викликами
   функції: пробний період можна почати нескінченно, підписка «губиться».
   Помітити це по роботі застосунку майже неможливо — тому питаємо прямо.

   GET /api/health → {"ok":true,"storage":"kv","liqpay":true}

   Секретів не віддає: лише «є / немає». Запис робиться й одразу
   стирається — інакше «сховище підключене» довелось би брати на віру.  */
const L = require('./_lib.js');

module.exports = async function handler(req, res){
  const key = 'health:probe';
  let storage = 'memory', error = '';
  try {
    const stamp = Date.now();
    await L.store.set(key, stamp);
    const back = await L.store.get(key);
    if (back === stamp && await L.store.live()) storage = 'kv';
  } catch (e){
    error = String((e && e.message) || e);
  }
  return L.json(res, 200, {
    ok: !error,
    storage,                         /* kv — записи переживуть перезапуск */
    liqpay: L.configured(),          /* ключі мерчанта на місці */
    base: L.ENV.base || '',
    ...(error ? {error} : {}),
  });
};
