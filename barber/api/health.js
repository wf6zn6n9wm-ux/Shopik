/* Проверка, что сервер настроен.

   Без хранилища лицензии живут в памяти процесса и исчезают между
   вызовами функции: пробный период можно начинать бесконечно, подписка
   «теряется». Заметить это по работе приложения почти невозможно —
   поэтому спрашиваем прямо.

   GET /api/health → {"ok":true,"storage":"kv","liqpay":true}

   Секретов не отдаёт: только «есть / нет». Запись делается и тут же
   стирается — иначе «хранилище подключено» пришлось бы брать на веру. */
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
    storage,                         /* kv — записи переживут перезапуск */
    liqpay: L.configured(),          /* ключи мерчанта на месте */
    base: L.ENV.base || '',
    ...(error ? {error} : {}),
  });
};
