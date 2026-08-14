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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  log.push({path: url.pathname, query: Object.fromEntries(url.searchParams)});

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
const dom = url => new Promise(resolve => {
  const p = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--window-size=430,900', '--virtual-time-budget=6000', '--dump-dom', url]);
  let outp = '';
  p.stdout.on('data', d => { outp += d; });
  p.on('close', () => resolve(outp));
  /* якщо сторінка чомусь не дочекалась — не висимо назавжди */
  setTimeout(() => { try { p.kill(); } catch {} }, 25000);
});
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

    part('сторінка після оплати');
    ok('відкривається', (await dom('http://127.0.0.1:' + PORT + '/paid.html')).includes('PRO Trainer'));
  } finally {
    server.close();
  }
  console.log('\n══════ ' + (checks - fails) + ' з ' + checks +
              (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
  process.exit(fails ? 1 : 0);
});
