/* Пробний період, прив'язаний до логіна.

   Доти він жив лише в пам'яті пристрою, тож перевстановлення застосунку
   давало нові 14 днів — і так скільки завгодно разів. Тепер дату першого
   запуску пам'ятає сервер, і вона для застосунку головніша за локальну.

   GET /api/trial?login=…&device=…          подивитись
   GET /api/trial?login=…&device=…&start=1  почати (тільки якщо ще не був)

   Застосунок працює й без відповіді: офлайн він рахує за локальною датою,
   а звіряється, щойно з'явиться зв'язок. Тому цей ендпоінт не блокує
   роботу, а лише не дає почати пробний період удруге.                  */
const L = require('../api/_lib.js');

const TRIAL_DAYS = 14;                    /* стільки ж, скільки TRIAL_DAYS у застосунку */
const keyOf = login => 'trial:' + L.normLogin(login);

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

  /* почати можна рівно один раз: другий виклик поверне ту саму дату */
  if (!rec && q.start){
    rec = {login, startedAt: Date.now(), device};
    await L.store.set(key, rec);
  }
  return L.json(res, 200, view(rec));
};

module.exports.TRIAL_DAYS = TRIAL_DAYS;
module.exports.keyOf = keyOf;
