/* Пробный период, привязанный к логину.

   Если бы он жил только в памяти устройства, очистка данных давала бы
   новые 14 дней — и так сколько угодно раз. Поэтому дату первого запуска
   помнит сервер, и она для приложения главнее локальной.

   GET /api/trial?login=…&device=…          посмотреть
   GET /api/trial?login=…&device=…&start=1  начать (только если ещё не был)

   Приложение работает и без ответа: офлайн оно считает по локальной дате,
   а сверяется, как только появится связь. Поэтому эндпоинт не блокирует
   работу, а лишь не даёт начать пробный период второй раз.             */
const L = require('./_lib.js');

const TRIAL_DAYS = 14;                    /* столько же, сколько TRIAL_DAYS в приложении */
const keyOf = login => 'btrial:' + L.normLogin(login);

const view = rec => {
  if (!rec) return {ok: true, started: false};
  const endsAt = rec.startedAt + TRIAL_DAYS * 86400000;
  return {
    ok: true,
    started: true,
    startedAt: rec.startedAt,
    endsAt,
    days: TRIAL_DAYS,
    expired: endsAt <= Date.now(),
  };
};

module.exports = async function handler(req, res){
  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});

  const key = keyOf(login);
  let rec = await L.store.get(key);

  /* начать можно ровно один раз: второй вызов вернёт ту же дату */
  if (!rec && q.start){
    rec = {login, startedAt: Date.now(), device};
    await L.store.set(key, rec);
  }
  return L.json(res, 200, view(rec));
};

module.exports.TRIAL_DAYS = TRIAL_DAYS;
module.exports.keyOf = keyOf;
