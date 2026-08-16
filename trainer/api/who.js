/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · хто вже завів кабінет

   Просте питання «скільки в нас тренерів» досі не мало відповіді:
   дивитись доводилось у панель сховища руками. Тут — та сама відповідь
   одним запитом, і поруч те, що справді цікаво: чи почав кабінет
   працювати, чи є копія бази, чи дійшло до оплати.

   Кабінетом вважаємо початий пробний період: він заводиться на сервері
   при реєстрації, отже це і є «зареєструвався». Копія бази й ліцензія —
   не всі й не одразу, тому рахувати за ними було б менше, ніж є.

   Секрет обов'язковий. Тут видно пошту кожного тренера, і роздавати
   такий список за одним посиланням не можна:

     GET /api/who            Authorization: Bearer $CRON_SECRET
     GET /api/who?full=1     з переліком, а не самими числами

   Дані нікуди не змінюються: функція тільки читає.
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');
const TRIAL = require('../api/trial.js');
const DB = require('../api/db.js');

const day = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';

module.exports = async function handler(req, res){
  const secret = process.env.CRON_SECRET || '';
  const auth = String(req.headers['authorization'] || '');
  if (!secret || auth !== 'Bearer ' + secret) return L.json(res, 401, {ok: false, error: 'forbidden'});

  const q = {...(req.query || {}), ...(req.body || {})};

  /* Сховище може виявитись пам'яттю процесу — тоді число буде майже
     нулем не тому, що тренерів немає, а тому, що записи не переживають
     запуск функції. Не мовчимо про це: підпис поруч із числом коштує
     дешевше, ніж хибний висновок «у нас ніхто не реєструється». */
  const storage = (await L.store.live()) ? 'kv' : 'memory';

  const found = await L.store.keys('trial:*');
  const now = Date.now();
  const people = [];

  for (const key of found){
    const login = key.slice('trial:'.length);
    const t = await L.store.get(key) || {};
    const box = await L.store.get(DB.keyOf(login));
    const lic = await L.readLicence(login);
    people.push({
      login,
      /* коли завів кабінет */
      since: day(t.startedAt),
      /* пробний ще діє? */
      trial: !!(t.startedAt && now - t.startedAt < TRIAL.TRIAL_DAYS * 86400000),
      /* копія бази: є — значить кабінетом справді користуються */
      backup: !!box,
      backupAt: box ? day(box.savedAt) : '',
      size: box ? box.size : 0,
      /* підписка */
      paid: !!(lic && lic.expiresAt > now),
      until: lic ? day(lic.expiresAt) : '',
      granted: !!(lic && lic.granted),
      lang: t.lang || '',
    });
  }

  people.sort((a, b) => (a.since < b.since ? 1 : -1));

  const count = {
    all: people.length,
    trial: people.filter(p => p.trial).length,
    backup: people.filter(p => p.backup).length,
    paid: people.filter(p => p.paid && !p.granted).length,
    granted: people.filter(p => p.granted).length,
  };

  /* За замовчуванням — самі числа. Перелік пошт віддаємо лише коли його
     справді просять: менше приводів світити його там, де не треба. */
  return L.json(res, 200, q.full ? {ok: true, storage, count, people} : {ok: true, storage, count});
};
