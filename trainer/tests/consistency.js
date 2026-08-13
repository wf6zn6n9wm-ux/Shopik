/* Одні й ті самі числа живуть у кількох файлах: ціна в застосунку, ціна
   на сторінці оплати і ціна, за якою сервер виставляє рахунок у банк.
   Розійтись вони можуть мовчки — тренер побачить одне, спишеться інше.
   Тут ми звіряємо все, що дублюється між файлами.

   node trainer/tests/consistency.js                                    */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let checks = 0, fails = 0;
const part = t => console.log('\n── ' + t + ' ──');
const ok = (name, cond, extra) => {
  checks++; if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};

/* дістаємо оголошення `const|let|var X = ...` і виконуємо в пісочниці:
   у застосунку це const, на сторінці оплати — var */
function decl(src, name, extra){
  const m = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('не знайшов ' + name);
  const from = m.index;
  const open = src.indexOf(src[src.indexOf('=', from) + 2] === '[' ? '[' : '{', from);
  const close = src[open] === '[' ? ']' : '}';
  let i = open, depth = 0;
  for (; i < src.length; i++){
    if (src[i] === src[open]) depth++;
    else if (src[i] === close){ depth--; if (!depth) break; }
  }
  const ctx = Object.assign({}, extra);
  vm.createContext(ctx);
  vm.runInContext('globalThis.__v = ' + src.slice(open, i + 1) + ';', ctx);
  return ctx.__v;
}

const app = read('index.html');
const pay = read('pay.html');
const lib = read('api/_lib.js');
const trial = read('api/trial.js');

const APP_PLANS = decl(app, 'PLANS');
const PAY_PLANS = decl(pay, 'PLANS');
const LIB_PLANS = decl(lib, 'PLANS');
const WEB = decl(app, 'WEB');

part('тарифи');
{
  const byId = (list, id) => list.find(p => p.id === id);
  APP_PLANS.forEach(p => {
    const onPage = byId(PAY_PLANS, p.id);
    const onServer = LIB_PLANS[p.id];
    ok('план ' + p.id + ' є всюди', !!onPage && !!onServer);
    if (!onPage || !onServer) return;
    ok('  ціна на сайті збігається', p.web === onPage.web, p.web + ' / ' + onPage.web);
    ok('  ціна магазину збігається', p.price === onPage.store, p.price + ' / ' + onPage.store);
    ok('  сервер виставляє рахунок на ту саму суму', p.web === onServer.usd, p.web + ' / ' + onServer.usd);
    ok('  тривалість збігається', p.months === onPage.months && p.months === onServer.months,
       [p.months, onPage.months, onServer.months].join(' / '));
  });
  ok('на сайті не завелось зайвих планів', PAY_PLANS.length === APP_PLANS.length,
     PAY_PLANS.length + ' проти ' + APP_PLANS.length);
  ok('ціна на сайті нижча за магазинну', APP_PLANS.every(p => p.web < p.price));
}

part('підписка й пробний період');
{
  const devices = +(lib.match(/const DEVICES = (\d+)/) || [])[1];
  ok('ліміт пристроїв однаковий у застосунку й на сервері', WEB.devices === devices,
     WEB.devices + ' / ' + devices);

  const appTrial = +(app.match(/const TRIAL_DAYS = (\d+)/) || [])[1];
  const srvTrial = +(trial.match(/const TRIAL_DAYS = (\d+)/) || [])[1];
  ok('довжина пробного періоду однакова', appTrial === srvTrial, appTrial + ' / ' + srvTrial);

  ok('product ID не розійшлись із документацією',
     APP_PLANS.every(p => new RegExp(p.productId).test(read('native/README.md'))),
     APP_PLANS.map(p => p.productId).join(', '));
}

part('юридичні реквізити');
{
  const LEGAL = decl(app, 'LEGAL');
  ok('заглушок не лишилось', !/\[НАЗВА|\[EMAIL|\[САЙТ/.test(JSON.stringify(LEGAL)),
     LEGAL.company + ' · ' + LEGAL.email);
  ok('пошта на сторінці підтримки та сама', read('support.html').includes(LEGAL.email), LEGAL.email);
  const tgOnPage = (read('support.html').match(/var TG = '([^']*)'/) || [, ''])[1];
  ok('чат підтримки однаковий у застосунку й на сторінці',
     String(LEGAL.telegram || '').replace(/^@/, '') === tgOnPage,
     LEGAL.telegram ? '@' + tgOnPage : 'ще не заведено');
  ['terms.html', 'privacy.html', 'delete.html'].forEach(f => {
    const page = read(f);
    ok('на сторінці ' + f + ' ті самі реквізити',
       page.includes(LEGAL.company) && page.includes(LEGAL.email));
  });
}

part('переклади');
{
  const rows = decl(app, 'PHRASES');
  ok('у кожного рядка чотири мови', rows.every(r => r.length === 4 && r.every(x => typeof x === 'string' && x)),
     rows.length + ' фраз');
  const seen = new Set(), dupes = rows.map(r => r[0]).filter(k => (seen.has(k) ? true : (seen.add(k), false)));
  ok('дублів немає', !dupes.length, dupes.slice(0, 3).join(', ') || 'жодного');
}

console.log('\n══════ ' + (checks - fails) + ' з ' + checks + (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
process.exit(fails ? 1 : 0);
