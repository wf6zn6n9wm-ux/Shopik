/* Перевірка Urok+ у справжньому браузері.
   node urok/tests/browser.js

   Решта тестів рендерить екрани в пісочниці з заглушкою React —
   вони не бачать DOM, подій і фокуса. Тут навпаки: збираємо
   автономний файл (tools/bundle.js) і проходимо ним живий сценарій
   у headless Chromium — вхід, онбординг, вкладки, картки, зміна
   теми й мови. Заразом це єдина перевірка автономного рантайму.

   Chromium беремо з PLAYWRIGHT_BROWSERS_PATH або зі стандартних
   місць; якщо його немає — тест чесно каже про це й виходить із
   нулем, щоб не валити CI на машині без браузера. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.join(__dirname, '..');

function findChromium(){
  const candidates = [];
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    fs.readdirSync(base).forEach(dir => {
      candidates.push(path.join(base, dir, 'chrome-linux', 'chrome'));
      candidates.push(path.join(base, dir, 'chrome-linux', 'headless_shell'));
    });
  } catch (e) {}
  candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
}

const chromium = findChromium();
if (!chromium){
  console.log('браузер не знайдено — перевірку в DOM пропускаємо');
  process.exit(0);
}

/* ── сценарій, який виконається всередині сторінки ──────────────
   Пишемо його як текст: він піде в сторінку окремим скриптом.
   Кроки короткі й перевіряють видимий результат, а не внутрішній
   стан — саме так це бачить користувач.                          */
const SCENARIO = `
(function(){
  var log = [];
  var ok = function(name, cond, extra){ log.push({name: name, ok: !!cond, extra: extra || ''}); };
  var $ = function(sel){ return document.querySelector(sel); };
  var $$ = function(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var text = function(){ return document.body.innerText.replace(/\\s+/g, ' '); };
  var byText = function(needle, sel){
    return $$(sel || 'button, .row, .hw, a, label').filter(function(el){
      return (el.innerText || '').replace(/\\s+/g,' ').trim().indexOf(needle) >= 0;
    })[0];
  };
  var click = function(el){
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    return true;
  };
  var type = function(input, value){
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  };

  var steps = [
    function(){ ok('стартує з екрана входу', text().indexOf('Urok') >= 0 && !!byText('Apple')); },
    function(){ ok('вхід через Apple', click(byText('Apple'))); },
    function(){ ok('питає ім\\'я', !!$('input')); type($('input'), 'Олена Кравець'); },
    function(){ ok('ім\\'я введено', $('input').value === 'Олена Кравець'); click($$('.btn.pri')[0]); },
    function(){ ok('онбординг почався', !!$('.slide')); },
    /* по одному кроку за раз: кліки в одному такті побачили б той
       самий стан і зарахувалися б як один — так само, як у React */
    function(){ click($$('.btn.pri')[0]); },
    function(){ click($$('.btn.pri')[0]); },
    function(){ click($$('.btn.pri')[0]); },
    function(){ click($$('.btn.pri')[0]); },
    function(){ ok('останній слайд онбордингу', !!byText('Почати') || !!byText('Get started')); },
    function(){ click($$('.btn.pri')[0]); },
    function(){ ok('дійшли до застосунку', !!$('.nav') && !!$('.hero')); },
    function(){ ok('є нижня навігація з 4 вкладок', $$('.nav button').length === 4); },
    function(){ ok('демо-дані наливаються', $$('.row').length > 2, String($$('.row').length)); },
    function(){ ok('є картка доходу', !!$('.money')); },
    function(){ var w = $$('.week .day').length; ok('тиждень із 7 днів', w === 7, String(w)); },

    /* заняття → картка → назад */
    function(){ click($$('.rows .row button')[1]); },
    function(){ ok('відкрилась картка заняття', !$('.hero') && text().indexOf('Дії') >= 0, text().slice(0, 40)); },
    function(){ click($('.appbar .iconbtn')); },
    function(){ ok('повернулись на головний', !!$('.hero')); },

    /* вкладка «Учні» → картка учня */
    function(){ click($$('.nav button')[1]); },
    function(){ ok('вкладка «Учні»', !!$('.search input')); },
    function(){ click($$('.rows .row')[0]); },
    function(){ ok('картка учня з балансом', !!$('.balance'), text().slice(0, 60)); },
    function(){ ok('є історія й домашні завдання', text().indexOf('Домашні завдання') >= 0); },
    function(){ click($('.appbar .iconbtn')); },

    /* фінанси через профіль */
    function(){ click($$('.nav button')[3]); },
    function(){ ok('вкладка «Профіль»', text().indexOf('Профіль') >= 0, text().slice(0, 40)); },
    function(){ ok('перехід у фінанси', click(byText('Фінанси'))); },
    function(){ ok('екран фінансів відкрився', text().indexOf('Фінанси') >= 0, text().slice(0, 40)); },
    function(){ ok('графік намалювався', $$('.chart .col').length > 0, String($$('.chart .col').length)); },
    function(){ ok('є періоди', $$('.seg button').length === 4); },
    function(){ click($$('.seg button')[0]); },
    function(){ ok('перемикання періоду працює', $$('.chart .col').length === 7, String($$('.chart .col').length)); },
    function(){ click($('.appbar .iconbtn')); },

    /* тема */
    function(){ click($$('.nav button')[3]); },
    function(){ click($$('.appbar .iconbtn').slice(-1)[0]); },
    function(){ ok('відкрились налаштування', text().indexOf('Налаштування') >= 0, text().slice(0, 40)); },
    function(){ ok('є розділ теми', !!byText('Тема')); click(byText('Тема')); },
    function(){ ok('шторка теми відкрилась', !!$('.sheet')); },
    function(){ click(byText('Темна')); },
    function(){ ok('темна тема увімкнулась', document.documentElement.getAttribute('data-theme') === 'dark',
                   document.documentElement.getAttribute('data-theme')); },
    /* Дивимось на токен, а не на колір body: фон їде плавно
       (transition .3s), і в цю мить він ще майже світлий. */
    function(){
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      ok('токени теми перемкнулись', bg === '#0B0D10', bg);
    },

    /* мова */
    function(){ click(byText('Мова')); },
    function(){ ok('шторка мови', !!$('.sheet')); click(byText('English')); },
    function(){ ok('мова перемкнулась', text().indexOf('Settings') >= 0, text().slice(0, 40)); },
    function(){ click(byText('Language')); },
    function(){ ok('повертаємо українську', !!byText('Українська')); click(byText('Українська')); },
    function(){
      var saved = JSON.parse(localStorage.getItem('urok.v1')).settings || {};
      ok('мова й тема збереглись у стані', saved.lang === 'uk' && saved.theme === 'dark',
         saved.lang + '/' + saved.theme);
    },


    /* пошук: перевіряємо, що фокус не втрачається при введенні */
    function(){ click($('.appbar .iconbtn')); },
    function(){ click($$('.nav button')[1]); },
    function(){
      var input = $('.search input');
      input.focus(); type(input, 'Мар');
      ok('пошук фільтрує', $$('.rows .row').length >= 1, String($$('.rows .row').length));
      ok('фокус лишився в полі', document.activeElement === $('.search input'));
    },

    /* створення заняття з головного екрана */
    function(){ click($$('.nav button')[0]); },
    function(){ ok('кнопка «+» на місці', click($('.fab'))); },
    function(){ ok('форма нового заняття', text().indexOf('Нове заняття') >= 0); },
    function(){ click($$('.rows .row')[0]); ok('учень обирається', $$('.rows .row')[0].innerText.length > 0); },
    function(){ click($$('.btn.pri')[0]); },
    function(){ ok('заняття створилось', !!$('.hero') && text().indexOf('Нове заняття') < 0); },
    function(){
      var state = JSON.parse(localStorage.getItem('urok.v1'));
      ok('стан збережено в localStorage', state.lessons.length > 0 && state.auth.status === 'authed');
    },

    /* екран підписки: тарифи, ціна на сайті, кнопка оплати */
    function(){ click($$('.nav button')[3]); },
    function(){ ok('перехід у підписку', click(byText('Підписка'))); },
    /* спершу керування підпискою — як у тренері, тарифи окремо */
    function(){ ok('екран підписки', text().indexOf('Потрібна підписка') >= 0, text().slice(0, 40)); },
    function(){ ok('є відновлення доступу', !!byText('Відновити доступ')); },
    function(){ ok('перехід до тарифів', click(byText('Обрати план'))); },
    function(){ ok('три тарифи', $$('.plan').length === 3, String($$('.plan').length)); },
    function(){ ok('ціни у гривні', text().indexOf('1490 ₴') >= 0 && text().indexOf('149 ₴') >= 0); },
    function(){ ok('видно, що тримісячна — разовий платіж', text().indexOf('Разовий платіж') >= 0); },
    function(){ ok('кнопка оплати на сайті', !!$('.btn.webpay') && text().indexOf('LiqPay') >= 0); },
    function(){ ok('посилання на умови й політику', $$('.legallinks button').length === 2); },
    function(){ click($('.btn.webpay')); },
    /* В автономній копії сторінки оплати поруч немає — застосунок має
       сказати про це словами, а не мовчки нічого не зробити. */
    function(){ ok('кнопка щось відповідає', !!$('.toast'), $('.toast') ? $('.toast').innerText.slice(0, 40) : 'без тоста'); },
    /* А з заданим доменом та сама кнопка веде на сторінку оплати:
       спершу питає пошту, бо саме вона зв'язує платіж із застосунком. */
    function(){ window.U.WEB.base = 'https://urok.test'; click($('.btn.webpay')); },
    function(){ ok('перед оплатою питають пошту', text().indexOf('Пошта для підписки') >= 0, text().slice(-80)); },
    function(){
      var field = $('.sheet input[type="email"]');
      ok('поле пошти на місці', !!field);
      if (field) type(field, 'olena@example.com');
    },
    function(){ ok('кнопка переходу до оплати', !!byText('Перейти до оплати')); }
  ];

  var i = 0;
  function run(){
    if (i >= steps.length){
      document.title = 'RESULT:' + JSON.stringify(log);
      return;
    }
    try { steps[i](); }
    catch (e){ log.push({name: 'крок ' + i, ok: false, extra: String(e && e.message)}); }
    i++;
    setTimeout(run, 40);
  }
  setTimeout(run, 120);
})();
`;

/* ── збираємо сторінку з вшитим сценарієм ──────────────────── */
const bundle = spawnSync('node', [path.join(ROOT, 'tools', 'bundle.js')], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
if (bundle.status !== 0){
  console.error('не вдалося зібрати автономний файл:\n' + (bundle.stderr || ''));
  process.exit(1);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urok-browser-'));
const page = path.join(dir, 'app.html');
/* Заміну робимо функцією: у рядку-заміннику $$ і $& мають окреме
   значення, і сценарій із $$('…') приїхав би в сторінку покаліченим. */
fs.writeFileSync(page, bundle.stdout.replace('</body>', () => `<script>${SCENARIO}</script></body>`));

const run = spawnSync(chromium, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=420,900', '--virtual-time-budget=20000', '--dump-dom',
  'file://' + page,
], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

const dom = run.stdout || '';
const match = dom.match(/<title>RESULT:(.*?)<\/title>/s);
if (!match){
  console.error('сценарій не дійшов до кінця — сторінка не віддала результат');
  const err = (run.stderr || '').split('\n').filter(l => /error|Error|Uncaught/.test(l)).slice(0, 12);
  if (err.length) console.error(err.join('\n'));
  process.exit(1);
}

let log;
try { log = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
catch (e){ console.error('не розібрав результат: ' + e.message); process.exit(1); }

console.log('браузер: ' + path.basename(path.dirname(path.dirname(chromium))));
let fails = 0;
log.forEach(x => {
  if (x.ok) console.log('  ✓ ' + x.name);
  else { console.error('  ✗ ' + x.name + (x.extra ? ' — ' + x.extra : '')); fails++; }
});

/* Помилки в консолі сторінки — теж провал: у пісочниці їх не видно. */
const consoleErrors = (run.stderr || '').split('\n')
  .filter(l => /Uncaught|TypeError|ReferenceError/.test(l) && !/DBus|dbus|GPU|gpu/.test(l));
if (consoleErrors.length){
  consoleErrors.slice(0, 8).forEach(l => console.error('  ✗ консоль: ' + l.trim()));
  fails += consoleErrors.length;
}

console.log(fails ? `\n${fails} помилок у браузері` : `\nсценарій пройдено · перевірок: ${log.length}`);
process.exit(fails ? 1 : 0);
