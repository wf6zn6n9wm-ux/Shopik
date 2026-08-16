/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · копія бази на сервері

   Навіщо. Дані живуть у сховищі браузера, а воно недовговічне: Safari
   на iPhone стирає його приблизно за тиждень без відвідувань, чистка
   історії стирає одразу, а зміна телефону — це просто порожній кабінет.
   Для тренера це втрата бази клієнтів, тобто роботи.

   Що саме ми зберігаємо.
     ct    — шифротекст бази; ключ до нього (K) випадковий і живе на
             пристрої;
     wrap  — той самий K, зашифрований ключем із пароля кабінета. Замок
             на ключі: пароль змінюється — змінюється лише замок, копію
             перекладати не треба;
     keep  — сам K, якщо тренер лишив увімкненим відновлення пароля.
             Саме він робить можливим «забув пароль — поверніть базу»,
             і саме він означає, що ми технічно можемо копію відкрити.
             Вимкнув відновлення — поля немає, і не можемо.

   Хто має доступ. Той, хто знає пароль. Доказ — token: SHA-256 від
   ключа, виведеного з пароля. Він не дає прочитати дані й не дає дешево
   підібрати пароль: щоб перевірити здогадку, доведеться щоразу проходити
   ті самі 150 000 ітерацій PBKDF2. Другий шлях — квиток від /api/reset,
   тобто підтверджена пошта; він дозволяє замінити замок, і тільки його.

   Сіль не секрет — її віддаємо за логіном. Без неї новий пристрій не
   зміг би вивести той самий ключ із того самого пароля. А от замок без
   token не віддаємо: інакше будь-хто, знаючи пошту, міг би підбирати
   пароль у себе вдома, не турбуючи сервер.

   GET  /api/db?login=…               чи є копія: {has, salt, savedAt}
   GET  /api/db?login=…&token=…       забрати копію
   POST /api/db?login=…&token=…       покласти копію {salt, wrap, iv, ct, keep}
   POST /api/db?login=…&token=…&ticket=…  замінити замок після відновлення
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');

const MAX = 1024 * 1024;                 /* 1 МБ — база тренера значно менша */
const keyOf = login => 'db:' + L.normLogin(login);
const TICKET = login => 'rk:' + L.normLogin(login);

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
    if (!token) return L.json(res, 400, {ok: false, error: 'no_token'});

    /* ─── новий замок після відновлення пароля ───
       Квиток одноразовий і живе чверть години. Він міняє тільки замок і
       token; шифротекст і keep лишаються — ключ від бази той самий. */
    if (q.ticket){
      const tk = await L.store.get(TICKET(login));
      if (!tk || tk.exp < Date.now() || !same(tk.ticket, q.ticket))
        return L.json(res, 403, {ok: false, error: 'bad_ticket'});
      if (!rec) return L.json(res, 200, {ok: false, error: 'empty'});
      if (!body.wrap) return L.json(res, 400, {ok: false, error: 'no_wrap'});
      await L.store.set(key, {...rec, token, wrap: body.wrap, salt: String(body.salt || rec.salt)});
      await L.store.set(TICKET(login), null);
      return L.json(res, 200, {ok: true, rekeyed: true});
    }

    if (!body.iv || !body.ct || !body.salt) return L.json(res, 400, {ok: false, error: 'no_data'});
    const size = String(body.ct).length;
    if (size > MAX) return L.json(res, 413, {ok: false, error: 'too_big', max: MAX});
    /* перший запис задає власника; далі — тільки він */
    if (rec && !same(rec.token, token)) return L.json(res, 403, {ok: false, error: 'wrong_token'});

    /* keep приходить порожнім, коли тренер вимкнув відновлення: тоді
       наш примірник ключа зникає тим самим запитом, що й зберігає базу —
       окремої «кнопки забути» не треба, і забути її теж не можна. */
    const rc = {
      token, salt: String(body.salt), wrap: body.wrap || null,
      iv: String(body.iv), ct: String(body.ct), savedAt: Date.now(), size,
    };
    if (body.keep) rc.keep = String(body.keep);
    await L.store.set(key, rc);
    return L.json(res, 200, {ok: true, savedAt: rc.savedAt, size});
  }

  /* без token кажемо лише те, що потрібно новому пристрою: копія є, ось сіль */
  if (!token)
    return L.json(res, 200, {ok: true, has: !!rec, salt: (rec && rec.salt) || '', savedAt: (rec && rec.savedAt) || 0});

  if (!rec) return L.json(res, 200, {ok: true, has: false});
  if (!same(rec.token, token)) return L.json(res, 403, {ok: false, error: 'wrong_token'});
  /* поля перелічені поіменно, а не розсипані з запису: keep звідси не
     має вийти ніколи, і випадкове «...rec» це б зламало мовчки */
  return L.json(res, 200, {ok: true, has: true, salt: rec.salt, wrap: rec.wrap || null,
                           iv: rec.iv, ct: rec.ct, savedAt: rec.savedAt, size: rec.size});
};

module.exports.keyOf = keyOf;
module.exports.TICKET = TICKET;
module.exports.MAX = MAX;
