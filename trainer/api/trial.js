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
/* Відро того дня, коли пробний закінчується. Складати логіни заздалегідь
   доводиться тому, що сховище вміє тільки читати за ключем: без відер
   розсилка мусила б перебирати всіх підряд, а перебрати їх нічим. */
const dueKey = ts => 'due:' + new Date(ts).toISOString().slice(0, 10);

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

  /* ─── найраніша дата з усіх пристроїв ───
     Застосунок надсилає свою дату початку, і якщо вона раніша за нашу —
     запам'ятовуємо її. Без цього правило «беремо ранішу» діяло лише в
     один бік: пристрій підтягував дату з сервера, а сервер про раніший
     початок на іншому пристрої не дізнавався ніколи. Телефон показував
     дванадцять днів, сайт — десять, і зійтись вони не могли.

     Ранішу дату приймаємо без побоювань: вона скорочує пробний період,
     а не подовжує, тож брехати тут немає сенсу. Майбутнє відкидаємо. */
  /* Нижня межа обов'язкова. Раніша дата скорочує пробний період, тож
     брехати заради неї сенсу немає — але зіпсований запис або збитий
     годинник на телефоні надішле 1970 рік, і людина втратить пробний
     період миттєво й без вороття. Усе, що старше за FLOOR, — це не
     раніший початок, а сміття. */
  const FLOOR = 90 * 86400000;
  const at = Number(q.at || 0);
  if (rec && at > Date.now() - FLOOR && at < rec.startedAt && at <= Date.now()){
    const wasDue = dueKey(rec.startedAt + TRIAL_DAYS * 86400000);
    rec = {...rec, startedAt: at};
    await L.store.set(key, rec);
    /* Лист про кінець пробного лежить у відрі того дня — переносимо
       разом із датою, інакше нагадування прийде не тоді. */
    const day = dueKey(at + TRIAL_DAYS * 86400000);
    if (day !== wasDue){
      const list = (await L.store.get(day)) || [];
      if (!list.includes(login)){ list.push(login); await L.store.set(day, list); }
      const old = ((await L.store.get(wasDue)) || []).filter(x => x !== login);
      await L.store.set(wasDue, old);
    }
  }

  /* почати можна рівно один раз: другий виклик поверне ту саму дату */
  if (!rec && q.start){
    const lang = ['uk', 'ru', 'en', 'pl'].includes(q.lang) ? q.lang : 'uk';
    rec = {login, startedAt: Date.now(), device, lang};
    await L.store.set(key, rec);
    /* Два пробні періоди, що почались в одну мить, могли б затерти один
       одного у відрі. Ціна помилки — неотриманий лист, тому обходимось
       без блокувань: складніша схема тут коштувала б дорожче за втрату. */
    const day = dueKey(rec.startedAt + TRIAL_DAYS * 86400000);
    const list = (await L.store.get(day)) || [];
    if (!list.includes(login)){ list.push(login); await L.store.set(day, list); }
  }
  /* Стан оплати їде разом із пробним періодом: застосунок питає про них
     в одному місці, і зайвий запит тут коштував би ще однієї серверної
     функції — а їх у нас рівно стільки, скільки дозволяє тариф. */
  return L.json(res, 200, {...view(rec), pause: await L.payPause()});
};

module.exports.TRIAL_DAYS = TRIAL_DAYS;
module.exports.keyOf = keyOf;
module.exports.dueKey = dueKey;
