/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · переписка з підтримкою

   Навіщо. Тренер, у якого щось не працює, до пошти не піде: він або
   напише в месенджер, або мовчки закриє застосунок. Тому питання
   задається прямо в застосунку, а відповідь приходить туди ж.

   Як влаштовано. Одна нитка на кабінет: `chat:<логін>`. Тренер пише сюди
   й читає звідси; ми відповідаємо або з адмінки, або з Telegram — туди ж
   падає повідомлення про кожен новий лист. Живого зв'язку немає й бути
   не може: на цьому тарифі сокетів нема, тож застосунок перепитує сервер,
   поки екран відкритий. На око різниці не видно.

   Хто має доступ до нитки. Той, хто довів, що це його кабінет:
     • token від копії бази — те саме, чим відкривається сама копія;
     • або пристрій, який сервер уже бачив під цим логіном: із нього
       почався пробний період, на ньому працює підписка, або з нього
       ця нитка й заведена.
   Перший, хто пише в порожню нитку, її й заводить — інакше тренер, який
   ще нічого не оплатив і завів кабінет до появи паролів, не зміг би
   поскаржитись саме тоді, коли йому це найпотрібніше.

   Чого тут навмисно немає. Ми не пишемо сюди нічого про роботу тренера
   самі: у нитці лише те, що людина набрала руками. Обіцянка «ми не
   стежимо за вами» коштує рівно стільки, скільки в найзручнішому місці
   її порушити.

   GET  /api/chat?login=…&device=…[&token=…]     забрати нитку
   POST /api/chat  {login, device, token, text}  написати
   POST /api/chat  {login, device, token, seen}  позначити прочитаним
   POST /api/chat  (заголовок від Telegram)      відповідь із месенджера

   Змінні оточення (Vercel → Settings → Environment Variables):
     TELEGRAM_TOKEN   токен бота від @BotFather
     TELEGRAM_CHAT    id розмови, куди слати сповіщення
     TELEGRAM_SECRET  довільний рядок; ним Telegram доводить, що вебхук
                      справді від нього, а не від того, хто вгадав адресу
   Без них чат працює — просто мовчки, і відповідати доведеться з адмінки.
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');
const DB = require('../api/db.js');
const TRIAL = require('../api/trial.js');

const keyOf = login => 'chat:' + L.normLogin(login);
const INDEX = 'chat:index';

const KEEP = 200;              /* стільки повідомлень лишаємо в нитці */
/* ─── знімок екрана до питання ───
   Половина питань у підтримку — це «ось так виглядає, поясніть». Словами
   таке переказують погано, і на з'ясування «а що саме ви бачите» іде
   день переписки.

   Знімок живе окремо від нитки й сам зникає через місяць. Разом із
   ниткою його тримати не можна: нитку ми читаємо цілком на кожен дотик
   екрана, і кожен такий дотик тягав би за собою всі знімки за півроку.
   А вічно — тим паче: місяця вистачає, щоб питання закрили, а платимо
   ми за сховище щодня.                                                */
const PIC_KEEP = 30 * 24 * 3600;   /* скільки живе знімок, секунд */
const PIC_MAX = 700 * 1024;        /* стеля довжини dataURL, символів */
const picKey = (login, id) => 'chatpic:' + L.normLogin(login) + ':' + id;
const MAX_LEN = 2000;          /* довше за це — вже не питання, а лист */
const RATE = 30;               /* повідомлень за годину з одного кабінета */
const HOUR = 3600000;

/* порівняння без раннього виходу: час відповіді не має підказувати,
   наскільки token близький до правильного */
const same = (a, b) => {
  const x = String(a || ''), y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
};

const TG = () => ({
  token: process.env.TELEGRAM_TOKEN || '',
  chat: process.env.TELEGRAM_CHAT || '',
  secret: process.env.TELEGRAM_SECRET || '',
  base: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '') || 'https://pro-trainer.pro',
});

/* ─────────── нитка ─────────── */
const empty = login => ({login: L.normLogin(login), msgs: [], devices: [], lang: '',
                         seenT: 0, seenS: 0, sent: []});
const read = async login => (await L.store.get(keyOf(login))) || null;

/* Скільки відповідей той бік ще не бачив. Рахуємо за номером останнього
   переглянутого рядка, а не прапорцем у кожному: рядки приходять із двох
   боків, і прапорці розійшлися б.

   Саме за номером, а не за часом. Спершу тут стояв час, і на цьому
   ловилась справжня помилка: відповідь, написана в ту саму мілісекунду,
   що й питання, виявлялась «уже прочитаною» й позначки не давала.
   Номери зростають самі по собі й на годинник не спираються. */
const lastId = rec => (rec.msgs.length ? rec.msgs[rec.msgs.length - 1].id : 0);
const unreadFor = (rec, who) => {
  const seen = (who === 't' ? rec.seenT : rec.seenS) || 0;
  return rec.msgs.filter(m => m.who !== who && m.id > seen).length;
};

/* Список ниток для адмінки. Без нього довелося б читати всі кабінети
   підряд, щоб дізнатись, у якому є непрочитане. */
async function touchIndex(rec){
  const list = (await L.store.get(INDEX)) || [];
  const last = rec.msgs[rec.msgs.length - 1] || null;
  const row = {
    login: rec.login,
    at: last ? last.at : 0,
    who: last ? last.who : '',
    /* У списку ниток видно останній рядок. Фото без слів лишає його
       порожнім — і нитка виглядає так, ніби людина нічого не написала.
       Тому підписуємо: питання є, просто воно картинкою. */
    text: last ? (last.text ? last.text.slice(0, 120) : (last.pic ? '📷 фото' : '')) : '',
    unread: unreadFor(rec, 's'),
    lang: rec.lang || '',
  };
  const next = list.filter(x => x.login !== rec.login);
  next.push(row);
  next.sort((a, b) => b.at - a.at);
  await L.store.set(INDEX, next);
  return row;
}

async function save(rec){
  rec.msgs = rec.msgs.slice(-KEEP);
  await L.store.set(keyOf(rec.login), rec);
  await touchIndex(rec);
  return rec;
}

/* Додати рядок. who: 't' — тренер, 's' — підтримка. */
async function add(login, who, text, extra){
  const rec = (await read(login)) || empty(login);
  const msg = {id: (rec.msgs.length ? rec.msgs[rec.msgs.length - 1].id : 0) + 1,
               at: Date.now(), who, text: String(text).slice(0, MAX_LEN)};
  /* У нитці лишається сама позначка, а знімок — під своїм ключем. Якщо
     запис знімка не вдався, позначку не ставимо: «фото» без фото гірше,
     ніж повідомлення без нього. */
  if (extra && extra.pic){
    try { await L.store.set(picKey(login, msg.id), extra.pic, PIC_KEEP); msg.pic = 1; }
    catch { /* лишиться саме питання, текстом */ }
  }
  rec.msgs.push(msg);
  if (extra && extra.device && !rec.devices.includes(extra.device)) rec.devices.push(extra.device);
  if (extra && extra.lang) rec.lang = extra.lang;
  /* власні рядки одразу вважаємо прочитаними тим, хто їх написав */
  if (who === 't') rec.seenT = msg.id; else rec.seenS = msg.id;
  await save(rec);
  return {rec, msg};
}

/* ─────────── хто це ─────────── */
async function allowed(login, device, token){
  const rec = await read(login);
  if (token){
    const db = await L.store.get(DB.keyOf(login));
    if (db && db.token && same(db.token, token)) return true;
  }
  if (!device) return false;
  if (rec && rec.devices.includes(device)) return true;
  const tr = await L.store.get(TRIAL.keyOf(login));
  if (tr && tr.device === device) return true;
  const lic = await L.readLicence(login);
  if (lic && (lic.devices || []).includes(device)) return true;
  /* нитки ще немає — той, хто пише перший, її й заводить */
  return !rec;
}

/* Скільки листів прийшло за останню годину. Захист не від тренера, а від
   того, хто вирішить залити нам сховище: читаємо нитку цілком. */
function tooFast(rec){
  const now = Date.now();
  rec.sent = (rec.sent || []).filter(ts => now - ts < HOUR);
  return rec.sent.length >= RATE;
}

/* ─────────── Telegram ───────────
   Сповіщення й відповідь на нього — це весь месенджер, що нам потрібен.
   Логін стоїть першим рядком: відповідаючи на повідомлення, ми беремо
   адресата саме звідти, і нічого набирати руками не треба. */
async function notify(rec, msg, pic){
  const tg = TG();
  if (!tg.token || !tg.chat) return false;
  const text = rec.login + '\n\n' + (msg.text || '(фото без тексту)') +
    '\n\n— відповідайте на це повідомлення, і відповідь піде в застосунок' +
    '\n' + tg.base + '/admin';
  try {
    /* Зі знімком іде sendPhoto: у месенджері його видно одразу, а не
       посиланням, за яким ще треба сходити. Підпис той самий, тож
       відповідь на нього так само знаходить адресата.

       Не вийшло надіслати картинку — надсилаємо саме питання текстом.
       Мовчання бота гірше за повідомлення без картинки: питання є, а
       ми про нього не знаємо.                                        */
    if (pic){
      const m = /^data:(image\/[a-z+]+);base64,([\s\S]+)$/i.exec(pic);
      if (m){
        const form = new FormData();
        form.append('chat_id', String(tg.chat));
        form.append('caption', text.slice(0, 1024));
        form.append('photo', new Blob([Buffer.from(m[2], 'base64')], {type: m[1]}), 'screen.jpg');
        const p = await fetch('https://api.telegram.org/bot' + tg.token + '/sendPhoto', {
          method: 'POST', body: form, signal: AbortSignal.timeout(8000),
        });
        if (p.ok) return true;
      }
    }
    const r = await fetch('https://api.telegram.org/bot' + tg.token + '/sendMessage', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({chat_id: tg.chat, text, disable_web_page_preview: true}),
      signal: AbortSignal.timeout(4000),
    });
    return r.ok;
  } catch { return false; }         /* мовчання бота не має ламати відправку */
}

async function tgSay(text){
  const tg = TG();
  if (!tg.token || !tg.chat) return;
  try {
    await fetch('https://api.telegram.org/bot' + tg.token + '/sendMessage', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({chat_id: tg.chat, text, disable_web_page_preview: true}),
      signal: AbortSignal.timeout(4000),
    });
  } catch { /* нічого не вдієш */ }
}

/* Кому відповідь. Два способи, обидва без зайвих рухів:
     • відповісти на сповіщення — логін беремо з його першого рядка;
     • написати «пошта: текст» — на випадок, коли сповіщення загубилось. */
function addressee(update){
  const m = (update && update.message) || {};
  /* Підпис до картинки лежить у caption, а не в text — і в тому, що
     надсилаємо ми, і в тому, що надсилають нам. Поки сповіщення було
     самим текстом, різниці не було; щойно воно стало картинкою з
     підписом, бот перестав упізнавати адресата у відповіді на нього. */
  const body = String(m.text || m.caption || '').trim();
  const src = m.reply_to_message &&
              String(m.reply_to_message.text || m.reply_to_message.caption || '');
  if (src){
    const first = src.split('\n')[0].trim();
    if (first) return {login: first, text: body};
  }
  const cut = body.indexOf(':');
  if (cut > 0){
    const who = body.slice(0, cut).trim();
    if (/^[^\s@]+@[^\s@]+$/.test(who) || /^\+?\d[\d\s-]{6,}$/.test(who))
      return {login: who, text: body.slice(cut + 1).trim()};
  }
  return null;
}

/* ─── картинка з Telegram ───
   Тренер шле знімок екрана — відповідати йому теж доводиться знімком:
   «натисніть отут» пояснюється стрілкою, а не абзацом.

   Telegram віддає картинку не файлом, а посиланням у два кроки: спершу
   getFile за ідентифікатором, потім саме завантаження. Розмірів у нього
   кілька — беремо найбільший, що влазить у нашу стелю: показувати його
   на телефоні, а не друкувати.                                        */
async function picFromTelegram(sizes){
  const tg = TG();
  if (!tg.token || !Array.isArray(sizes) || !sizes.length) return null;
  /* base64 більший за самі байти на третину — рахуємо стелю в байтах */
  const room = Math.floor(PIC_MAX * 3 / 4);
  const fit = sizes.filter(x => !x.file_size || x.file_size <= room)
                   .sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
  if (!fit) return null;
  try {
    const info = await fetch('https://api.telegram.org/bot' + tg.token +
                             '/getFile?file_id=' + encodeURIComponent(fit.file_id),
                             {signal: AbortSignal.timeout(6000)}).then(r => r.json());
    const path = info && info.ok && info.result && info.result.file_path;
    if (!path) return null;
    const r = await fetch('https://api.telegram.org/file/bot' + tg.token + '/' + path,
                          {signal: AbortSignal.timeout(10000)});
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > room) return null;
    const type = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
    return 'data:' + type + ';base64,' + buf.toString('base64');
  } catch { return null; }
}

async function fromTelegram(req, res){
  const update = req.body || {};
  const to = addressee(update);
  const shot = await picFromTelegram(((update.message || {}).photo) || []);
  /* Картинка без підпису — теж відповідь: «ось де це». Вимагати ще й
     слів означало б змусити написати «дивіться фото». */
  if (!to || (!to.text && !shot)) {
    await tgSay('Не зрозумів, кому це. Відповідайте на сповіщення або напишіть «пошта: текст».');
    return L.json(res, 200, {ok: true, ignored: true});
  }
  const login = L.normLogin(to.login);
  if (!(await read(login))){
    await tgSay('Кабінета ' + login + ' у переписці немає.');
    return L.json(res, 200, {ok: true, ignored: true});
  }
  const {msg} = await add(login, 's', to.text, {pic: shot});
  /* Картинка могла не доїхати — краще сказати про це одразу, ніж лишити
     людину з відповіддю без того, заради чого її слали. */
  if (shot && !msg.pic) await tgSay('Текст пішов, а картинку зберегти не вдалось.');
  else if (!shot && ((update.message || {}).photo || []).length)
    await tgSay('Картинка завелика — пішов лише текст.');
  return L.json(res, 200, {ok: true, sent: true, pic: msg.pic ? 1 : 0});
};

/* ─────────── сам обробник ─────────── */
module.exports = async function handler(req, res){
  /* розвідник перед POST з нативної оболонки — див. L.preflight */
  if (L.preflight(req, res)) return;
  const method = (req.method || 'GET').toUpperCase();

  /* Вебхук Telegram. Секрет у заголовку — єдине, що відрізняє його від
     будь-кого, хто вгадав адресу; без нього відповідати від нашого імені
     міг би хто завгодно. */
  if (method === 'POST' && req.headers && req.headers['x-telegram-bot-api-secret-token'] !== undefined){
    const secret = TG().secret;
    if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret)
      return L.json(res, 403, {ok: false, error: 'bad_secret'});
    return fromTelegram(req, res);
  }

  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  const token = String(q.token || '');
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});
  if (!(await allowed(login, device, token))) return L.json(res, 403, {ok: false, error: 'not_yours'});

  if (method === 'GET'){
    /* Знімок віддаємо поштучно, а не разом із ниткою: нитку застосунок
       перепитує щокілька секунд, поки відкритий екран, і возити з нею
       картинки означало б качати їх заново весь час. Питає він лише те,
       що зараз показує. */
    if (q.pic){
      const pic = await L.store.get(picKey(login, String(q.pic).replace(/\D/g, '')));
      if (!pic) return L.json(res, 404, {ok: false, error: 'no_pic'});
      return L.json(res, 200, {ok: true, pic});
    }
    const rec = await read(login);
    if (!rec) return L.json(res, 200, {ok: true, msgs: [], unread: 0});
    return L.json(res, 200, {ok: true, unread: unreadFor(rec, 't'),
                             msgs: rec.msgs.map(m => ({id: m.id, at: m.at, who: m.who, text: m.text,
                                                       ...(m.pic ? {pic: 1} : {})}))});
  }

  if (method !== 'POST') return L.json(res, 405, {ok: false, error: 'bad_method'});

  /* «я це прочитав» — щоб позначка про нові відповіді гасла */
  if (q.seen){
    const rec = (await read(login)) || empty(login);
    rec.seenT = lastId(rec);
    await save(rec);
    return L.json(res, 200, {ok: true, unread: 0});
  }

  /* Знімок без слів — теж питання: «ось так виглядає». Вимагати ще й
     текст означало б змусити людину написати «дивіться фото». */
  const pic = String(q.pic || '');
  const hasPic = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(pic)
                 && pic.length <= PIC_MAX;
  if (pic && !hasPic) return L.json(res, 400, {ok: false, error: 'bad_pic'});

  const text = String(q.text || '').trim();
  if (!text && !hasPic) return L.json(res, 400, {ok: false, error: 'no_text'});

  const before = (await read(login)) || empty(login);
  if (tooFast(before)) return L.json(res, 429, {ok: false, error: 'too_fast'});
  before.sent.push(Date.now());
  await L.store.set(keyOf(login), before);

  const {rec, msg} = await add(login, 't', text, {device, lang: q.lang,
                                                 pic: hasPic ? pic : null});
  const told = await notify(rec, msg, hasPic ? pic : null);
  return L.json(res, 200, {ok: true, id: msg.id, at: msg.at, pic: msg.pic ? 1 : 0, told});
};

module.exports.keyOf = keyOf;
module.exports.picKey = picKey;
module.exports.PIC_MAX = PIC_MAX;
module.exports.INDEX = INDEX;
module.exports.read = read;
module.exports.add = add;
module.exports.save = save;
module.exports.empty = empty;
module.exports.unreadFor = unreadFor;
module.exports.lastId = lastId;
module.exports.addressee = addressee;
module.exports.MAX_LEN = MAX_LEN;
module.exports.RATE = RATE;
