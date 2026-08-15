/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · відновлення пароля

   Пароль до кабінету живе на пристрої: сервер його не знає й знати не
   повинен. Тому «відновлення» тут — це не надсилання пароля, а доказ,
   що поштова скринька справді ваша. Отримали код, ввели — застосунок
   дозволяє задати новий пароль локально.

   Дані від цього не постраждають: пароль лише впускає в кабінет, він
   нічого не шифрує. Шифрування — це окремий PIN у налаштуваннях, і його
   так відновити не можна: без нього база не читається ні нами, ні
   будь-ким іншим.

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
    return L.json(res, 200, {ok: true, verified: true});
  }

  /* ─── надсилання коду ─── */
  if (rec && now - rec.sentAt < PAUSE)
    return L.json(res, 429, {ok: false, error: 'too_soon', wait: Math.ceil((PAUSE - (now - rec.sentAt)) / 1000)});

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
