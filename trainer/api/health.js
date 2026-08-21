/* Перевірка, що сервер налаштований.

   Без сховища ліцензії живуть у пам'яті процесу й зникають між викликами
   функції: пробний період можна почати нескінченно, підписка «губиться».
   Помітити це по роботі застосунку майже неможливо — тому питаємо прямо.

   GET /api/health → {"ok":true,"storage":"kv","pay":"mono","mail":true}

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
    pay: L.provider() || false,      /* 'mono' | 'liqpay' | false */
    /* лист про кінець пробного — єдине місце, де дозволено вести на
       оплату, тож мовчазно зламана пошта коштує дорого */
    mail: !!process.env.RESEND_API_KEY,
    /* Імена змінних сховища — щоб не гадати, під яким префіксом його
       підключили. Значень тут немає й бути не може: самі імена нічого
       не відкривають, а без них «memory» доводиться відгадувати. */
    storageEnv: Object.keys(process.env)
      .filter(n => /^(KV_|UPSTASH_|REDIS_|STORAGE_)/.test(n)).sort(),
    base: L.ENV.base || '',
    ...(error ? {error} : {}),
  });
};
