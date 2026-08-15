/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · копія бази на сервері

   Навіщо. Дані живуть у сховищі браузера, а воно недовговічне: Safari
   на iPhone стирає його приблизно за тиждень без відвідувань, чистка
   історії стирає одразу, а зміна телефону — це просто порожній кабінет.
   Для тренера це втрата бази клієнтів, тобто роботи.

   Що саме ми зберігаємо. Тільки шифротекст. Ключ виводиться з пароля
   кабінета на пристрої (PBKDF2, AES-GCM) і сюди не потрапляє ніколи —
   ні ми, ні той, хто дістанеться цього сховища, вміст не прочитає.

   Хто має доступ. Той, хто знає пароль. Доказ — token: SHA-256 від
   самого ключа. Він не дає прочитати дані й не дає дешево підібрати
   пароль: щоб перевірити здогадку, доведеться щоразу проходити ті самі
   150 000 ітерацій PBKDF2.

   Сіль не секрет — її віддаємо за логіном. Без неї новий пристрій не
   зміг би вивести той самий ключ із того самого пароля.

   GET  /api/db?login=…              чи є копія: {has, salt, savedAt}
   GET  /api/db?login=…&token=…      забрати копію
   POST /api/db?login=…&token=…      покласти копію {salt, iv, ct}
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');

const MAX = 1024 * 1024;                 /* 1 МБ — база тренера значно менша */
const keyOf = login => 'db:' + L.normLogin(login);

const same = (a, b) => {
  const x = String(a || ''), y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  /* порівнюємо без раннього виходу: час відповіді не має підказувати,
     наскільки token близький до правильного */
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
};

module.exports = async function handler(req, res){
  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});

  const key = keyOf(login);
  const rec = await L.store.get(key);
  const token = String(q.token || '');

  if ((req.method || 'GET').toUpperCase() === 'POST'){
    const body = req.body || {};
    if (!body.iv || !body.ct || !body.salt) return L.json(res, 400, {ok: false, error: 'no_data'});
    const size = String(body.ct).length;
    if (size > MAX) return L.json(res, 413, {ok: false, error: 'too_big', max: MAX});
    if (!token) return L.json(res, 400, {ok: false, error: 'no_token'});
    /* перший запис задає власника; далі — тільки він */
    if (rec && !same(rec.token, token)) return L.json(res, 403, {ok: false, error: 'wrong_token'});

    await L.store.set(key, {
      token, salt: String(body.salt), iv: String(body.iv), ct: String(body.ct),
      savedAt: Date.now(), size,
    });
    return L.json(res, 200, {ok: true, savedAt: Date.now(), size});
  }

  /* без token кажемо лише те, що потрібно новому пристрою: копія є, ось сіль */
  if (!token)
    return L.json(res, 200, {ok: true, has: !!rec, salt: (rec && rec.salt) || '', savedAt: (rec && rec.savedAt) || 0});

  if (!rec) return L.json(res, 200, {ok: true, has: false});
  if (!same(rec.token, token)) return L.json(res, 403, {ok: false, error: 'wrong_token'});
  return L.json(res, 200, {ok: true, has: true, salt: rec.salt, iv: rec.iv, ct: rec.ct, savedAt: rec.savedAt, size: rec.size});
};

module.exports.keyOf = keyOf;
module.exports.MAX = MAX;
