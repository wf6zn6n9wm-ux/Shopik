/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · відновлення пароля

   Пароль до кабінету живе на пристрої: сервер його не знає й знати не
   повинен. Тому «відновлення» тут — це не надсилання пароля, а доказ,
   що поштова скринька справді ваша. Отримали код, ввели — застосунок
   дозволяє задати новий пароль локально.

   Разом із підтвердженням віддаємо ключ від копії бази — той самий,
   який лежить у нас, поки тренер не вимкнув відновлення, — і квиток на
   заміну замка. Тому новий пароль не коштує тренеру бази клієнтів.

   PIN-шифрування бази на пристрої — окрема річ, і його так відновити не
   можна: без нього база не читається ні нами, ні будь-ким іншим.

   GET /api/reset?login=…&lang=uk     надіслати код
   GET /api/reset?login=…&code=123456 перевірити код

   Телефонні логіни поки не підтримуємо: SMS потребує окремої платної
   служби, а вигадувати замість неї щось «майже робоче» тут не можна.
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');
const MAIL = require('../api/mail.js');

const TTL = 15 * 60 * 1000;        /* скільки живе код */
const PAUSE = 60 * 1000;           /* не частіше ніж раз на хвилину */
const TRIES = 5;                   /* стільки спроб на один код */

const keyOf = login => 'reset:' + L.normLogin(login);
const digits = () => String(Math.floor(Math.random() * 900000) + 100000);

module.exports = async function handler(req, res){
  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});
  if (login.indexOf('@') < 0) return L.json(res, 400, {ok: false, error: 'not_email'});

  const key = keyOf(login);
  const rec = await L.store.get(key);
  const now = Date.now();

  /* ─── перевірка коду ─── */
  if (q.code){
    if (!rec || rec.exp < now) return L.json(res, 200, {ok: true, verified: false, error: 'expired'});
    if (rec.tries >= TRIES) return L.json(res, 200, {ok: true, verified: false, error: 'too_many'});
    if (String(q.code).trim() !== rec.code){
      await L.store.set(key, {...rec, tries: rec.tries + 1});
      return L.json(res, 200, {ok: true, verified: false, error: 'wrong', left: TRIES - rec.tries - 1});
    }
    /* код одноразовий: інакше лист із ним лишався б ключем назавжди */
    await L.store.set(key, null);

    /* ─── що з копією бази ───
       Якщо тренер лишив увімкненим відновлення, у нас є ключ від його
       копії — віддаємо його разом із квитком на заміну замка. Це і є
       обіцяне «забув пароль — база на місці».

       Якщо ж відновлення вимкнене, ключа в нас немає й узяти нізвідки:
       копія зашифрована паролем, якого ніхто не пам'ятає. Тоді прибираємо
       її — інакше на сервері назавжди лишався б файл, який не прочитає
       ніхто, і пристрій не зміг би покласти на його місце свіжий. */
    const DB = require('../api/db.js');
    const box = await L.store.get(DB.keyOf(login));
    if (box && box.keep){
      const ticket = require('crypto').randomBytes(24).toString('base64');
      await L.store.set(DB.TICKET(login), {ticket, exp: now + TTL});
      return L.json(res, 200, {ok: true, verified: true, key: box.keep, salt: box.salt, ticket});
    }
    if (box) await L.store.set(DB.keyOf(login), null);
    return L.json(res, 200, {ok: true, verified: true, key: ''});
  }

  /* ─── надсилання коду ─── */
  if (rec && now - rec.sentAt < PAUSE)
    return L.json(res, 429, {ok: false, error: 'too_soon', wait: Math.ceil((PAUSE - (now - rec.sentAt)) / 1000)});

  /* ─── чи знаємо ми цей логін ───
     Без цієї перевірки будь-хто міг надсилати наші листи на будь-яку
     адресу: вписав чужу пошту — і людині прийшов лист від PRO Trainer.
     Це і чужа скринька, і наш домен, і наша квота на пошту.

     Відповідаємо однаково — і коли надіслали, і коли ні. Інакше сторінка
     перетворилась би на довідник: «є такий тренер у вас чи немає».     */
  const known = await L.store.get(require('../api/db.js').keyOf(login))
             || await L.store.get(require('../api/trial.js').keyOf(login))
             || await L.readLicence(login);
  if (!known) return L.json(res, 200, {ok: true, sent: true, minutes: TTL / 60000});

  const code = digits();
  await L.store.set(key, {code, exp: now + TTL, sentAt: now, tries: 0});

  const msg = MAIL.codeLetter(code, q.lang);
  const sent = await MAIL.deliver({to: login, ...msg});
  /* Якщо пошта не налаштована — кажемо прямо, а не вдаємо, що лист пішов:
     мовчазне «перевірте скриньку» змусило б людину чекати марно. */
  if (!sent.ok) return L.json(res, 503, {ok: false, error: sent.error || 'mail_failed'});

  return L.json(res, 200, {ok: true, sent: true, minutes: TTL / 60000});
};

module.exports.keyOf = keyOf;
module.exports.TTL = TTL;
module.exports.TRIES = TRIES;
