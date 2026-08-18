/* Проверка, что сервер настроен.

   Один адрес, который отвечает на вопрос «я всё правильно подключил?».
   Без него это выясняется единственным способом: барбер платит, деньги
   уходят, а доступ не появляется — потому что забыли хранилище или
   ошиблись доменом в callback.

   GET /api/health →
     {"ok":true,"storage":"kv","liqpay":true,"base":"https://…","baseMatchesHost":true,
      "booking":{"supabase":true,"bot":true,"cron":true}}

   Секретов не отдаёт: только «есть / нет». Запись в хранилище делается и
   тут же стирается — иначе «хранилище подключено» пришлось бы брать на
   веру.                                                                */
const L = require('./_lib.js');

const env = name => process.env['BARBER_' + name] || process.env[name] || '';
const has = (...names) => names.some(n => !!env(n));

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

  /* Куда LiqPay пришлёт callback. Если base указывает не на тот домен,
     где живёт функция, банк отправит ответ в пустоту, оплата пройдёт, а
     доступа не будет — и понять это по приложению невозможно. */
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const base = L.ENV.base;
  const baseHost = base.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const out = {
    ok: !error,
    storage,                          /* kv — записи переживут перезапуск */
    liqpay: L.configured(),           /* ключи мерчанта на месте */
    base,
    /* пусто — не ошибка: checkout подставит текущий хост сам */
    baseMatchesHost: !base || baseHost === host,
    currency: L.CURRENCY,
    plans: Object.keys(L.PLANS).length,
    devices: L.DEVICES,
    /* онлайн-запись живёт отдельно от оплаты и может быть выключена */
    booking: {
      supabase: has('SUPABASE_URL') && has('SUPABASE_SERVICE_ROLE_KEY'),
      bot: has('BOT_TOKEN') && has('BOT_USERNAME'),
      tgSecret: has('TG_SECRET'),
      cron: has('CRON_SECRET'),
      appUrl: has('APP_URL'),
    },
  };
  if (error) out.error = error;

  /* Готово к приёму денег — когда есть и ключи, и хранилище, и верный
     адрес: без любого из трёх оплата ломается по-своему. */
  out.readyToSell = !!(out.liqpay && storage === 'kv' && out.baseMatchesHost && !error);
  return L.json(res, 200, out);
};
