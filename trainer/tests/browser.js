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
const L = require('../api/_lib.js');

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

/* Заміна, яка не вміє промахнутись мовчки. */
const replaceOnce = (text, re, to, what) => {
  if (!re.test(text)) throw new Error('не знайшов у зібраній сторінці: ' + what);
  return text.replace(re, to);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  log.push({path: url.pathname, query: Object.fromEntries(url.searchParams)});

  /* Сам застосунок: скомпільований (без Babel) і з маленьким React
     замість CDN. Зовнішні посилання прибираємо — не через економію, а
     тому що запит, який нікуди не доходить, зупиняє віртуальний час у
     headless, і сторінка не дочекається ніколи. */
  if (url.pathname === '/_app.html'){
    let html = require('../build.js').build(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
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
       Робимо це лише там, де потрібні справжні запити: на інших екранах
       адреса сайту показується людині, і підміна зіпсувала б перевірку. */
    if (url.searchParams.get('local'))
      html = replaceOnce(html, /base:\s*["']https:\/\/pro-trainer\.pro["']/, "base: ''", 'адреса сайту');
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
  '--hide-scrollbars', '--window-size=430,900', '--virtual-time-budget=6000', '--dump-dom'];

const once = url => new Promise(resolve => {
  const p = spawn(CHROME, FLAGS.concat([url]));
  let outp = '', killed = false;
  p.stdout.on('data', d => { outp += d; });
  /* Не висимо назавжди, але й не міряємо себе своєю машиною: перший
     запуск браузера на холодній машині буває довгим. */
  const t = setTimeout(() => { killed = true; try { p.kill(); } catch {} }, 60000);
  p.on('error', () => resolve(''));
  p.on('close', () => {
    clearTimeout(t);
    if (killed) console.log('  ⚠ браузер не встиг за 60 с: ' + url);
    resolve(outp);
  });
});

/* На CI найперший запуск двічі повертався порожнім — браузер завершувався
   сам, без розмітки, і три перевірки падали з незрозумілим «undefined».
   Причину по логу назвати не вдалося, тому просто пробуємо ще раз, і не
   мовчки: повтор видно в журналі, і якщо він почне траплятися часто —
   це буде видно, а не сховається за зеленим результатом. */
const dom = async url => {
  const first = await once(url);
  /* Ознака вдалого запуску — підсумок проби. Там, де проби немає,
     вистачає будь-якої розмітки. */
  const good = url.includes('probe=') ? first.includes('id="__out"') : first.includes('<body');
  if (good) return first;
  console.log('  ⚠ порожня відповідь браузера, пробуємо ще раз: ' + url);
  return once(url);
};
/* проба пише підсумок сюди, звідси його й читаємо */
const out = html => {
  const m = /<pre id="__out">([^]*?)<\/pre>/.exec(html);
  return m ? m[1] : '';
};

let checks = 0, fails = 0;
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
  var vis = function(e){ return e.offsetParent !== null || e.getClientRects().length; };
  var pri = function(){ return all('.ob button').filter(function(b){ return /pri/.test(b.className); })[0]; };
  var type = function(el, v){
    var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, v);
    el.dispatchEvent(new Event('input', {bubbles: true}));
  };
  var say = function(o){ var p = document.createElement('pre'); p.id = '__out'; p.textContent = JSON.stringify(o); document.body.appendChild(p); };
  window.addEventListener('error', function(e){ window.__err = String(e.message || e); });

  async function enter(){
    await wait(300);
    for (var i = 0; i < 3; i++){ if (pri()){ pri().click(); await wait(120); } }
    var li = document.querySelector('.ob .inp');
    if (li){ type(li, 'trainer@mail.com'); await wait(120); }
    if (pri()){ pri().click(); await wait(300); }
    var nm = document.querySelector('.ob .inp');
    if (nm){ type(nm, 'Alex'); await wait(120); }
    if (pri()){ pri().click(); await wait(400); }
    if (pri()){ pri().click(); await wait(500); }
    /* база читається асинхронно, і доки вона не прочитана, екран показує
       скелет. Далі йдуть перевірки вмісту — виходимо звідси тільки коли
       скелета не лишилось. */
    await until(function(){ return !document.querySelector('.sk'); });
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

/* Вихід з акаунта. Останній крок — перезавантаження сторінки, і його
   пробі не пережити, тож перевіряємо все до нього: рядок на місці,
   питання ставиться, а позначка виходу справді лягає на диск. */
PROBES['app-signout.js'] = DRIVE + `
  (async function(){
    var res = {};
    await enter();
    var burger = document.querySelector('.appbar .iconbtn');
    if (burger){ burger.click(); await wait(350); }
    var rows = all('.sheet .setrow').filter(vis);
    if (rows[5]){ rows[5].click(); await wait(600); }         /* Налаштування */
    var out = all('.page .setrow').filter(function(b){
      return /Вийти з акаунта/.test(b.textContent);
    })[0];
    res.row = !!out;
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
    var burger = document.querySelector('.appbar .iconbtn');
    if (burger){ burger.click(); await wait(350); }
    var rows = all('.sheet .setrow').filter(vis);
    if (rows[7]){ rows[7].click(); await wait(600); }        /* Підписка */
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
    await enter();
    var burger = document.querySelector('.appbar .iconbtn');
    if (burger){ burger.click(); await wait(350); }
    var rows = all('.sheet .setrow').filter(vis);
    res.menu = rows.length;
    if (rows[7]){ rows[7].click(); await wait(600); }        /* Підписка */
    /* екрани відкриваються один поверх одного, і попередній лишається в
       DOM — дивимось на верхній, інакше перевірки проходять вхолостую */
    var page = function(){ var p = all('.page'); return p[p.length - 1] || null; };
    res.subPage = !!page();
    var first = page() ? page().querySelectorAll('.btn.pri')[0] : null;
    res.subBtn = first ? first.textContent.trim() : '';
    res.manage = (page() ? page().textContent : '').indexOf('на сайті') >= 0;
    if (first){ first.click(); await wait(700); }             /* екран підписки */
    var top = page();
    var txt = top ? top.textContent : '';
    res.site = txt.indexOf('pro-trainer.pro') >= 0;
    res.paid = txt.indexOf('Я вже оплатив') >= 0;
    res.plans = top ? top.querySelectorAll('.plan').length : -1;
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
    ok('річний обрано за замовчуванням', /48\.99/.test(o.picked || ''), (o.picked || '').trim());
    ok('ціна магазину показана поруч', /4\.99/.test(o.first || ''));

    o = JSON.parse(out(await dom(go('/pay.html', 'pick.js'))) || '{}');
    ok('вибір перемикається на інший тариф', /4\.49/.test(o.picked || ''), (o.picked || '').trim());
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
    ok('онбординг, вхід і налаштування проходяться', o.tabs === 5, 'вкладок унизу: ' + o.tabs);
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
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?free=1&probe=app-free.js')) || '{}');
    ok('екран підписки відкривається', o.subPage === true);
    ok('кнопка веде до перевірки, а не до покупки', o.subBtn === 'Перевірити підписку', o.subBtn);
    ok('посилання на кабінет немає', o.manage === false);
    ok('видно, де оформити підписку', o.site === true);
    ok('є чим підтвердити оплату', o.paid === true);
    ok('планів для покупки не показуємо', o.plans === 0, o.plans + ' шт.');
    ok('кнопок покупки немає', o.buy === false);
    ok('посилань назовні немає', o.links === 0, o.links + ' шт.');
    ok('помилок немає', !o.err, o.err || '—');

    /* Зворотна перевірка: без прапорця той самий екран продає. Інакше
       випадково увімкнений прапорець прибрав би покупку скрізь, і всі
       перевірки вище лишились би зеленими. */
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-free.js')) || '{}');
    ok('без прапорця плани на місці', o.plans === 3, o.plans + ' шт.');
    ok('без прапорця кнопка покупки є', o.buy === true);
    ok('без прапорця кнопка веде до вибору плану', o.subBtn === 'Обрати план', o.subBtn);

    part('вихід з акаунта');
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?probe=app-signout.js')) || '{}');
    ok('рядок «Вийти з акаунта» на місці', o.row === true);
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
    o = JSON.parse(out(await dom('http://127.0.0.1:' + PORT + '/_app.html?free=1&local=1&probe=app-claim.js')) || '{}');
    ok('кнопка на місці', o.button === 'Я вже оплатив', o.button);
    ok('доступ відкрився', o.opened === true);
    ok('помилок немає', !o.err, o.err || '—');

    part('сторінка після оплати');
    ok('відкривається', (await dom('http://127.0.0.1:' + PORT + '/paid.html')).includes('PRO Trainer'));
  } finally {
    server.close();
  }
  console.log('\n══════ ' + (checks - fails) + ' з ' + checks +
              (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
  process.exit(fails ? 1 : 0);
});
