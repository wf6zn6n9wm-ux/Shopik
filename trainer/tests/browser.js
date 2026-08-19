/* ──────────────────────────────────────────────────────────────────
   Сторінки оплати — у справжньому браузері.

   Решта перевірок ганяє застосунок у пісочниці без DOM: там немає
   кліків, форм і переходів. Сторінки оплати — це звичайні HTML із
   звичайним JS, і саме вони торкаються грошей, тож перевіряти їх на
   око — найгірше місце для економії.

   Тут піднімається сервер, який роздає trainer/ і виконує справжні
   функції з api/ (ті самі, що на Vercel), і headless-браузер реально
   клікає. Перевіряємо і те, що видно на сторінці, і те, який запит
   пішов на сервер — бо помилка в параметрах не видно очима.

   Сам застосунок (index.html) сюди не входить: він потребує React із
   CDN, а мережі в цьому середовищі немає.

     node trainer/tests/browser.js
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const http = require('http');
const path = require('path');
const {spawn} = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8771;

/* Ключі мерчанта потрібні, щоб серверні функції взагалі відповідали:
   без них вони чесно кажуть «не налаштовано». Значення вигадані —
   до банку ми звідси все одно не достукаємось, і це теж перевірка:
   сторінка має пережити недоступний банк. */
process.env.LIQPAY_PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY || 'test_public';
process.env.LIQPAY_PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY || 'test_private';
/* Без пароля адмінка чесно каже «не налаштовано» і далі не пускає —
   перевіряти було б нічого. */
process.env.ADMIN_PASS = process.env.ADMIN_PASS || 'test_admin';
const L = require('../api/_lib.js');

/* Пошту звідси не відправити, та й не треба: перевіряємо не Resend, а
   свій шлях відновлення. Лист лишається в пам'яті, а проба читає код
   через /_test/code — рівно те саме, що людина робить очима у скриньці. */
const MAIL = require('../api/mail.js');
const sent = [];
MAIL.deliver = async letter => { sent.push(letter); return {ok: true, id: 'test'}; };

const CHROME = process.env.CHROME || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!CHROME){ console.error('не знайшов Chrome — вкажіть CHROME=/шлях/до/chrome'); process.exit(1); }

/* ─────────── сервер ─────────── */
const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml'};
const log = [];
/* проби — маленькі скрипти, які клікають і пишуть підсумок у сторінку */
const PROBES = {};

/* Компіляція JSX — найдорожча операція в цьому сервері, а сторінку
   застосунку просять понад десяток проб. Робимо її один раз: сервер
   живе в одному процесі з прогоном, і поки він компілює, він нікому не
   відповідає. Проб побільшало — і повтори «проба не встигла» разом із
   ними. */
let built = null;
const compiled = () => built || (built =
  require('../build.js').build(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));

/* ─── заміна, яка не вміє промахнутись мовчки ───
   Раніше вона перевіряла лише «збіг є» й міняла перший. Цього виявилось
   мало: у застосунку з'явилось друге таке саме місце — питання до
   сервера про копію тепер є і при вході, і при реєстрації, — заміна
   мовчки лягла не туди, і половина проб почала падати з незрозумілим
   «реєстрація не завершилась».

   Тому тепер вимагаємо точну кількість збігів. З'явиться третє місце —
   прогін впаде з поясненням, а не почне перевіряти щось інше. */
const replaceOnce = (text, re, to, what, times = 1) => {
  const all = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const n = (text.match(all) || []).length;
  if (n !== times)
    throw new Error('«' + what + '»: очікували збігів — ' + times + ', знайшли ' + n);
  return text.replace(all, to);
};

/* Переадресації з vercel.json. Без них тут /api/unsubscribe уперся б у
   404, хоча на сайті працює: функції під цим ім'ям більше немає, є
   правило, що веде на licence. Читаємо правило звідти ж, звідки його
   бере Vercel, — інакше перевірка підтверджувала б не той шлях, яким
   ходять застосунки в людей на телефонах. */
const REWRITES = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites || []; }
  catch { return []; }
})();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rule = REWRITES.find(r => r.source === url.pathname);
  if (rule){
    const to = new URL(rule.destination, 'http://127.0.0.1');
    url.pathname = to.pathname;
    to.searchParams.forEach((v, k) => { if (!url.searchParams.has(k)) url.searchParams.set(k, v); });
  }
  log.push({path: url.pathname, query: Object.fromEntries(url.searchParams)});

  /* Сам застосунок: скомпільований (без Babel) і з маленьким React
     замість CDN. Зовнішні посилання прибираємо — не через економію, а
     тому що запит, який нікуди не доходить, зупиняє віртуальний час у
     headless, і сторінка не дочекається ніколи. */
  if (url.pathname === '/_app.html'){
    let html = compiled();
    html = html.replace(/<script crossorigin src="https:\/\/unpkg\.com[^"]*"><\/script>\s*/g, '')
               .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
               .replace(/<link href="https:\/\/fonts\.googleapis\.com[^"]*"[^>]*>\s*/g, '')
               .replace('</head>', '<script src="/_test/react-mini.js"></script></head>');
    /* Застосунок ходить на бойовий домен, бо WEB.base заданий явно — у
       нативній оболонці інакше не можна. Для перевірки підміняємо його
       на порожній: тоді запити йдуть на цей самий сервер, де живуть ті
       самі серверні функції. Підміна тільки у виданій копії.

       Лапки беремо будь-які: збирач зводить їх до подвійних, і пошук за
       одинарними мовчки не спрацьовував — застосунок ходив у мережу, а
       перевірка цього не бачила. Тому й падаємо, якщо не знайшли: німа
       заміна тут гірша за помилку.
       Робимо це завжди: застосунок питає сервер уже під час реєстрації,
       і запит, який нікуди не доходить, зупиняє віртуальний час — жодна
       проба після цього не дочекається екрана. */
    html = replaceOnce(html, /base:\s*["']https:\/\/pro-trainer\.pro["']/, "base: ''", 'адреса сайту');

    /* Вивід ключа з пароля (PBKDF2, 150 000 ітерацій) у headless не
       встигає: віртуальний час не чекає обчислень і вивантажує сторінку
       раніше, ніж браузер дорахує. На пристрої це частка секунди.
       Тому в тестовій копії ітерацій менше — увесь шлях шифрування
       лишається справжнім, дешевшає лише перебір. */
    html = replaceOnce(html, /iterations:\s*150000/g, 'iterations: 1000', 'вивід ключа', 2);

    /* Копія на сервері зберігається через десять секунд після зміни. Під
       віртуальним часом ці секунди проходять миттєво, тож кожен дотик у
       пробі тягнув би шифрування і запит — і проби перестали доходити до
       кінця. Відсуваємо збереження за межі прогону; сам шлях копії
       перевіряє окрема проба, яка кличе Cloud.push() напряму. */
    /* збирач пише 10000 як 1e4 — приймаємо обидва написання */
    html = replaceOnce(html, /Cloud\.push\(json\),\s*(?:10000|1e4)\)/, 'Cloud.push(json), 600000)', 'відкладене збереження');

    /* Застосунок питає сервер, чи є копія, — і при вході, і при
       реєстрації. Обидва місця потрібні тільки там, де копію й
       перевіряємо: решті проб цей запит нічого не дає, а логін у прогоні
       спільний, і сусідня проба, яка змінила пароль, ламала б їх усі. */
    if (!url.searchParams.get('cloud'))
      html = replaceOnce(html, /Web\.enabled\(\) \? await Cloud\.peek\(norm\)/,
                         'false ? await Cloud.peek(norm)', 'запит про копію', 2);
    /* free=1 — те саме, що робить збірка для магазину: прапорець прибирає
       покупку і всі виходи на оплату */
    if (url.searchParams.get('free'))
      html = html.replace('</body>', '<script>window.PRO_TRAINER_FREE = true;</script></body>');
    const probe = url.searchParams.get('probe');
    if (probe) html = html.replace('</body>', '<script src="/_probe/' + probe + '"></script></body>');
    res.writeHead(200, {'content-type': TYPES['.html']});
    return res.end(html);
  }

  /* Перевірка самого маленького React. Без неї всі перевірки застосунку
     стоять на непідтвердженій основі: якщо тут щось поводиться не так,
     як у React, зелений результат нічого не вартий. */
  if (url.pathname === '/_mini.html'){
    res.writeHead(200, {'content-type': TYPES['.html']});
    return res.end('<!doctype html><meta charset="utf-8"><div id="root"></div>' +
      '<script src="/_test/react-mini.js"></script>' +
      '<script src="/_probe/mini.js"></script>');
  }

  if (url.pathname === '/_test/react-mini.js'){
    res.writeHead(200, {'content-type': TYPES['.js']});
    return res.end(fs.readFileSync(path.join(__dirname, 'react-mini.js')));
  }

  /* Код із листа — так само, як тренер дістає його зі скриньки. Живе
     лише в цьому прогоні: у справжньому api такої дороги немає. */
  if (url.pathname === '/_test/code'){
    const rec = await L.store.get(require('../api/reset.js').keyOf(url.searchParams.get('login')));
    res.writeHead(200, {'content-type': TYPES['.js'], 'cache-control': 'no-store'});
    return res.end(JSON.stringify({code: (rec && rec.code) || '', letters: sent.length}));
  }

  /* Відповідь підтримки. У житті її кладе адмінка або Telegram — обидва
     через ту саму функцію, тож тут кличемо її напряму: пробі потрібен
     сам факт відповіді, а не спосіб її набрати. */
  if (url.pathname === '/_test/reply'){
    await require('../api/chat.js').add(url.searchParams.get('login'), 's', url.searchParams.get('text'));
    res.writeHead(200, {'content-type': TYPES['.js'], 'cache-control': 'no-store'});
    return res.end('{"ok":true}');
  }

  if (url.pathname.startsWith('/_probe/')){
    res.writeHead(200, {'content-type': TYPES['.js']});
    return res.end(PROBES[url.pathname.slice(8)] || '');
  }

  /* справжні серверні функції — ті самі, що на Vercel */
  if (url.pathname.startsWith('/api/')){
    const name = url.pathname.slice(5);
    const file = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(file)){ res.writeHead(404); return res.end('no api'); }
    req.query = Object.fromEntries(url.searchParams);
    /* Тіло запиту на Vercel розбирається саме; тут це доводиться робити
       руками, інакше POST приходить порожнім — і копія бази «не
       зберігалась» саме тому, а не через застосунок. */
    if ((req.method || 'GET').toUpperCase() === 'POST'){
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    }
    res.status = code => { res.statusCode = code; return res; };
    res.send = body => res.end(body);
    try { await require(file)(req, res); }
    catch (e){ res.writeHead(500); res.end(String(e && e.message)); }
    return;
  }

  const name = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(ROOT, name.endsWith('.html') || path.extname(name) ? name : name + '.html');
  if (!fs.existsSync(file)){ res.writeHead(404); return res.end('not found'); }
  let body = fs.readFileSync(file);
  /* пробу підмішуємо в справжню сторінку, а не підміняємо сторінку */
  const probe = url.searchParams.get('probe');
  if (probe && path.extname(file) === '.html')
    body = Buffer.from(String(body).replace('</body>', '<script src="/_probe/' + probe + '"></script></body>'));
  res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
  res.end(body);
});

/* ─────────── прогін ─────────── */
/* Браузер запускаємо саме асинхронно. Синхронний запуск блокує цикл
   подій — і сервер, який живе в цьому ж процесі, не встигає відповісти:
   браузер чекає сторінку, сервер чекає, поки його відпустять. */
/* Прапорці, без яких Chrome нестабільний у контейнері: спільна пам'ять
   там урізана, профіль створювати нікуди, а перший запуск норовить
   спитати про браузер за замовчуванням. */
const FLAGS = ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--hide-scrollbars', '--window-size=430,900', '--dump-dom',
  /* Застосунок живе на телефоні, а в headless дотиків немає взагалі:
     браузер не заводить властивостей ontouchstart/ontouchend, і
     обробник гортання просто нікуди не чіпляється. Подія при цьому
     долітає — тому виглядало так, ніби зламався сам свайп. */
  '--touch-events=enabled',
  /* Фонова мережа. На чистому профілі Chrome при першому запуску сам
     ходить по оновлення, списки й телеметрію. Локально це непомітно, а на
     CI виходу назовні немає — запити висять, і віртуальний час висить
     разом із ними: він зупиняється, поки є незавершена мережа. Кожен
     запуск помирав по таймауту, прогін ішов 81 хвилину й падав.

     Тому глушимо все, що йде не до нашого сервера. */
  '--disable-background-networking', '--disable-component-update',
  '--disable-client-side-phishing-detection', '--disable-domain-reliability',
  '--disable-sync', '--disable-default-apps', '--no-pings',
  '--metrics-recording-only', '--safebrowsing-disable-auto-update',
  '--disable-features=OptimizationHints,Translate,MediaRouter,InterestFeedContentSuggestions'];

/* ─── свій профіль кожному запуску ───
   Без --user-data-dir Chrome бере профіль за замовчуванням — один на
   всі проби. Разом із ним переходить і localStorage, тобто кабінет,
   пароль і база попередньої проби. Тижнями це виглядало як випадкові
   збої «проба не встигла»: насправді проба, яка мала реєструватись,
   раптом бачила чужий кабінет і застрягала на екрані входу.

   Проба зветься «з чистого пристрою» — хай пристрій і буде чистим.

   Кладемо профілі в домівку, а не в /tmp: на складальниках Chromium
   часто стоїть як snap, а той не пускає профіль за межі дозволених
   шляхів — і мовчки висне замість того, щоб сказати про це.

   Якщо своїх профілів не виходить зовсім, прогін піде без них, гучно про
   це попередивши. Ізоляція проб важлива, але не настільки, щоб через неї
   не виходила жодна перевірка й не виїжджав сайт. */
const os = require('os');
const profiles = fs.mkdtempSync(path.join(os.homedir() || os.tmpdir(), '.protrainer-'));
let profileN = 0;
let ownProfile = true;
process.on('exit', () => { try { fs.rmSync(profiles, {recursive: true, force: true}); } catch {} });

/* Скільки віртуального часу дати сторінці. Застосунку потрібно більше:
   проба проходить реєстрацію, майстер налаштувань і лише потім робить
   свою справу. Сторінкам оплати — навпаки, менше: вони відправляють
   форму в банк, до якого звідси не достукатись, а на час очікування
   мережі віртуальний час зупиняється, і зайвий запас обертається
   довгим марним чеканням.

   Головне про цей запас: він віртуальний, і на простої не витрачається —
   зайві мілісекунди спливають миттєво, якщо чекати нема чого. А от на
   обчисленнях витрачається ще й як: шифрування йде поза головним
   потоком, головний потік у цей час порожній, і годинник мчить уперед.
   Тому чотирнадцяти секунд перестало вистачати рівно тоді, коли
   реєстрація навчилась виводити ключ, заводити ключ копії й замикати
   його паролем: проби почали вивантажуватись посеред роботи, а в
   журналі з'явились «проба не встигла». Даємо із запасом. */
const budget = url => url.includes('/_app.html') ? 60000 : 6000;

/* Скільки запусків поспіль дозволено вбити по таймауту, перш ніж
   зупинити весь прогін.

   Одиничний таймаут — випадковість завантаженої машини. Три поспіль —
   зламане середовище, і далі бігти немає сенсу: кожна проба чекатиме
   свою хвилину, тричі, і прогін розтягнеться на години. Так одного разу
   й вийшло — 81 хвилина мовчання на CI, а в кінці незрозуміле падіння й
   невикладений сайт. Краще впасти за три хвилини й сказати чому. */
const DEAD = 3;
let dead = 0;

let launched = 0;                  /* скільки запусків узагалі вдалося */

const once = url => new Promise((resolve, reject) => {
  const args = FLAGS.slice();
  if (ownProfile) args.push('--user-data-dir=' + path.join(profiles, 'p' + (profileN++)));
  args.push('--virtual-time-budget=' + budget(url), url);
  /* Своя група процесів. Chrome лишає по собі дітей, і вбивати треба всю
     родину: інакше дитина переживає батька й тримає його потоки. */
  const p = spawn(CHROME, args, {detached: true});
  let outp = '', killed = false, over = false;
  p.stdout.on('data', d => { outp += d; });

  const finish = () => {
    if (over) return;
    over = true;
    clearTimeout(t);
    if (!killed){ dead = 0; launched++; return resolve(outp); }
    /* Жодного вдалого запуску, а перший уже завис — найімовірніше
       браузер не приймає наш профіль (типова біда snap-складання).
       Пробуємо без нього: краще прогін без ізоляції з гучним попередженням,
       ніж жодного прогону. */
    if (ownProfile && !launched){
      ownProfile = false;
      console.log('  ⚠ браузер не приймає свій профіль — далі без ізоляції.\n' +
                  '    Проби ділитимуть сховище, і сусідні кабінети можуть заважати одна одній.');
      return resolve(outp);
    }
    dead++;
    console.log('  ⚠ браузер не встиг за 60 с (' + dead + ' поспіль): ' + url);
    if (dead >= DEAD)
      return reject(new Error(
        'браузер не відповідає ' + DEAD + ' рази поспіль — далі бігти немає сенсу.\n' +
        '  Найчастіша причина: він ходить у мережу, якої тут немає, і чекає її вічно.\n' +
        '  Дивіться FLAGS: там вимкнено фонові запити Chrome.'));
    resolve(outp);
  };

  /* Не висимо назавжди, але й не міряємо себе своєю машиною: перший
     запуск браузера на холодній машині буває довгим. */
  const t = setTimeout(() => {
    killed = true;
    try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch {} }
  }, 60000);

  p.on('error', () => { over = true; clearTimeout(t); resolve(''); });
  /* Саме 'exit', а не 'close'. Різниця коштувала години: 'close' чекає,
     поки закриються потоки, а їх тримають діти вбитого браузера — і
     обіцянка «не більше хвилини» не виконувалась зовсім. */
  p.on('exit', finish);
});

/* На CI найперший запуск двічі повертався порожнім — браузер завершувався
   сам, без розмітки, і три перевірки падали з незрозумілим «undefined».
   Причину по логу назвати не вдалося, тому просто пробуємо ще раз, і не
   мовчки: повтор видно в журналі, і якщо він почне траплятися часто —
   це буде видно, а не сховається за зеленим результатом. */
/* Ознака вдалого запуску — підсумок проби. Там, де проби немає,
   вистачає будь-якої розмітки. */
const done = (url, html) => {
  if (!url.includes('probe=')) return html.includes('<body');
  if (!html.includes('id="__out"')) return false;
  /* Проби застосунку починаються зі входу. Якщо він не вдався, перевіряти
     нема чого — краще повторити, ніж рахувати порожній екран за
     результат. Позначку ставить enter().

     Крім тих, що до застосунку й не доходять і не мають доходити: одна
     дивиться на завантаження, друга — на відмову у вході. Вимагати від
     них позначку означало б тричі перезапускати вдалу пробу, а потім
     рахувати її результат так, ніби повторів не було. */
  const OUTSIDE = ['probe=app-boot', 'probe=app-nocopy', 'probe=app-swipe', 'probe=app-lostnet'];
  const needsApp = url.includes('/_app.html') && !OUTSIDE.some(p => url.includes(p));
  return needsApp ? html.includes('id="__entered"') : true;
};

/* Проба інколи не встигає: у headless віртуальний час не чекає ані
   обчислень, ані завантаженої машини, і сторінку вивантажує посеред
   роботи. Пробуємо ще, до трьох разів, і кожен повтор друкуємо — якщо
   вони почнуть траплятися часто, це буде видно, а не сховається за
   зеленим підсумком. */
const dom = async url => {
  let html = '';
  for (let i = 1; i <= 3; i++){
    html = await once(url);
    if (done(url, html)) return html;
    if (i < 3) console.log('  ⚠ проба не встигла (' + i + '), пробуємо ще раз: ' + url);
  }
  return html;
};
/* проба пише підсумок сюди, звідси його й читаємо */
const out = html => {
  const m = /<pre id="__out">([^]*?)<\/pre>/.exec(html);
  return m ? m[1] : '';
};

let checks = 0, fails = 0, broke = '';
const ok = (name, cond, extra) => {
  checks++; if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};
const part = t => console.log('\n── ' + t + ' ──');

/* ─────────── самі проби ─────────── */

PROBES['mini.js'] = `
  var R = React, h = R.createElement;
  var log = [], res = {};
  var say = function(){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = JSON.stringify(res); document.body.appendChild(p); };
  var root = document.getElementById('root');
  var Ctx = R.createContext('за замовчуванням');

  var setOuter;
  function Child(props){
    var v = R.useContext(Ctx);
    var box = R.useRef(null);
    R.useEffect(function(){
      log.push('mount:' + props.id);
      return function(){ log.push('unmount:' + props.id); };
    }, []);
    return h('div', {className: 'kid', ref: box, 'data-id': props.id}, v + ':' + props.id);
  }

  function Field(){
    var s = R.useState('');
    return h('input', {id: 'f', value: s[0], onChange: function(e){ s[1](e.target.value); }});
  }

  function App(){
    var s = R.useState(0);
    setOuter = s[1];
    /* на третьому кроці одна дитина зникає — тоді має спрацювати
       прибирання її ефекту */
    var ids = s[0] === 0 ? ['a', 'b'] : s[0] === 1 ? ['b', 'a'] : ['a'];
    var kids = ids.map(function(id){
      return h(Child, {key: id, id: id});
    });
    return h(Ctx.Provider, {value: 'з контексту'},
      h('div', null,
        h('b', {id: 'n'}, String(s[0])),
        h('div', {id: 'list'}, kids),
        s[0] < 2 ? h(Field, null) : null));
  }

  ReactDOM.createRoot(root).render(h(App, null));

  var wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  (async function(){
    await wait(50);
    res.rendered = document.querySelectorAll('.kid').length;
    res.context = (document.querySelector('.kid') || {}).textContent;
    res.mounted = log.filter(function(x){ return x.indexOf('mount:') === 0; }).length;

    /* стан оновлюється і перемальовує */
    setOuter(1);
    await wait(50);
    res.afterSet = document.getElementById('n').textContent;

    /* ключі: після перестановки вузли ті самі, а не створені заново */
    var a1 = document.querySelector('[data-id=a]');
    setOuter(1);
    await wait(30);
    res.sameNode = a1 === document.querySelector('[data-id=a]');

    /* ефект із порожніми залежностями не повторюється */
    res.mountedAgain = log.filter(function(x){ return x === 'mount:a'; }).length;

    /* поле вводу: фокус і каретка переживають перемальовку */
    var f = document.getElementById('f');
    f.focus();
    f.value = 'при';
    f.dispatchEvent(new Event('input', {bubbles: true}));
    await wait(50);
    var f2 = document.getElementById('f');
    res.typed = f2 && f2.value;
    res.keptFocus = document.activeElement === f2;
    res.sameInput = f === f2;

    /* прибирання при знятті з екрана */
    setOuter(2);
    await wait(50);
    res.gone = !document.getElementById('f');
    res.cleanup = log.filter(function(x){ return x.indexOf('unmount:') === 0; }).length;
    say();
  })();
`;


/* Проходимо онбординг, вхід і майстер налаштувань — далі вже застосунок.
   Клікаємо по структурі, а не по написах: інакше сценарій розсипався б
   на кожній мові. */
const DRIVE = `
  var wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  /* Чекати фіксовану паузу — значить прив'язатися до швидкості машини.
     На CI вона повільніша за цю, і проба читала екран, поки там ще
     скелет завантаження. Тому чекаємо на подію, а не на секунди. */
  var until = async function(test, ms){
    for (var t = 0; t < (ms || 5000); t += 100){ if (test()) return true; await wait(100); }
    return test();
  };
  var all = function(s){ return [].slice.call(document.querySelectorAll(s)); };
  /* ─── чекати на відповідь, а не на секунди ───
     until() рахує кроки по 100мс, але під віртуальним часом крок коштує
     майже нічого: двісті кроків спливають раніше, ніж браузер дорахує
     ключ із пароля. Саме через це проба «чужий пароль не пускає» падала
     приблизно раз на кілька прогонів — застосунок ще думав, а вона вже
     читала екран і бачила «Хвилинку…». Тут ми не рахуємо час зовсім:
     крутимось, поки кнопка думає, і читаємо тільки після неї. */
  var settled = async function(done, steps){
    for (var k = 0; k < (steps || 600); k++){
      if (done()) return true;
      var busy = /Хвилинку/.test((pri() || {}).textContent || '');
      if (!busy && k > 5) return done();
      await wait(50);
    }
    return done();
  };
  var vis = function(e){ return e.offsetParent !== null || e.getClientRects().length; };
  var pri = function(){ return all('.ob button').filter(function(b){ return /pri/.test(b.className); })[0]; };
  var type = function(el, v){
    var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, v);
    el.dispatchEvent(new Event('input', {bubbles: true}));
  };
  var say = function(o){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = JSON.stringify(o); document.body.appendChild(p); };
  window.addEventListener('error', function(e){ window.__err = String(e.message || e); });

  /* Кроки, які є в кількох пробах. Скрізь чекаємо на появу потрібного,
     а не на секунди: у headless фіксована пауза то завелика, то мала. */
  async function menu(){
    var b = document.querySelector('.appbar .iconbtn');
    if (b) b.click();
    await until(function(){ return all('.sheet .setrow').filter(vis).length > 5; }, 2500);
    return all('.sheet .setrow').filter(vis);
  }
  async function openRow(rows, i){
    var was = all('.page').length;
    if (rows[i]) rows[i].click();
    await until(function(){ return all('.page').length > was; }, 2500);
    var p = all('.page');
    return p[p.length - 1] || null;
  }

  /* Логін — параметр. Пробний період сервер пам'ятає саме за логіном,
     і на спільному «trainer@mail.com» екран пробного періоду встигав
     зникнути сам: перевірка казала, що вже почато, і застосунок ішов
     далі без кліку. Пробі, якій цей екран потрібен, дістається свій
     логін — тоді екран дочекається. */
  async function enter(login){
    await wait(300);
    for (var i = 0; i < 3; i++){ if (pri()){ pri().click(); await wait(120); } }
    var li = document.querySelector('.ob .inp');
    if (li){ type(li, login || 'trainer@mail.com'); await wait(120); }
    /* пароль обов'язковий — поле з'являється поруч із логіном */
    var ins = all('.ob .inp');
    if (ins[1]){ type(ins[1], 'test1234'); await wait(120); }
    if (pri()){ pri().click(); }
    /* ─── чекаємо, поки реєстрація завершиться ───
       Вона виводить ключ із пароля, заводить ключ копії й замикає його —
       кілька звернень до крипто поспіль. Під віртуальним часом вони
       коштують дорожче, ніж здається: поки браузер рахує, головний потік
       порожній, і годинник мчить уперед. Двох із половиною секунд
       перестало вистачати приблизно в кожному третьому запуску.

       І головне — переконуємось, що таки дочекались. Якщо піти далі з
       полем пароля на екрані, ім'я «Alex» лягає в поле логіна, реєстрація
       ламається, а проба мовчки перевіряє порожній екран і повідомляє
       про це як про помилку застосунку. */
    var done = await until(function(){ return !document.querySelector('.ob input[type=password]'); }, 20000);
    if (!done){
      /* Кажемо не тільки «не вийшло», а й що було на екрані: саме цей
         рядок показав, що застосунок не завис, а чесно відповів
         «пароль до кабінета інший» — і виною була підміна в харнесі. */
      var box = document.querySelector('.ob');
      window.__err = window.__err || ('вхід: реєстрація не завершилась · ' +
        (box ? box.textContent.replace(/\s+/g, ' ').slice(0, 200) : 'екрана немає'));
      return;
    }
    var nm = document.querySelector('.ob .inp');
    if (nm){ type(nm, 'Alex'); await wait(120); }
    /* Приклад у майстрі вимкнено: новий тренер має отримати порожній
       кабінет, а не вісім вигаданих клієнтів. Пробам дані потрібні —
       вмикаємо перемикач самі, як це зробила б людина, яка хоче
       подивитись, з чим має справу. Робимо це до кнопки: перше ж
       натискання завершує майстер. */
    var sw = all('.ob .switch').slice(-1)[0];
    if (sw && !/on/.test(sw.className)){ sw.click(); await wait(220); }
    if (pri()){ pri().click(); await wait(400); }
    /* Останній крок — екран пробного періоду. Він називає ціну, і
       називав її не тією валютою, якою потім списує каса, тож знімаємо
       текст перед тим, як закрити його кліком. */
    /* Чекаємо коротко. Екран малюється відразу за майстром, тож довше —
       марно, а під віртуальним часом кожна зайва секунда витрачається з
       бюджету прогону, і проби далі перестають дочікуватись пошти. */
    await until(function(){ return /Далі від/.test((document.querySelector('.ob') || {}).textContent || ''); }, 600);
    var ob = document.querySelector('.ob');
    if (ob && /Далі від/.test(ob.textContent)) window.__trial = ob.textContent.replace(/\\s+/g, ' ');
    if (pri()){ pri().click(); await wait(500); }
    /* база читається асинхронно, і доки вона не прочитана, екран показує
       скелет. Далі йдуть перевірки вмісту — виходимо звідси тільки коли
       скелета не лишилось. */
    await until(function(){ return !document.querySelector('.sk'); });
    /* Позначка «вхід удався». Її шукає прогін: у headless крок інколи не
       встигає, і без позначки проба мовчки перевіряла б порожній екран,
       а так її просто повторять. */
    if (all('.nav button').length){
      var mark = document.createElement('i');
      mark.id = '__entered';
      document.body.appendChild(mark);
    }
  }
`;

PROBES['plans.js'] = `
  var say = function(s){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = s; document.body.appendChild(p); };
  var plans = document.querySelectorAll('.plan');
  var on = document.querySelectorAll('.plan.on');
  say(JSON.stringify({
    count: plans.length,
    picked: on.length === 1 ? on[0].textContent : '',
    first: plans[0] ? plans[0].textContent : '',
  }));
`;
PROBES['pick.js'] = `
  var say = function(s){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = s; document.body.appendChild(p); };
  document.querySelectorAll('.plan')[0].click();
  var on = document.querySelectorAll('.plan.on');
  say(JSON.stringify({picked: on.length === 1 ? on[0].textContent : '', count: on.length}));
`;
PROBES['nologin.js'] = `
  var say = function(s){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = s; document.body.appendChild(p); };
  document.getElementById('go').click();
  var e = document.getElementById('err');
  say(JSON.stringify({shown: !e.hidden, text: e.textContent, url: location.pathname}));
`;
PROBES['buy.js'] = `document.getElementById('go').click();`;
/* Далі — сценарії, які з'явились останніми: запис тренування з повтором
   і часткове закриття боргу. У пісочниці вони перевірені, але там немає
   ні кліків, ні аркушів, що відкриваються поверх. */
PROBES['app-session.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    /* швидке додавання → тренування */
    var fab = document.querySelector('.fab');
    if (fab){ fab.click(); await wait(350); }
    var rows = all('.sheet .setrow').filter(vis);
    res.quick = rows.length;
    if (rows[0]){ rows[0].click(); await wait(500); }
    res.form = all('.page').length;

    /* клієнт */
    var pick = all('.page .inp.press')[0];
    if (pick){ pick.click(); await wait(350); }
    var people = all('.sheet .rows button').filter(vis);
    res.people = people.length;
    if (people[0]){ people[0].click(); await wait(350); }

    /* повтор: другий блок .segm на сторінці — саме він */
    var segs = all('.page .segm');
    res.segs = segs.length;
    var rep = segs[segs.length - 1];
    var weekly = rep ? rep.querySelectorAll('button')[1] : null;
    if (weekly){ weekly.click(); await wait(250); }
    res.repeatOn = !!(weekly && /on/.test(weekly.className));
    res.times = all('.page .chip').filter(function(b){ return /разів|раз|times|razy/.test(b.textContent); }).length;

    /* зберігаємо */
    var save = all('.page .btn.pri').slice(-1)[0];
    res.saveText = save ? save.textContent.trim().slice(0, 40) : '';
    if (save){ save.click(); await wait(700); }
    res.backToApp = all('.page').length === 0;
    res.toast = (document.body.textContent.indexOf('Створено тренувань') >= 0) ||
                (document.querySelector('#root').textContent.indexOf('Створено') >= 0);
    res.err = window.__err || '';
    say(res);
  })();
`;

PROBES['app-debt.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    /* швидке додавання → оплату (сторінка боргів) */
    var fab = document.querySelector('.fab');
    if (fab){ fab.click(); await wait(350); }
    var rows = all('.sheet .setrow').filter(vis);
    if (rows[4]){ rows[4].click(); await wait(600); }
    res.page = all('.page').length;
    var cards = all('.page .card.pad');
    res.debts = cards.length;
    var money = function(){ var m = /(\\d[\\d\\s]*)\\s*₴/.exec(document.querySelector('.page').textContent); return m ? m[1].replace(/\\s/g, '') : ''; };
    res.before = money();

    /* перша картка — це підсумок «Загалом винні», кнопок у ній немає:
       беремо першу, де кнопка справді є */
    var card = cards.filter(function(c){ return c.querySelector('.btn.pri'); })[0];
    var pay = card ? card.querySelector('.btn.pri') : null;
    res.hasPay = !!pay;
    if (pay){ pay.click(); await wait(400); }
    res.sheet = all('.sheet').filter(vis).length;
    /* половина суми */
    var half = all('.sheet .chip').filter(vis)[0];
    if (half){ half.click(); await wait(250); }
    var doIt = all('.sheet .btn.pri').filter(vis).slice(-1)[0];
    res.doText = doIt ? doIt.textContent.trim().slice(0, 40) : '';
    if (doIt){ doIt.click(); await wait(700); }
    res.after = money();
    res.err = window.__err || '';
    say(res);
  })();
`;

PROBES['app-drive.js'] = DRIVE + `
  (async function(){
    await enter();
    var nav = all('.nav button');
    var res = {tabs: nav.length, err: window.__err || ''};
    /* якщо застосунок не відкрився — кажемо, на чому саме зупинились:
       інакше «вкладок 0» нічого не пояснює */
    if (!nav.length) res.screen = (document.getElementById('root').textContent || '').replace(/\\s+/g, ' ').slice(0, 90);
    res.home = (document.getElementById('root').textContent || '').indexOf('Дохід сьогодні') >= 0;
    /* календар */
    if (nav[1]){ nav[1].click(); await wait(400); }
    res.cal = all('.tl .hr').length;
    /* клієнти */
    if (nav[2]){ nav[2].click(); await wait(400); }
    res.clients = all('.rows .row').length;
    /* відкриваємо першого клієнта */
    var first = all('.rows .row')[0];
    if (first){ first.click(); await wait(500); }
    res.card = all('.page').length;
    res.tabsInCard = all('.page .tabs button, .page .segm button').length;
    say(res);
  })();
`;

/* Шторка закривається свайпом, але вона ж і прокручується. Перевіряємо
   обидві половини: жест за ручку закриває, а те саме рухом по списку —
   ні, інакше довгий список неможливо догортати до верху. */
PROBES['app-sheet.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    var fab = document.querySelector('.fab');
    if (fab){ fab.click(); await wait(400); }
    var sheet = document.querySelector('.sheet');
    res.opened = !!sheet;
    if (!sheet) return say(res);
    /* у вікні перевірки шторка вміщується цілком — робимо її низькою,
       щоб у ній справді з'явилась прокрутка */
    sheet.style.maxHeight = '200px';
    await wait(80);
    res.scrolls = sheet.scrollHeight > sheet.clientHeight + 1;

    var drag = function(el, startY, dy){
      var mk = function(type, y){
        var t = new Touch({identifier: 1, target: el, clientX: 100, clientY: y});
        return new TouchEvent(type, {
          touches: type === 'touchend' ? [] : [t], changedTouches: [t],
          bubbles: true, cancelable: true,
        });
      };
      el.dispatchEvent(mk('touchstart', startY));
      el.dispatchEvent(mk('touchmove', startY + dy / 2));
      el.dispatchEvent(mk('touchmove', startY + dy));
      el.dispatchEvent(mk('touchend', startY + dy));
    };

    drag(sheet, sheet.getBoundingClientRect().top + 150, 140);   /* по списку */
    await wait(400);
    res.afterList = !!document.querySelector('.sheet');

    var s2 = document.querySelector('.sheet');
    if (s2){
      s2.style.maxHeight = '200px';
      drag(s2, s2.getBoundingClientRect().top + 8, 140);         /* за ручку */
    }
    await wait(400);
    res.afterGrip = !!document.querySelector('.sheet');
    res.err = window.__err || '';
    say(res);
  })();
`;

/* Копія бази на сервері. Перевіряємо весь шлях: зашифрувати, покласти,
   забрати, розшифрувати — і що без правильного ключа нічого не вийде. */
PROBES['app-cloud.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    var login = Web.login();
    res.login = login;

    var put = await Cloud.push();
    res.why = JSON.stringify(put);
    res.saved = !!(put && put.ok);

    /* Сервер має знати, що копія є, і віддати сіль новому пристрою.
       Питаємо один раз і без повторів: повтор тут приховав би саме те,
       заради чого перевірка й потрібна — застарілу відповідь. */
    var seen = await Cloud.peek(login);
    res.peek = JSON.stringify(seen);
    res.has = !!(seen && seen.has);
    res.salt = !!(seen && seen.salt);

    /* той самий пароль знімає замок із ключа — і копія читається */
    var back = await Cloud.open(login, 'test1234', seen.salt);
    res.read = !!(back && back.ok);
    if (back && back.ok){
      try {
        var db = JSON.parse(back.json);
        res.clients = (db.clients || []).length;
      } catch (e){ res.clients = -1; }
    }

    /* чужий пароль не відкриває нічого — і сервер навіть не віддає запис */
    var nope = await Cloud.open(login, 'inshiy-parol', seen.salt);
    res.stranger = !!(nope && nope.ok);
    res.strangerWhy = (nope && nope.error) || '';

    res.err = window.__err || '';
    say(res);
  })();
`;

/* Вхід із чистого пристрою — саме той шлях, на якому спіткнувся автор.
   Кабінета тут немає, копія лежить на сервері (її поклала попередня
   проба, сервер у прогоні спільний). Тиснемо «Увійти», як зробить
   будь-яка людина, і чекаємо, що потрапимо до себе, а не в глухий кут.
   Заодно перевіряємо, що чужий пароль сюди не пускає. */
/* Кабінет заводиться тільки на пошту. Номер виглядав зручним, а
   насправді вів у глухий кут: відновити пароль такому кабінету нічим.
   Перевіряємо, що застосунок не дає його завести — і пояснює чому. */
/* Переписка з підтримкою. Перевіряємо весь шлях цілком: тренер пише з
   екрана, ми відповідаємо з боку сервера, і відповідь з'являється в тому
   ж вікні без перезавантаження. Проміжні ланки тут нічого не варті —
   важливо лише, чи дійшло від людини до людини й назад. */
PROBES['app-help.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    res.login = Web.login();

    /* ─── кнопка підтримки на видноті ───
       Раніше єдиний шлях сюди лежав через «Налаштування»: щоб
       поскаржитись, тренер мусив здогадатись, що скарга — це
       налаштування. Перевіряємо саме той шлях, яким піде людина: вкладка
       «Профіль» → кнопка у смужці зверху. */
    var tab = all('.nav button').filter(function(b){ return /Профіль/.test(b.textContent); })[0];
    if (tab){ tab.click(); await wait(300); }
    var btn = all('.appbar .iconbtn').filter(function(b){
      return /Підтрим/.test(b.getAttribute('aria-label') || ''); })[0];
    res.onProfile = !!btn;
    if (btn){ btn.click(); await until(function(){ return all('.page').length > 0; }, 2500); }
    var opened = all('.page').slice(-1)[0];
    res.byButton = !!(opened && /Підтрим/.test(opened.textContent || ''));
    /* закриваємо й далі йдемо старим шляхом — він теж має лишитись */
    var back = opened ? opened.querySelector('.appbar .iconbtn') : null;
    if (back){ back.click(); await until(function(){ return all('.page').length === 0; }, 2500); }
    /* Повертаємось на головну: меню живе в її смужці, а на «Профілі» в
       тому самому місці тепер стоїть кнопка підтримки — і без цього
       кроку проба відкривала б її замість меню. */
    var home = all('.nav button').filter(function(b){ return /Головна/.test(b.textContent); })[0];
    if (home){ home.click(); await wait(300); }

    /* заходимо саме так, як зайде тренер: меню → «Підтримка» */
    var rows = await menu();
    var idx = rows.map(function(r){ return (r.textContent || ''); })
                  .findIndex(function(x){ return /Підтримка/.test(x); });
    res.inMenu = idx >= 0;
    var page = await openRow(rows, idx);
    res.title = page ? (page.querySelector('.pagetitle, h1, .ttl') || {}).textContent || '' : '';
    res.opened = !!(page && /Підтрим/.test(page.textContent || ''));

    var box = document.querySelector('textarea.inp');
    res.hasBox = !!box;
    if (box){
      var set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(box, 'Не рахує відсоток залу');
      box.dispatchEvent(new Event('input', {bubbles: true}));
    }
    await wait(150);
    var send = all('button').filter(function(b){ return /Відправити/.test(b.textContent) && !b.disabled; })[0];
    res.canSend = !!send;
    if (send) send.click();

    await until(function(){ return all('.bub.me').length > 0; }, 6000);
    res.mine = all('.bub.me').length;
    res.mineText = (all('.bub.me')[0] || {}).textContent || '';

    /* Відповідь кладемо через сервер, а не через застосунок: саме так її
       кладе адмінка або Telegram. Далі чекаємо, поки екран сам її
       підхопить — опитуванням, без жодного натискання. */
    await fetch('/_test/reply?' + new URLSearchParams({login: res.login, text: 'Перевірте відсоток у налаштуваннях'}));
    await until(function(){ return all('.bub.them').length > 0; }, 12000);
    res.theirs = all('.bub.them').length;
    res.theirText = (all('.bub.them')[0] || {}).textContent || '';

    res.err = window.__err || '';
    say(res);
  })();
`;

/* Публічна сторінка про сервіс. Це не вітрина, а відповідь банку: саме
   через її відсутність нам спинили виплати. Тому перевіряємо не «сторінка
   відкрилась», а що на ній справді стоять ціни в гривні, реквізити ФОП і
   умови повернення — тобто рівно те, чого не знайшов моніторинг. */
PROBES['about.js'] = `
  var say = function(o){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = JSON.stringify(o); document.body.appendChild(p); };
  window.addEventListener('error', function(e){ window.__err = String(e.message || e); });
  setTimeout(function(){
    var rows = [].slice.call(document.querySelectorAll('.tar .row'));
    var req = document.getElementById('req').textContent.replace(/\\s+/g, ' ');
    var all = document.body.textContent.replace(/\\s+/g, ' ');
    say({
      plans: rows.length,
      amounts: rows.map(function(r){ return (r.querySelector('.amt') || {}).textContent || ''; }).join(' '),
      hryvnia: rows.every(function(r){ return /\\u20b4/.test((r.querySelector('.amt') || {}).textContent || ''); }),
      dollars: /\\$/.test(all),
      company: /Мозолевич/.test(req),
      id: /3691304399/.test(req),
      addr: /Ольвійська/.test(req),
      phone: /380 95 182 54 56/.test(req),
      mail: !!document.querySelector('#req a[href^="mailto:"]'),
      tel: !!document.querySelector('#req a[href^="tel:"]'),
      refund: /Кошти повертаємо/.test(all),
      trial: /14 днів/.test(all),
      app: !!document.querySelector('a.go'),
      err: window.__err || '',
    });
  }, 300);
`;

/* Сторінка «з чого почати» — звичайний HTML, тож і проба проста. */
PROBES['start.js'] = `
  var say = function(o){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = JSON.stringify(o); document.body.appendChild(p); };
  window.addEventListener('error', function(e){ window.__err = String(e.message || e); });
  setTimeout(function(){
    var steps = [].slice.call(document.querySelectorAll('.step'));
    say({
      title: (document.getElementById('h1') || {}).textContent || '',
      steps: steps.length,
      nums: steps.map(function(s){ return (s.querySelector('i') || {}).textContent || ''; }).join(''),
      ask: !!(document.getElementById('ask') || {}).textContent,
      go: (document.getElementById('go') || {}).getAttribute('href') || '',
      mail: !!document.querySelector('#qa a[href^="mailto:"]'),
      err: window.__err || '',
    });
  }, 300);
`;

/* ─── адмінка ───
   Її не перевіряв ніхто: сторінка службова, і зламатись їй ніби нема на
   чому. Виявилось, є. Меню на телефоні опинилось під затемненням —
   відкриваєш, а прочитати не можеш і натиснути теж: затемнення лежало
   зверху. Ані помилки в журналі, ані падіння перевірок — на око видно
   тільки на самому телефоні.

   Тому тут дивимось не на вигляд, а на те, що вирішує: у що влучає
   палець там, де намальовано пункт меню. Заразом обходимо всі розділи —
   помилка в будь-якому з них лишила б порожній екран замість сторінки. */
PROBES['admin.js'] = `
  var say = function(o){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = JSON.stringify(o); document.body.appendChild(p); };
  var errs = [];
  window.addEventListener('error', function(e){ errs.push(String(e.message || e)); });
  var res = {};
  sessionStorage.setItem('protrainer.admin', '${process.env.ADMIN_PASS}');
  pass = '${process.env.ADMIN_PASS}';
  setTimeout(function(){ load().then(function(){ setTimeout(after, 300); }); }, 150);
  function after(){
    /* Меню виїжджає з-за краю за чверть секунди, і чекати його простим
       таймером не можна: у headless віртуальний час біжить уперед сам по
       собі, а рух малюється окремо — «зачекав 400 мс» тут означає
       «зачекав нуль». Перевірка від цього то падала, то ні, і причина
       була не в сторінці. Тому чекаємо не час, а сам факт приїзду. */
    menu(true);
    var tries = 0;
    (function ride(){
      var side = document.getElementById('side');
      var item = side ? side.querySelector('.nav button') : null;
      var box = item ? item.getBoundingClientRect() : null;
      if (box && box.left >= 0) return measure(box);
      if (++tries > 120) return measure(box);
      requestAnimationFrame(ride);
    })();
  }
  function measure(box){
    var side = document.getElementById('side');
    var item = side ? side.querySelector('.nav button') : null;
    var hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null;
    res.opens = !!(side && /open/.test(side.className));
    res.reaches = !!(hit && (hit === item || item.contains(hit)));
    menu(false);
    res.closes = getComputedStyle(document.getElementById('scrim')).display === 'none';

    /* кожен розділ малюється й нічого не втрачає */
    var pages = ['dash', 'people', 'care', 'chat', 'pays', 'subs', 'stats', 'events', 'setup'];
    res.blank = [];
    res.junk = [];
    pages.forEach(function(p){
      go(p);
      var html = document.getElementById('root').innerHTML;
      if (html.length < 2000) res.blank.push(p);
      if (/undefined|NaN|\\[object Object\\]/.test(html)) res.junk.push(p);
    });
    /* ─── стрічка чисел ───
       На телефоні чотири картки з числами йдуть убік, а не стовпчиком.
       Коштувати це може дорого: смуга, ширша за екран, легко тягне вбік
       усю сторінку — і тоді замість опису читаєш порожнє поле справа.
       Тому питаємо два боки одного: смуга справді гортається, а
       сторінка при цьому стоїть на місці. */
    go('dash');
    var strip = document.querySelector('.g4');
    var tiles = strip ? [].slice.call(strip.children) : [];
    res.tiles = tiles.length;
    res.oneRow = tiles.length > 1 &&
      tiles.every(function(t){ return Math.abs(t.getBoundingClientRect().top -
                                               tiles[0].getBoundingClientRect().top) < 2; });
    res.rides = !!strip && strip.scrollWidth > strip.clientWidth + 1;
    res.pageStill = document.body.scrollWidth <= innerWidth + 1;

    res.errs = errs.join(' | ');
    say(res);
  }
`;

PROBES['app-mail.js'] = DRIVE + `
  (async function(){
    var res = {};
    await wait(300);
    for (var i = 0; i < 3; i++){ if (pri()){ pri().click(); await wait(120); } }
    var li = document.querySelector('.ob .inp');
    res.field = li ? (li.placeholder || '') : '';
    if (li) type(li, '0671234567');
    await wait(120);
    var ins = all('.ob .inp');
    if (ins[1]) type(ins[1], 'test1234');
    await wait(120);
    if (pri()) pri().click();
    await until(function(){ return /заводиться на пошту/.test(document.querySelector('.ob').textContent); }, 20000);
    var box = document.querySelector('.ob').textContent;
    res.refused = /заводиться на пошту/.test(box);
    res.stillHere = !!document.querySelector('.ob input[type=password]');
    /* а з поштою той самий шлях доходить до кінця */
    li = document.querySelector('.ob .inp');
    if (li) type(li, 'mail-only@mail.com');
    await wait(120);
    ins = all('.ob .inp');
    if (ins[1]) type(ins[1], 'test1234');
    await wait(120);
    if (pri()) pri().click();
    res.passed = await until(function(){ return !document.querySelector('.ob input[type=password]'); }, 20000);
    /* Реєстрація доходить до кінця — значить, ми всередині. Ставимо ту
       саму позначку, що й enter(): без неї повільний прогін не
       перезапускався, а рахувався за справжню невдачу, і перевірка
       червоніла раз на кілька прогонів без жодної провини коду. */
    if (res.passed){
      var mark = document.createElement('i');
      mark.id = '__entered';
      document.body.appendChild(mark);
    }
    res.err = window.__err || '';
    say(res);
  })();
`;

PROBES['app-join.js'] = DRIVE + `
  (async function(){
    var res = {};
    await wait(300);
    for (var i = 0; i < 3; i++){ if (pri()){ pri().click(); await wait(120); } }

    var toLogin = all('.ob button').filter(function(b){ return /Вже є кабінет/.test(b.textContent); })[0];
    res.hasSwitch = !!toLogin;
    if (toLogin){ toLogin.click(); await wait(200); }

    var li = document.querySelector('.ob .inp');
    if (li) type(li, 'trainer@mail.com');
    await wait(120);
    if (pri()) pri().click();

    /* пристрій кабінета не знає — але сервер знає, і в нас питають пароль */
    await until(function(){ return !!document.querySelector('.ob input[type=password]'); }, 6000);
    res.asksPass = !!document.querySelector('.ob input[type=password]');
    res.found = /Кабінет знайдено/.test(document.querySelector('.ob').textContent);

    /* Чекаємо довго: перевірка пароля — це вивід ключа й запит до
       сервера, а віртуальний час на обчисленнях мчить уперед. Шести
       секунд не вистачало, і проба питала екран, поки той ще думав. */
    var pf = document.querySelector('.ob input[type=password]');
    if (pf){ type(pf, 'ne-toy-parol'); await wait(120); if (pri()) pri().click(); }
    var no = function(){ return /Пароль не підходить/.test(document.querySelector('.ob').textContent); };
    res.stranger = await settled(no);
    if (!res.stranger) res.saw = document.querySelector('.ob').textContent.replace(/\\s+/g, ' ').slice(0, 200);

    pf = document.querySelector('.ob input[type=password]');
    if (pf){ type(pf, 'test1234'); await wait(120); if (pri()) pri().click(); }
    await until(function(){ return !!all('.nav button').length; }, 8000);
    await until(function(){ return !document.querySelector('.sk'); });
    res.inside = !!all('.nav button').length;
    res.clients = Store.state && Store.state.clients ? Store.state.clients.length : -1;
    res.err = window.__err || '';
    if (res.inside){
      var mark = document.createElement('i');
      mark.id = '__entered';
      document.body.appendChild(mark);
    }
    say(res);
  })();
`;

/* Що буде, якщо на самому останньому кроці відновлення пропаде зв'язок.
   Досі — нічого: кнопка застигала на «Хвилинку…» назавжди, і людина,
   яка щойно підтвердила пошту, лишалась перед мертвим екраном із базою
   клієнтів по той бік. Ламаємо саме цей виклик і дивимось, чи екран
   оживає й чи каже щось людською мовою. */
PROBES['app-lostnet.js'] = DRIVE + `
  (async function(){
    var res = {};
    await wait(300);
    for (var i = 0; i < 3; i++){ if (pri()){ pri().click(); await wait(120); } }

    var toLogin = all('.ob button').filter(function(b){ return /Вже є кабінет/.test(b.textContent); })[0];
    if (toLogin){ toLogin.click(); await wait(200); }

    /* Пошту вводимо до «Забули пароль?»: код замовляється саме на ту,
       що стоїть у полі. Порядок тут не косметичний. */
    var li = document.querySelector('.ob .inp');
    if (li) type(li, 'trainer@mail.com');
    await wait(150);

    res.typed = li ? li.value : null;

    /* «Забули пароль?» з'являється не одразу: спершу застосунок питає
       пароль — і лише під цим полем пропонує його відновити. Тому
       спочатку тиснемо «Увійти», а вже потім шукаємо посилання. */
    if (pri()) pri().click();
    await until(function(){ return !!document.querySelector('.ob input[type=password]'); }, 12000);
    res.asked = !!document.querySelector('.ob input[type=password]');

    var lost = all('.ob button').filter(function(b){ return /Забули пароль/.test(b.textContent); })[0];
    res.hasLost = !!lost;
    res.lostText = lost ? lost.textContent : '';
    if (lost){ lost.click(); }
    await wait(400);
    res.afterLost = document.querySelector('.ob').textContent.replace(/\s+/g, ' ').slice(0, 140);
    await until(function(){ return /Лист із кодом пішов/.test(document.querySelector('.ob').textContent); }, 8000);

    var got = await (await fetch('/_test/code?login=trainer@mail.com')).json();
    /* Поле коду — останнє на екрані: пошта лишається зверху, і перший
       .inp — це вона. */
    var ci = all('.ob .inp').slice(-1)[0];
    if (ci) type(ci, got.code);
    await wait(120);
    if (pri()) pri().click();
    await until(function(){ return /Пошту підтверджено/.test(document.querySelector('.ob').textContent); }, 12000);
    res.verified = /Пошту підтверджено/.test(document.querySelector('.ob').textContent);

    /* Ламаємо найперший крок, ще до шифрування. Зламати заміну замка
       було б ближче до життя, але перед нею застосунок виводить ключ із
       пароля — сто п'ятдесят тисяч ітерацій поза головним потоком, — і у
       віртуальному часі це не дочекатись: годинник мчить уперед, поки
       потік порожній. Перевіряємо те саме: будь-який збій тут не має
       лишати екран мертвим. */
    Vault.cloud = async function(){ throw new Error('обрив'); };

    var pf = document.querySelector('.ob input[type=password]') || all('.ob .inp').slice(-1)[0];
    res.field = pf ? (pf.type + '/' + pf.className) : 'немає';
    if (pf) type(pf, 'novyi-parol-1');
    await wait(150);
    res.typedPass = pf ? pf.value : '';
    var save = pri();
    res.saveBtn = save ? save.textContent : 'немає';
    if (save) save.click();
    await wait(600);
    res.at600 = (pri() || {}).textContent || '';

    /* Кнопка мусить ожити. Чекаємо довго не даремно: перед обривом
       застосунок виводить ключ із пароля — сто п'ятдесят тисяч ітерацій,
       і у віртуальному часі вони спливають миттєво, з'їдаючи будь-який
       короткий строк. Коротке очікування тут показувало б зависання
       там, де його немає. */
    await until(function(){ return !/Хвилинку/.test((pri() || {}).textContent || ''); }, 20000);
    res.alive = !/Хвилинку/.test((pri() || {}).textContent || '');
    res.said = /Не вдалося застосувати новий пароль/.test(document.querySelector('.ob').textContent);
    res.saw = document.querySelector('.ob').textContent.replace(/\s+/g, ' ').slice(0, 200);

    res.err = window.__err || '';
    say(res);
  })();
`;

/* Гортання онбордингу пальцем. Три крапки внизу обіцяють саме його, а
   слайди перемикались тільки кнопкою — тренер, який спробував змахнути,
   вирішив, що застосунок завис. Перевіряємо обидва напрямки й те, що на
   краях гортання нікуди не діває слайд. */
PROBES['app-swipe.js'] = DRIVE + `
  (async function(){
    var res = {};
    await wait(400);
    var ob = document.querySelector('.ob');
    var title = function(){ return (document.querySelector('.ob .dsp') || {}).textContent || ''; };
    var dot = function(){ return all('.ob .dots i').findIndex(function(x){ return /on/.test(x.className); }); };

    var swipe = function(dx){
      var mk = function(kind, x){
        var t = new Touch({identifier: 1, target: ob, clientX: x, clientY: 400});
        return new TouchEvent(kind, {bubbles: true, changedTouches: [t], touches: kind === 'touchend' ? [] : [t]});
      };
      ob.dispatchEvent(mk('touchstart', 200));
      ob.dispatchEvent(mk('touchend', 200 + dx));
    };

    /* Чи долітає подія взагалі: без цього не відрізнити «свайп не
       працює» від «проба не вміє його зобразити». */
    var seen = 0;
    ob.addEventListener('touchend', function(){ seen++; });
    res.hasTouch = typeof window.TouchEvent === 'function';

    res.first = title();
    res.dotFirst = dot();

    swipe(-120);                       /* вліво — наступний */
    await wait(200);
    res.second = title();
    res.dotSecond = dot();

    swipe(120);                        /* вправо — назад */
    await wait(200);
    res.back = title();

    swipe(120);                        /* уже перший: далі нікуди */
    await wait(200);
    res.stays = title();

    swipe(-10);                        /* випадковий дотик слайд не міняє */
    await wait(200);
    res.tiny = title();

    res.seen = seen;
    res.err = window.__err || '';
    say(res);
  })();
`;

/* Кабінет без копії. Такі є: заведені до того, як копії з'явились, вони
   ключа не мають і не зберігаються нікуди — мовчки. Мовчки тут і є
   помилка, тому перевіряємо не «код працює», а чи побачить це тренер на
   тому екрані, який відкриває щодня.

   Ключ прибираємо руками: відтворити старий кабінет інакше нічим, а
   саме через нього тренер і втрачає базу разом із телефоном. */
PROBES['app-nocloud.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();

    /* Тільки картки на екрані. document.body сюди не годиться: сам
       застосунок лежить у <script> усередині body, і textContent тягне
       його вихідний код разом із таблицею перекладів — шукана фраза
       знаходилась там завжди, хоч рядка на екрані й не було. */
    var home = function(){
      return all('.card').map(function(c){ return c.textContent; }).join(' ').replace(/\\s+/g, ' ');
    };
    res.armedFirst = Cloud.armed();
    res.quietWhenArmed = !/Копії ваших даних немає/.test(home());
    res.tab = (document.querySelector('.nav .on') || {}).textContent || '';
    res.clients = Store.state.clients.length;

    /* Той самий кабінет, але без ключа копії. Нічого більше не чіпаємо:
       рядок має з'явитись від самого зникнення ключа, без сторонньої
       зміни, яка змусила б екран перемалюватись. */
    Cloud.forget();
    await until(function(){ return /Копії ваших даних немає/.test(home()); }, 6000);
    res.warned = /Копії ваших даних немає/.test(home());
    res.hasFix = all('button').some(function(b){ return /Увімкнути$/.test(b.textContent.trim()); });

    /* «Пізніше» ховає рядок — і саме ховає, а не вимикає копію */
    var later = all('button').filter(function(b){ return /Пізніше/.test(b.textContent); })[0];
    if (later) later.click();
    await until(function(){ return !/Копії ваших даних немає/.test(home()); }, 4000);
    res.hidden = !/Копії ваших даних немає/.test(home());
    res.stillWants = Store.state.settings.cloud !== false;
    res.nag = Store.state.settings.cloudNag || 0;
    res.laterFound = !!later;

    res.err = window.__err || '';
    say(res);
  })();
`;

/* Вхід, коли копії немає або сервер мовчить. Досі обидва випадки — і
   третій, зовсім інший, — казали одне: «такого кабінету немає». На обрив
   зв'язку це відверта брехня, і людина йде міняти пошту, хоча міняти
   нічого не треба. Перевіряємо, що тепер це різні відповіді. */
PROBES['app-nocopy.js'] = DRIVE + `
  (async function(){
    var res = {};
    await wait(300);
    for (var i = 0; i < 3; i++){ if (pri()){ pri().click(); await wait(120); } }

    var toLogin = all('.ob button').filter(function(b){ return /Вже є кабінет/.test(b.textContent); })[0];
    if (toLogin){ toLogin.click(); await wait(200); }

    var ob = function(){ return document.querySelector('.ob').textContent.replace(/\\s+/g, ' '); };

    /* 1. Логін, якого сервер не знає. Правда — але вона має бути з
          порадою, інакше це тупик. */
    var li = document.querySelector('.ob .inp');
    if (li) type(li, 'nikoly-ne-buv@mail.com');
    await wait(120);
    if (pri()) pri().click();
    /* Чекаємо саме на текст помилки. Слово «немає» тут не годиться: воно
       стоїть на кнопці «Немає кабінету — створити», тобто на екрані було
       з самого початку, і перевірка проходила б, нічого не дочекавшись. */
    var noUser = function(){ return /Такого кабінету на цьому пристрої немає/.test(ob()); };
    await until(noUser, 8000);
    res.saidNo = noUser();
    res.told = /увімкніть/.test(ob()) || /Резервна копія/.test(ob());
    res.saw1 = ob().slice(0, 260);

    /* 2. Той самий крок, але сервер не відповів. Тепер це має бути про
          зв'язок, а не про кабінет. */
    Cloud.peek = async function(){ return {ok: false, error: 'network'}; };
    li = document.querySelector('.ob .inp');
    if (li) type(li, 'inshyi@mail.com');
    await wait(120);
    if (pri()) pri().click();
    await until(function(){ return /зв.язатися з сервером/.test(ob()); }, 8000);
    res.netSaid = /зв.язатися з сервером/.test(ob());
    res.netNotLying = !/Такого кабінету на цьому пристрої немає/.test(ob());
    res.saw = ob().slice(0, 220);

    res.err = window.__err || '';
    say(res);
  })();
`;

/* Забутий пароль. Найдорожчий шлях у застосунку: тут людина або
   повертає базу клієнтів, або втрачає її. Проходимо його цілком —
   лист, код, новий пароль, новий замок — і перевіряємо обидва боки:
   новий пароль відкриває копію, старий уже ні. */
PROBES['app-lost.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    var login = Web.login();
    var put = await Cloud.push();
    res.saved = !!(put && put.ok);

    var sc = await Web.sendCode(login);
    res.sent = !!(sc && sc.sent);

    var box = await (await fetch('/_test/code?login=' + encodeURIComponent(login))).json();
    res.code = (box.code || '').length;
    res.letters = box.letters;

    var v = await Web.checkCode(login, box.code);
    res.verified = !!(v && v.verified);
    res.gotKey = !!(v && v.key);
    res.gotTicket = !!(v && v.ticket);

    /* новий пароль: ключ той самий, замок інший */
    var c = await Vault.cloud('novyi-parol', v.salt, {raw: v.key});
    var rk = await Cloud.rekey(login, v.ticket, c);
    res.rekeyed = !!(rk && rk.ok);
    res.why = JSON.stringify(rk);

    var back = await Cloud.open(login, 'novyi-parol', v.salt);
    res.read = !!(back && back.ok);
    try { res.clients = (JSON.parse(back.json).clients || []).length; } catch (e){ res.clients = -1; }

    var old = await Cloud.open(login, 'test1234', v.salt);
    res.oldWorks = !!(old && old.ok);

    /* квиток одноразовий: другий раз тим самим не пройти */
    var again = await Cloud.rekey(login, v.ticket, c);
    res.twice = !!(again && again.ok);

    res.err = window.__err || '';
    say(res);
  })();
`;

/* Вихід з акаунта. Останній крок — перезавантаження сторінки, і його
   пробі не пережити, тож перевіряємо все до нього: рядок на місці,
   питання ставиться, а позначка виходу справді лягає на диск. */
PROBES['app-signout.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    var rows = await menu();
    await openRow(rows, 5);                                   /* Налаштування */
    var out = all('.page .setrow').filter(function(b){
      return /Вийти з акаунта/.test(b.textContent);
    })[0];
    res.row = !!out;

    /* ─── небезпечне — в кінці ───
       Вихід і очищення стояли посеред налаштувань, між адресою
       синхронізації та умовами використання. Людина крутила список у
       пошуках чогось свого й проходила повз кнопку, яка стирає базу.
       Перевіряємо порядок на екрані, а не намір у коді. */
    var heads = all('.page .sechead .h2').map(function(h){ return h.textContent.trim(); });
    res.lastHead = heads.slice(-1)[0] || '';
    var rowsAll = all('.page .setrow');
    var idxOf = function(re){ return rowsAll.findIndex(function(b){ return re.test(b.textContent); }); };
    var iWipe = idxOf(/Очистити всі дані/), iTerms = idxOf(/Умови використання/), iHelp = idxOf(/Допомога/);
    res.afterLegal = iTerms >= 0 && iHelp >= 0 && iWipe > iTerms && iWipe > iHelp;
    res.order = 'умови ' + iTerms + ', допомога ' + iHelp + ', очищення ' + iWipe;
    if (out){ out.click(); await wait(400); }
    var sheet = all('.sheet').filter(vis).slice(-1)[0];
    res.asks = !!(sheet && /Вийти з акаунта\\?/.test(sheet.textContent));
    res.go = !!(sheet && sheet.querySelector('.btn.pri'));
    /* сам вихід перевіряємо без натискання: інакше сторінка перезапуститься */
    res.before = Disk.signedOut();
    Disk.signOut();
    res.after = Disk.signedOut();
    Disk.signIn();
    res.back = Disk.signedOut();
    res.err = window.__err || '';
    say(res);
  })();
`;

/* Видана вручну підписка має відкриватися в застосунку. Саме так її
   побачить ревізор магазину: логін є, оплати не було, пристрій до
   підписки ще не прив'язаний. Раніше це робила кнопка «Відновити
   покупку», але в збірці для магазину її немає. */
PROBES['app-claim.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    var rows = await menu();
    await openRow(rows, 7);                                   /* Підписка */
    var page = function(){ var p = all('.page'); return p[p.length - 1] || null; };
    var first = page() ? page().querySelectorAll('.btn.pri')[0] : null;
    if (first){ first.click(); await wait(700); }             /* екран підписки */
    var pay = page() ? page().querySelectorAll('.btn.pri')[0] : null;
    res.button = pay ? pay.textContent.trim() : '';
    if (pay){ pay.click(); }
    /* Дивимось у #root, а не в body: у body лежить і текст самого
       скрипта, а в ньому таблиця перекладів — разом із рядком, який ми
       шукаємо. Перевірка на body проходила б завжди. */
    var root = document.getElementById('root');
    /* чекати довго тут не можна: у браузера бюджет віртуального часу
       шість секунд, і проба просто не встигне сказати результат */
    res.opened = await until(function(){
      return (root.textContent || '').indexOf('Підписка активна') >= 0;
    }, 1200);
    res.err = window.__err || '';
    say(res);
  })();
`;

/* Збірка для магазину: усередині нічого не продається, і — головне —
   з екрана підписки нікуди не можна піти платити. Саме за посилання
   назовні Apple знімає застосунок із перевірки, тож перевіряємо не
   тільки те, що кнопки покупки немає, а й що виходів не лишилось. */
PROBES['app-free.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter(((location.search.match(/who=(\\w+)/) || [])[1] || 'trainer') + '@mail.com');
    var rows = await menu();
    res.menu = rows.length;
    await openRow(rows, 7);                                   /* Підписка */
    /* екрани відкриваються один поверх одного, і попередній лишається в
       DOM — дивимось на верхній, інакше перевірки проходять вхолостую */
    var page = function(){ var p = all('.page'); return p[p.length - 1] || null; };
    res.subPage = !!page();
    var first = page() ? page().querySelectorAll('.btn.pri')[0] : null;
    res.subBtn = first ? first.textContent.trim() : '';
    var subText = page() ? page().textContent : '';
    /* Логін на екрані підписки. Без нього не відповісти, чому на
       телефоні лишилось дванадцять днів, а на сайті десять: строк
       рахується від початку пробного, а той прив'язаний до логіна. */
    res.showsLogin = !!Web.login() && subText.indexOf(Web.login()) >= 0;
    res.who = Web.login();
    res.manage = subText.indexOf('на сайті') >= 0;
    /* у чинного пробного періоду дата попереду, і продовжувати нічого */
    res.ends = subText.indexOf('Завершилась') >= 0;
    res.till = subText.indexOf('Діє до') >= 0;
    res.renew = subText.indexOf('Автопродовження') >= 0;
    if (first){ first.click(); await wait(700); }             /* екран підписки */
    var top = page();
    var txt = top ? top.textContent : '';
    res.site = txt.indexOf(location.hostname) >= 0;
    res.paid = txt.indexOf('Я вже оплатив') >= 0;
    res.plans = top ? top.querySelectorAll('.plan').length : -1;
    res.planText = top ? [].slice.call(top.querySelectorAll('.plan')).map(function(x){
      return x.textContent.replace(/\\s+/g, ' ');
    }).join(' | ') : '';
    res.trial = window.__trial || '';
    res.buy = txt.indexOf('Продовжити') >= 0 || txt.indexOf('Активувати у WEB') >= 0;
    res.links = top ? top.querySelectorAll('a[href]').length : -1;
    res.err = window.__err || '';
    say(res);
  })();
`;

PROBES['app-boot.js'] = `
  var say = function(s){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = s; document.body.appendChild(p); };
  setTimeout(function(){
    say(JSON.stringify({
      root: document.getElementById('root').children.length,
      text: (document.body.textContent || '').slice(0, 160),
      err: window.__err || '',
    }));
  }, 1200);
  window.addEventListener('error', function(e){ window.__err = String(e.message || e); });
`;

/* сторінка підписки малюється після відповіді сервера, тож чекаємо на неї */
const WAIT = `
  var say = function(s){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = s; document.body.appendChild(p); };
  var wait = function(test, done, left){
    if (test()) return done();
    if ((left || 0) > 60) return done();
    setTimeout(function(){ wait(test, done, (left || 0) + 1); }, 100);
  };`;
/* у розмітці вже лежить «…», тож чекати «щось з'явилось» не можна —
   чекаємо саме на зміну, інакше проба ловить заглушку */
PROBES['account.js'] = WAIT + `
  var box = document.getElementById('box');
  var was = box.textContent;
  wait(function(){ return box.textContent !== was; }, function(){
    say(JSON.stringify({text: box.textContent, offHidden: document.getElementById('off').hidden}));
  });
`;
PROBES['account-off.js'] = WAIT + `
  var box = document.getElementById('box'), off = document.getElementById('off');
  wait(function(){ return !off.hidden; }, function(){
    var before = box.textContent;
    off.click();
    wait(function(){ return box.textContent !== before; }, function(){
      say(JSON.stringify({text: box.textContent, offHidden: off.hidden}));
    });
  });
`;

const go = (p, probe) => 'http://127.0.0.1:' + PORT + p + (p.includes('?') ? '&' : '?') + 'probe=' + probe;

server.listen(PORT, '127.0.0.1', async () => {
  try {
    part('сторінка оплати');
    let o = JSON.parse(out(await dom(go('/pay.html', 'plans.js'))) || '{}');
    ok('усі три тарифи на сторінці', o.count === 3, o.count + ' шт.');
    ok('річний обрано за замовчуванням', /1990/.test(o.picked || ''), (o.picked || '').trim());
    /* Ціна магазину звідси прибрана навмисно: відколи тут гривня, а там
       долар, закреслені $4.99 біля 299 ₴ читались би як знижка вдесятеро,
       якої немає. Перевіряємо, що долара на сторінці оплати не лишилось. */
    ok('доларів на сторінці оплати немає', !/\$/.test(o.first || ''), (o.first || '').trim());

    o = JSON.parse(out(await dom(go('/pay.html', 'pick.js'))) || '{}');
    ok('вибір перемикається на інший тариф', /299/.test(o.picked || ''), (o.picked || '').trim());
    ok('обраний лишається один', o.count === 1);

    part('без логіна');
    o = JSON.parse(out(await dom(go('/pay.html', 'nologin.js'))) || '{}');
    ok('показано помилку', o.shown === true, o.text);
    ok('на оплату не пішли', o.url === '/pay.html', o.url);

    part('перехід на оплату');
    log.length = 0;
    await dom(go('/pay.html?login=trainer%40mail.com&device=dev1&lang=uk', 'buy.js'));
    const hit = log.find(x => x.path === '/api/checkout');
    ok('запит на оплату пішов', !!hit);
    ok('логін і пристрій передані', hit && hit.query.login === 'trainer@mail.com' && hit.query.device === 'dev1',
       hit ? hit.query.login + ' · ' + hit.query.device : '');
    ok('тариф переданий', hit && hit.query.plan === 'yearly', hit && hit.query.plan);

    part('мови');
    /* слова беремо з самої сторінки, а не з пам'яті: інакше перевірка
       перевіряє не переклад, а мою вигадку */
    const say = fs.readFileSync(path.join(ROOT, 'pay.html'), 'utf8');
    const words = ['uk', 'ru', 'en', 'pl'].map(l => {
      const at = say.indexOf(l + ':{title:');
      return [l, /go:'([^']+)'/.exec(say.slice(at, at + 900))[1]];
    });
    for (const [lang, word] of words){
      const html = await dom('http://127.0.0.1:' + PORT + '/pay.html?lang=' + lang);
      ok('сторінка ' + lang, html.includes(word), word);
    }

    part('чуже в адресі не потрапляє в розмітку');
    const html = await dom('http://127.0.0.1:' + PORT + '/pay.html?login=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
    ok('теги з логіна екрановані', !/<img src=x/.test(html));

    part('сторінка підписки');
    /* заводимо підписку прямо в сховищі сервера — так само, як це зробив
       би платіж, що дійшов */
    await L.applyPayment({login: 'trainer@mail.com', device: 'dev1', plan: 'yearly',
                          orderId: 'test-order', autoRenew: true});
    o = JSON.parse(out(await dom(go('/account.html?login=trainer%40mail.com&device=dev1', 'account.js'))) || '{}');
    ok('підписка показана як активна', /Активна до/.test(o.text || ''), (o.text || '').trim());
    ok('видно кнопку вимкнення автопродовження', o.offHidden === false);

    o = JSON.parse(out(await dom(go('/account.html?login=trainer%40mail.com&device=dev1', 'account-off.js'))) || '{}');
    ok('автопродовження вимикається', /вимкнено/i.test(o.text || ''), (o.text || '').trim());
    ok('кнопка ховається після вимкнення', o.offHidden === true);
    ok('на сервері теж вимкнулось',
       (await L.readLicence('trainer@mail.com')).autoRenew === false);

    o = JSON.parse(out(await dom(go('/account.html?login=hto%40hto.com&device=dev1', 'account.js'))) || '{}');
    ok('чужому логіну підписки не показуємо', /не знайшли/i.test(o.text || ''), (o.text || '').trim());

    part('маленький React поводиться як справжній');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_mini.html')) || '{}');
    ok('компоненти малюються', o.rendered === 2, o.rendered + ' шт.');
    ok('контекст доходить до дитини', /з контексту/.test(o.context || ''), o.context);
    ok('ефект спрацював на кожній дитині', o.mounted === 2, String(o.mounted));
    ok('стан оновлює екран', o.afterSet === '1', o.afterSet);
    ok('за ключем вузол не перестворюється', o.sameNode === true);
    ok('ефект із порожніми залежностями не повторюється', o.mountedAgain === 1, String(o.mountedAgain));
    ok('у поле вводу пишеться', o.typed === 'при', o.typed);
    ok('поле не перестворюється на кожній літері', o.sameInput === true);
    ok('фокус лишається в полі', o.keptFocus === true);
    ok('знятий з екрана вузол зникає', o.gone === true);
    ok('прибирання ефектів викликається', o.cleanup >= 1, String(o.cleanup));

    part('застосунок у браузері');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-boot.js')) || '{}');
    ok('застосунок намалювався', o.root > 0, 'вузлів у корені: ' + o.root);
    ok('без помилок на старті', !o.err, o.err || '—');
    ok('видно перший екран', /день|Day|Dzień|екрані/i.test(o.text || ''), (o.text || '').slice(0, 60));

    const driven = await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-drive.js');
    if (process.env.PEEK) require('fs').writeFileSync('/tmp/driven.html', driven);
    o = JSON.parse(out(driven) || '{}');
    ok('онбординг, вхід і налаштування проходяться', o.tabs === 5, 'вкладок унизу: ' + o.tabs + (o.screen ? ' · ' + o.screen : ''));
    ok('на головній видно дохід', o.home === true);
    ok('календар малює години', o.cal > 0, o.cal + ' годин');
    ok('список клієнтів не порожній', o.clients > 0, o.clients + ' рядків');
    ok('картка клієнта відкривається', o.card > 0);
    ok('помилок під час проходу немає', !o.err, o.err || '—');

    part('запис тренування з повтором');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-session.js')) || '{}');
    ok('швидке додавання відкривається', o.quick === 5, o.quick + ' пунктів');
    ok('форма тренування відкрилась', o.form > 0);
    ok('список клієнтів у виборі є', o.people > 0, o.people + ' клієнтів');
    ok('повтор «щотижня» вмикається', o.repeatOn === true);
    ok('з\'явився вибір кількості разів', o.times >= 4, o.times + ' варіантів');
    ok('тренування зберігається', o.backToApp === true, o.saveText);
    ok('помилок немає', !o.err, o.err || '—');

    part('часткове закриття боргу');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-debt.js')) || '{}');
    ok('сторінка боргів відкривається', o.page > 0);
    ok('борги на ній є', o.debts > 0, o.debts + ' карток');
    ok('кнопка оплати на місці', o.hasPay === true);
    ok('вікно оплати відкривається', o.sheet > 0);
    ok('борг зменшився, але не зник', o.after && o.before && Number(o.after) < Number(o.before) && Number(o.after) > 0,
       o.before + ' → ' + o.after);
    ok('помилок немає', !o.err, o.err || '—');

    part('шторку можна гортати, а не тільки закривати');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-sheet.js')) || '{}');
    ok('шторка відкрилась', o.opened === true);
    ok('у ній є прокрутка', o.scrolls === true);
    ok('рух по списку не закриває', o.afterList === true);
    ok('рух за ручку закриває', o.afterGrip === false);
    ok('помилок немає', !o.err, o.err || '—');

    part('збірка для магазину не продає');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?free=1&who=freebuild&probe=app-free.js')) || '{}');
    ok('екран підписки відкривається', o.subPage === true);
    ok('кнопка веде до перевірки, а не до покупки', o.subBtn === 'Перевірити підписку', o.subBtn);
    ok('посилання на кабінет немає', o.manage === false);
    ok('дата пробного — «діє до», а не «завершилась»', o.till === true && o.ends === false,
       JSON.stringify({till: o.till, ends: o.ends}));
    ok('у пробного немає автопродовження', o.renew === false);
    ok('видно, де оформити підписку', o.site === true);
    ok('є чим підтвердити оплату', o.paid === true);
    ok('планів для покупки не показуємо', o.plans === 0, o.plans + ' шт.');
    ok('кнопок покупки немає', o.buy === false);
    ok('посилань назовні немає', o.links === 0, o.links + ' шт.');
    ok('помилок немає', !o.err, o.err || '—');

    /* Зворотна перевірка: без прапорця той самий екран продає. Інакше
       випадково увімкнений прапорець прибрав би покупку скрізь, і всі
       перевірки вище лишились би зеленими. */
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?who=paidbuild&probe=app-free.js')) || '{}');
    ok('без прапорця плани на місці', o.plans === 3, o.plans + ' шт.');
    ok('без прапорця кнопка покупки є', o.buy === true);
    ok('без прапорця кнопка веде до вибору плану', o.subBtn === 'Обрати план', o.subBtn);
    ok('на екрані підписки видно, в якому ви кабінеті', o.showsLogin === true, o.who || 'логіна немає');

    /* ─── валюта на екрані ───
       Тренер відкрив застосунок і побачив «Далі від $4.99», а каса
       виставляє рахунок у гривнях. Долар у таблиці тарифів лишається
       навмисно — він для магазину, — тому перевіряємо не таблицю, а те,
       що видно людині: на екрані має стояти сума, яку з неї спишуть. */
    ok('на екрані пробного періоду ціна в гривні',
       /299 ₴/.test(o.trial) && !/\$/.test(o.trial), o.trial || 'екрана не бачили');
    ok('у картках планів ціни в гривні',
       ['299 ₴', '749 ₴', '1990 ₴'].every(s => o.planText.includes(s)) && !/\$/.test(o.planText),
       o.planText || '—');

    part('копія бази на сервері');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?cloud=1&probe=app-cloud.js')) || '{}');
    ok('копія збереглась', o.saved === true, o.why || '');
    ok('сервер знає, що копія є', o.has === true, o.peek || '');
    ok('сіль віддається новому пристрою', o.salt === true);
    ok('своїм паролем копія читається', o.read === true);
    ok('у копії ті самі клієнти', o.clients === 8, o.clients + ' шт.');
    ok('чужим паролем не читається', o.stranger === false);
    ok('чужому сервер запис навіть не віддає', o.strangerWhy === 'wrong_token', o.strangerWhy || '—');
    ok('помилок немає', !o.err, o.err || '—');

    /* Обіцянка з налаштувань, перевірена з боку сховища: увімкнене
       відновлення означає, що ключ у нас лежить, вимкнене — що його
       немає. Слово тут коштує рівно стільки, скільки цей запис. */
    part('ключ від копії — рівно там, де обіцяно');
    const DB = require('../api/db.js');
    const post = (login, keep) => fetch('http://127.0.0.1:' + PORT + '/api/db?' +
      new URLSearchParams({login, token: 'tok-' + login}), {method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({salt: 's', wrap: {iv: 'i', ct: 'c'}, iv: 'i', ct: 'c', keep})});

    await post('on@mail.com', 'KEY-ON');
    await post('off@mail.com', '');
    const recOn = await L.store.get(DB.keyOf('on@mail.com'));
    const recOff = await L.store.get(DB.keyOf('off@mail.com'));
    ok('увімкнене відновлення — ключ у нас є', recOn.keep === 'KEY-ON', recOn.keep || '—');
    ok('вимкнене — ключа немає', !recOff.keep, recOff.keep || '—');
    /* keep не має вийти назовні навіть тому, хто знає пароль: віддавати
       ключ у відповіді немає жодної потреби, а витік був би тихим */
    const mine = await (await fetch('http://127.0.0.1:' + PORT + '/api/db?' +
      new URLSearchParams({login: 'on@mail.com', token: 'tok-on@mail.com'}))).json();
    ok('власнику копію віддаємо', mine.has === true && mine.ct === 'c');
    ok('а ключ — ні', mine.keep === undefined, JSON.stringify(mine.keep));

    /* Кабінет без копії мовчав, і тренер дізнавався про це, коли телефон
       уже загубився. Перевіряємо не код, а те, чи він це побачить. */
    /* Найдорожчий крок застосунку — і найтихіший, коли ламається. */
    part('обрив зв’язку при зміні пароля');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?cloud=1&probe=app-lostnet.js')) || '{}');
    ok('до нового пароля доходимо', o.verified === true,
       'набрано: ' + JSON.stringify(o.typed) + ', кнопка: ' + JSON.stringify(o.lostText) +
       ', після неї: ' + (o.afterLost || '—'));
    ok('кнопка оживає, а не застигає на «Хвилинку…»', o.alive === true,
       'поле: ' + o.field + ', набрано: ' + JSON.stringify(o.typedPass) +
       ', кнопка: ' + JSON.stringify(o.saveBtn) + ', через 600мс: ' + JSON.stringify(o.at600));
    ok('і пояснює, що сталось', o.said === true, o.saw || '—');
    ok('помилок немає', !o.err, o.err || '—');

    part('онбординг гортається пальцем');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-swipe.js')) || '{}');
    ok('змах вліво веде на наступний слайд', o.second && o.second !== o.first,
       (o.first || '').slice(0, 30) + ' → ' + (o.second || '').slice(0, 30));
    ok('крапка їде разом зі слайдом', o.dotFirst === 0 && o.dotSecond === 1,
       o.dotFirst + ' → ' + o.dotSecond);
    ok('змах вправо повертає назад', o.back === o.first);
    ok('на першому слайді далі нікуди', o.stays === o.first);
    ok('випадковий дотик слайд не міняє', o.tiny === o.first);
    ok('помилок немає', !o.err, o.err || '—');
    ok('подія дотику долітає до екрана', o.seen === 4,
       'дотиків: ' + o.seen + ', TouchEvent: ' + o.hasTouch);

    part('кабінет без копії каже про це сам');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?cloud=1&probe=app-nocloud.js')) || '{}');
    ok('поки копія є — мовчимо', o.armedFirst === true && o.quietWhenArmed === true,
       'ключ: ' + o.armedFirst + ', вкладка: ' + o.tab + ', клієнтів: ' + o.clients);
    ok('зник ключ — попереджаємо на головній', o.warned === true);
    ok('і одразу даємо це полагодити', o.hasFix === true);
    ok('«Пізніше» ховає рядок', o.hidden === true, 'кнопка: ' + o.laterFound + ', позначка: ' + o.nag);
    ok('але копію не вимикає — це різні речі', o.stillWants === true);
    ok('помилок немає', !o.err, o.err || '—');

    /* Вхід, коли входити нічим. Тут важливо не «показалась помилка», а
       яка саме: три різні причини колись давали одну відповідь. */
    part('вхід без копії й без зв’язку');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?cloud=1&probe=app-nocopy.js')) || '{}');
    ok('незнайомий кабінет — так і кажемо', o.saidNo === true, o.saw1 || '—');
    ok('і одразу пояснюємо, що робити далі', o.told === true, o.saw1 || '—');
    ok('обрив зв’язку — це про зв’язок', o.netSaid === true, o.saw || '—');
    ok('а не «такого кабінету немає»', o.netNotLying === true, o.saw || '—');
    ok('помилок немає', !o.err, o.err || '—');

    /* Переписка з підтримкою: від набраного тексту до відповіді, що
       з'явилась сама. Тут перевіряється не сервер (це робить licence.js),
       а те, чи доходить це до людини на екрані. */
    part('переписка з підтримкою');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?cloud=1&probe=app-help.js')) || '{}');
    ok('кнопка підтримки стоїть у профілі, а не лише в налаштуваннях',
       o.onProfile === true, 'кнопка у смужці зверху');
    ok('  і відкриває переписку', o.byButton === true, 'екран підтримки');
    ok('«Підтримка» лишилась і в меню', o.inMenu === true);
    ok('екран відкривається', o.opened === true, o.title || '—');
    ok('є куди писати', o.hasBox === true);
    ok('кнопка вмикається від тексту', o.canSend === true);
    ok('своє повідомлення стало на екрані', o.mine === 1, o.mineText || '—');
    ok('відповідь приходить сама, без перезавантаження', o.theirs === 1, o.theirText || '—');
    ok('помилок немає', !o.err, o.err || '—');

    part('кабінет заводиться тільки на пошту');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-mail.js')) || '{}');
    ok('у полі просять саме пошту', o.field === 'trainer@mail.com', o.field);
    ok('номер телефону не приймають', o.refused === true);
    ok('і пояснюють це на місці, а не мовчки', o.stillHere === true);
    ok('із поштою реєстрація доходить до кінця', o.passed === true);
    ok('помилок немає', !o.err, o.err || '—');

    /* Кнопка «Увійти» на новому пристрої. Спирається на копію, яку щойно
       поклала проба вище, — тому й стоїть одразу за нею. */
    part('«Увійти» працює з чистого пристрою');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?cloud=1&probe=app-join.js')) || '{}');
    ok('є куди перемкнутись на вхід', o.hasSwitch === true);
    ok('пристрій кабінета не знає, але пароль просять', o.asksPass === true);
    ok('і кажуть, що кабінет знайдено', o.found === true);
    ok('чужий пароль не пускає', o.stranger === true, o.saw || '');
    ok('свій пароль відкриває кабінет', o.inside === true);
    ok('клієнти на місці', o.clients === 8, o.clients + ' шт.');
    ok('помилок немає', !o.err, o.err || '—');

    part('забутий пароль повертає базу');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?cloud=1&probe=app-lost.js')) || '{}');
    ok('копія на місці', o.saved === true);
    ok('лист із кодом пішов', o.sent === true && o.letters > 0, JSON.stringify([o.sent, o.letters]));
    ok('код — шість цифр', o.code === 6, o.code + ' знаків');
    ok('пошта підтверджена', o.verified === true);
    ok('ключ від копії повернувся', o.gotKey === true);
    ok('квиток на новий замок виданий', o.gotTicket === true);
    ok('новий замок став на місце', o.rekeyed === true, o.why || '');
    ok('новий пароль відкриває копію', o.read === true);
    ok('дані ті самі', o.clients === 8, o.clients + ' шт.');
    ok('старий пароль більше не підходить', o.oldWorks === false);
    ok('квиток одноразовий', o.twice === false);
    ok('помилок немає', !o.err, o.err || '—');

    part('вихід з акаунта');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-signout.js')) || '{}');
    ok('рядок «Вийти з акаунта» на місці', o.row === true);
    ok('  небезпечне стоїть останнім розділом', o.lastHead === 'Вихід', o.lastHead || '—');
    ok('  і нижче за умови й допомогу', o.afterLegal === true, o.order || '—');
    ok('перепитує, перш ніж вийти', o.asks === true);
    ok('є чим підтвердити', o.go === true);
    ok('позначка виходу лягає й знімається', o.before === false && o.after === true && o.back === false,
       JSON.stringify([o.before, o.after, o.back]));
    ok('помилок немає', !o.err, o.err || '—');

    part('видана підписка відкривається в застосунку');
    /* підписка є, оплати не було, пристрій ще не прив'язаний — рівно те,
       що побачить ревізор магазину */
    await L.writeLicence('trainer@mail.com', {
      login: 'trainer@mail.com', plan: 'yearly', orderId: 'grant_test',
      purchasedAt: Date.now(), paidAt: Date.now(),
      expiresAt: Date.now() + 90 * 86400000,
      autoRenew: false, devices: [], granted: true,
    });
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?free=1&probe=app-claim.js')) || '{}');
    ok('кнопка на місці', o.button === 'Я вже оплатив', o.button);
    ok('доступ відкрився', o.opened === true);
    ok('помилок немає', !o.err, o.err || '—');

    /* Сторінка «з чого почати». Її дають тренеру разом із посиланням, і
       якщо вона мовчки не намалюється, людина впреться в порожній екран
       у перші ж хвилини знайомства. */
    part('публічна сторінка про сервіс');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/about.html?probe=about.js')) || '{}');
    ok('усі три тарифи на місці', o.plans === 3, o.plans + ' шт.');
    ok('ціни у гривні', o.hryvnia === true, o.amounts || '—');
    ok('доларів на сторінці немає', o.dollars === false);
    ok('назва ФОП стоїть', o.company === true);
    ok('РНОКПП стоїть', o.id === true);
    ok('адреса стоїть', o.addr === true);
    ok('телефон стоїть і набирається', o.phone === true && o.tel === true);
    ok('пошта клікається', o.mail === true);
    ok('умови повернення описані', o.refund === true);
    ok('пробний період названо', o.trial === true);
    ok('є вихід у застосунок', o.app === true);
    ok('помилок немає', !o.err, o.err || '—');

    part('сторінка «з чого почати»');
    {
      const page = await dom('http://127.0.0.1:' + PORT + '/start.html?lang=uk&probe=start.js');
      const o = JSON.parse(out(page) || '{}');
      ok('три кроки на місці', o.steps === 3, o.steps + ' шт.');
      ok('кроки пронумеровані по порядку', o.nums === '123', o.nums);
      ok('є про що просимо', o.ask === true);
      ok('кнопка веде в застосунок', o.go === '/?lang=uk', o.go);
      ok('пошта підтримки клікається', o.mail === true);
      ok('помилок немає', !o.err, o.err || '—');

      const ru = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/start.html?lang=ru&probe=start.js')) || '{}');
      ok('російська теж намальована', ru.steps === 3 && /С чего начать/.test(ru.title), ru.title);
      ok('мова передається далі в застосунок', ru.go === '/?lang=ru', ru.go);
    }

    part('адмінка');
    {
      const o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/admin.html?probe=admin.js')) || '{}');
      ok('меню на телефоні відкривається', o.opens === true);
      ok('  і палець доходить до пункту, а не до затемнення', o.reaches === true,
         o.reaches ? 'пункт ловить дотик' : 'дотик перехоплює щось інше — меню під чужим шаром');
      ok('  затемнення прибирається разом із меню', o.closes === true);
      ok('усі розділи малюються', Array.isArray(o.blank) && !o.blank.length,
         (o.blank || []).join(', ') || '9 розділів');
      ok('порожніх значень на екрані немає', Array.isArray(o.junk) && !o.junk.length,
         (o.junk || []).join(', ') || 'ні undefined, ні NaN');
      ok('числа на телефоні стоять в один ряд', o.oneRow === true, o.tiles + ' плиток');
      ok('  ряд гортається вбік', o.rides === true);
      ok('  а сама сторінка вбік не з\'їжджає', o.pageStill === true,
         o.pageStill ? 'ширина по екрану' : 'сторінка ширша за екран — праворуч порожнеча');
      ok('помилок немає', !o.errs, o.errs || '—');
    }

    part('сторінка після оплати');
    ok('відкривається', (await dom('http://127.0.0.1:' + PORT + '/paid.html')).includes('PRO Trainer'));
  } catch (e){
    /* Обрив посеред прогону — теж результат, і його треба назвати. Без
       цього рядка помилка виходила з асинхронного обробника кудись у
       порожнечу, а в журналі лишався обрубаний список перевірок. */
    broke = (e && e.message) ? e.message : String(e);
    console.log('\n  ✗ прогін обірвано: ' + broke);
  } finally {
    server.close();
  }
  console.log('\n══════ ' + (broke ? 'прогін обірвано, перевірено ' + checks : (checks - fails) + ' з ' + checks) +
              (broke || fails ? ' · є замечання' : ' · все чисто') + ' ══════');
  process.exit(broke || fails ? 1 : 0);
});
