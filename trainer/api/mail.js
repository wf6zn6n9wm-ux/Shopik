/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · листи про кінець пробного періоду

   Навіщо. У збірках для магазинів застосунок нічого не продає й не має
   права вести на оплату — таке правило Apple. Людина впирається в екран
   «підписка неактивна» і далі мусить сама згадати адресу сайту. Лист —
   єдине місце, де посилання на оплату дозволене, бо він поза
   застосунком. Без нього вся схема з безкоштовними застосунками
   лишається без останнього кроку.

   Коли. Двічі: за три дні до кінця пробного і в день, коли він
   закінчився. Більше не треба — це не розсилка, а нагадування.

   Кому. Логін у застосунку і є пошта, тож адресу ми вже знаємо. Якщо
   логін — телефон, лист не йде: писати нікуди.

   Змінні оточення (Vercel → Settings → Environment Variables):
     RESEND_API_KEY   ключ поштового сервісу; без нього нічого не шлеться
     MAIL_FROM        від кого, наприклад PRO Trainer <no-reply@…>
     CRON_SECRET      Vercel сам підставляє його в заголовок для крону.
                      Той самий секрет лежить у GitHub — ним працює ручна
                      відправка тестового листа (.github/workflows/mail-test.yml)
     PUBLIC_BASE_URL  https://pro-trainer.pro

   Поки ключа немає, ендпоінт працює й відповідає чесно: скільки листів
   пішло б і кому. Це дає перевірити розсилку до підключення сервісу.
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');
const T = require('../api/trial.js');

const DAY = 86400000;
const SOON_DAYS = 3;                 /* за скільки днів попереджаємо */

const ENV = () => ({
  key: process.env.RESEND_API_KEY || '',
  from: process.env.MAIL_FROM || 'PRO Trainer <no-reply@pro-trainer.pro>',
  secret: process.env.CRON_SECRET || '',
  base: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '') || 'https://pro-trainer.pro',
});

/* ─────────── тексти ───────────
   Мова береться та, якою людина користується в застосунку: її записує
   /api/trial у момент старту пробного. */
const TEXT = {
  uk: {
    soonSubj: 'Пробний період PRO Trainer завершується за 3 дні',
    endSubj:  'Пробний період PRO Trainer завершився',
    hi:       'Вітаємо!',
    soonBody: 'За три дні безкоштовний доступ до PRO Trainer завершиться. Щоб працювати без перерви, оформіть підписку — усі ваші клієнти, тренування та фінанси лишаться на місці.',
    endBody:  'Безкоштовний доступ до PRO Trainer завершився. Усі ваші клієнти, тренування та фінансові дані збережені й чекають на вас — щоб продовжити роботу, оформіть підписку.',
    cta:      'Оформити підписку',
    after:    'Після оплати поверніться в застосунок і натисніть «Я вже оплатив» — доступ відкриється.',
    bye:      'Якщо ви не користуєтесь PRO Trainer, просто не відповідайте на цей лист.',
  },
  ru: {
    soonSubj: 'Пробный период PRO Trainer заканчивается через 3 дня',
    endSubj:  'Пробный период PRO Trainer закончился',
    hi:       'Здравствуйте!',
    soonBody: 'Через три дня бесплатный доступ к PRO Trainer закончится. Чтобы работать без перерыва, оформите подписку — все ваши клиенты, тренировки и финансы останутся на месте.',
    endBody:  'Бесплатный доступ к PRO Trainer закончился. Все ваши клиенты, тренировки и финансовые данные сохранены и ждут вас — чтобы продолжить работу, оформите подписку.',
    cta:      'Оформить подписку',
    after:    'После оплаты вернитесь в приложение и нажмите «Я вже оплатив» — доступ откроется.',
    bye:      'Если вы не пользуетесь PRO Trainer, просто не отвечайте на это письмо.',
  },
  en: {
    soonSubj: 'Your PRO Trainer free trial ends in 3 days',
    endSubj:  'Your PRO Trainer free trial has ended',
    hi:       'Hello!',
    soonBody: 'Your free access to PRO Trainer ends in three days. Subscribe to keep working without a break — your clients, sessions and finances stay exactly where they are.',
    endBody:  'Your free access to PRO Trainer has ended. All your clients, sessions and financial data are saved and waiting — subscribe to carry on.',
    cta:      'Subscribe',
    after:    'After paying, go back to the app and tap “Я вже оплатив” — access will open.',
    bye:      'If you no longer use PRO Trainer, just ignore this email.',
  },
  pl: {
    soonSubj: 'Okres próbny PRO Trainer kończy się za 3 dni',
    endSubj:  'Okres próbny PRO Trainer się zakończył',
    hi:       'Dzień dobry!',
    soonBody: 'Za trzy dni bezpłatny dostęp do PRO Trainer się skończy. Wykup subskrypcję, aby pracować bez przerwy — klienci, treningi i finanse zostaną na miejscu.',
    endBody:  'Bezpłatny dostęp do PRO Trainer się skończył. Wszyscy klienci, treningi i dane finansowe są zapisane i czekają — wykup subskrypcję, aby kontynuować.',
    cta:      'Wykup subskrypcję',
    after:    'Po opłaceniu wróć do aplikacji i naciśnij „Я вже оплатив” — dostęp się otworzy.',
    bye:      'Jeśli nie korzystasz z PRO Trainer, po prostu zignoruj tę wiadomość.',
  },
};
/* Лист із кодом для відновлення пароля. Окремо від нагадувань: у нього
   інша робота — доставити шість цифр так, щоб їх було видно одразу. */
const CODE = {
  uk: {subj: 'Код для входу в PRO Trainer', hi: 'Вітаємо!',
       body: 'Ваш код для відновлення пароля:', tail: 'Код діє 15 хвилин. Якщо ви його не замовляли — просто не відповідайте на цей лист, пароль лишиться попереднім.'},
  ru: {subj: 'Код для входа в PRO Trainer', hi: 'Здравствуйте!',
       body: 'Ваш код для восстановления пароля:', tail: 'Код действует 15 минут. Если вы его не запрашивали — просто не отвечайте на это письмо, пароль останется прежним.'},
  en: {subj: 'Your PRO Trainer sign-in code', hi: 'Hello!',
       body: 'Your password recovery code:', tail: 'The code is valid for 15 minutes. If you didn’t request it, ignore this email — your password stays as it is.'},
  pl: {subj: 'Kod logowania do PRO Trainer', hi: 'Dzień dobry!',
       body: 'Twój kod do odzyskania hasła:', tail: 'Kod jest ważny 15 minut. Jeśli go nie zamawiałeś, zignoruj tę wiadomość — hasło pozostanie bez zmian.'},
};

const lang = l => (TEXT[l] ? l : 'uk');

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function payUrl(login, l){
  return ENV().base + '/pay?login=' + encodeURIComponent(login) + '&lang=' + lang(l);
}

/* Лист навмисно простий: один абзац і одна кнопка. Поштові клієнти
   ріжуть усе складніше по-різному, а завдання листа — один перехід. */
function letter(kind, login, l){
  const t = TEXT[lang(l)];
  const url = payUrl(login, l);
  const body = kind === 'end' ? t.endBody : t.soonBody;
  const subject = kind === 'end' ? t.endSubj : t.soonSubj;
  const text = [t.hi, '', body, '', t.cta + ': ' + url, '', t.after, '', t.bye].join('\n');
  const html =
    '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#12121A;max-width:520px">' +
    '<p style="margin:0 0 14px">' + esc(t.hi) + '</p>' +
    '<p style="margin:0 0 18px">' + esc(body) + '</p>' +
    '<p style="margin:0 0 18px"><a href="' + esc(url) + '" ' +
      'style="display:inline-block;background:#6B4DFF;color:#fff;text-decoration:none;' +
      'padding:12px 22px;border-radius:12px;font-weight:700">' + esc(t.cta) + '</a></p>' +
    '<p style="margin:0 0 14px;color:#5A5A6B;font-size:14px">' + esc(t.after) + '</p>' +
    '<p style="margin:0;color:#8C8C9C;font-size:13px">' + esc(t.bye) + '</p>' +
    '</div>';
  return {subject, text, html, url};
}

function codeLetter(code, l){
  const t = CODE[CODE[l] ? l : 'uk'];
  const text = [t.hi, '', t.body, '', code, '', t.tail].join('\n');
  const html =
    '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#12121A;max-width:520px">' +
    '<p style="margin:0 0 14px">' + esc(t.hi) + '</p>' +
    '<p style="margin:0 0 12px">' + esc(t.body) + '</p>' +
    '<p style="margin:0 0 18px;font:800 34px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;' +
      'letter-spacing:.12em;color:#6B4DFF">' + esc(code) + '</p>' +
    '<p style="margin:0;color:#8C8C9C;font-size:13px">' + esc(t.tail) + '</p>' +
    '</div>';
  return {subject: t.subj, text, html};
}

/* Відправка. Винесена окремо й береться через module.exports — так
   перевірки підміняють її й не ходять у мережу. */
async function deliver({to, subject, text, html}){
  const {key, from} = ENV();
  if (!key) return {ok: false, error: 'no_key'};
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {'authorization': 'Bearer ' + key, 'content-type': 'application/json'},
    body: JSON.stringify({from, to, subject, text, html}),
  });
  if (!r.ok) return {ok: false, error: 'http_' + r.status};
  return {ok: true};
}

const dayKey = ts => new Date(ts).toISOString().slice(0, 10);
const sentKey = (kind, login) => 'sent:' + kind + ':' + L.normLogin(login);

/* Кому писати сьогодні: відро того дня, коли пробний закінчується.
   Відра складає /api/trial у момент старту — інакше розсилці довелося б
   перебирати всі логіни поспіль, а сховище цього не вміє. */
async function due(kind, now){
  const at = kind === 'end' ? now : now + SOON_DAYS * DAY;
  return (await L.store.get(T.dueKey(at))) || [];
}

/* Один лист. Повертає, що саме сталося — це ж і йде у відповідь. */
async function one(kind, login, now){
  const norm = L.normLogin(login);
  if (norm.indexOf('@') < 0) return 'no_email';

  const lic = await L.readLicence(norm);
  if (lic && lic.expiresAt > now) return 'paid';        /* уже оплатив — мовчимо */

  const flag = sentKey(kind, norm);
  if (await L.store.get(flag)) return 'already';

  const rec = await L.store.get(T.keyOf(norm));
  const msg = letter(kind, norm, (rec && rec.lang) || 'uk');
  const r = await module.exports.deliver({to: norm, ...msg});
  if (!r.ok) return r.error;
  await L.store.set(flag, now);
  return 'sent';
}

module.exports = async function handler(req, res){
  const {secret, key} = ENV();
  const auth = String(req.headers['authorization'] || '');
  /* Крон Vercel сам додає заголовок із CRON_SECRET. Якщо секрет не
     заданий — пускаємо лише внутрішній виклик крону, інакше розсилку
     міг би запустити хто завгодно. */
  const allowed = secret ? auth === 'Bearer ' + secret : !!req.headers['x-vercel-cron'];
  if (!allowed) return L.json(res, 401, {ok: false, error: 'forbidden'});

  const q = req.query || {};

  /* Одне тестове письмо на вказану адресу. Тим самим кодом, що й
     розсилка, — інакше перевіряли б не те, що працює насправді.
     Списків і позначок не чіпає: це проба, а не відправка. */
  const test = String(q.test || '').trim();
  if (test){
    const kind = q.kind === 'soon' ? 'soon' : 'end';
    const msg = module.exports.letter(kind, L.normLogin(test), q.lang || 'uk');
    const r = await module.exports.deliver({to: test, ...msg});
    return L.json(res, r.ok ? 200 : 502,
      {ok: r.ok, test: true, kind, to: test, subject: msg.subject, ...(r.ok ? {} : {error: r.error})});
  }

  const now = Number(q.now) || Date.now();
  const report = {ok: true, day: dayKey(now), configured: !!key, soon: {}, end: {}};

  for (const kind of ['soon', 'end']){
    for (const login of await due(kind, now)){
      const what = await one(kind, login, now);
      report[kind][what] = (report[kind][what] || 0) + 1;
    }
  }
  return L.json(res, 200, report);
};

module.exports.deliver = deliver;
module.exports.letter = letter;
module.exports.codeLetter = codeLetter;
module.exports.CODE = CODE;
module.exports.one = one;
module.exports.due = due;
module.exports.TEXT = TEXT;
module.exports.SOON_DAYS = SOON_DAYS;
