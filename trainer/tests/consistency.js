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

part('домен');
{
  const LEGAL = decl(app, 'LEGAL');
  const site = String(LEGAL.site || '').replace(/\/+$/, '');
  ok('домен заданий', /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(site), site || 'порожньо');
  ok('оплата йде на той самий домен', String(WEB.base || '').replace(/\/+$/, '') === site,
     WEB.base + ' / ' + site);
  const listing = read('store/listing.md');
  ok('у текстах для магазинів не лишилось плейсхолдерів', !listing.includes('[САЙТ]'));
  ok('у текстах для магазинів той самий домен', listing.includes(site), site);
  ['/support', '/privacy', '/terms', '/delete'].forEach(path =>
    ok('  адреса ' + path + ' вказана', listing.includes(site + path)));
}

part('збірка для сайту');
{
  const vm2 = require('vm');
  const built = require('../build.js').build(app);
  ok('тег Babel прибрано', !/unpkg\.com\/@babel/.test(built));
  ok('скрипт більше не text/babel', !/text\/babel/.test(built));
  ok('React лишився на місці', /unpkg\.com\/react@18/.test(built));

  const j = built.lastIndexOf('</script>');
  const i = built.lastIndexOf('<script>', j);
  const code = built.slice(i + '<script>'.length, j);
  let parses = true;
  try { new vm2.Script(code); } catch (e){ parses = false; }
  ok('зібраний скрипт — звичайний JS', parses, Math.round(code.length / 1024) + ' КБ');
  ok('JSX скомпільовано', !/<\/[A-Z]/.test(code));
  /* рядок «</script>» усередині коду обірвав би тег і зламав сторінку */
  ok('тег усередині коду не обриває скрипт', !code.includes('</script>'));
}

part('обрізання картинок');
{
  const os = require('os');
  const png = require('../store/png.js');
  /* малюємо 6×4: кожен піксель позначено своїми координатами */
  const W = 6, H = 4, BPP = 4;
  const px = Buffer.alloc(W * H * BPP);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = (y * W + x) * BPP;
    px[i] = x * 10; px[i + 1] = y * 10; px[i + 2] = 7; px[i + 3] = 255;
  }
  const file = path.join(os.tmpdir(), 'protrainer-crop-test.png');
  fs.writeFileSync(file, png.encode(px, W, H, BPP));
  ok('картинка збирається й читається', png.size(file).w === W && png.size(file).h === H);

  ok('обрізали до 4×2', png.crop(file, 4, 2) === true && png.size(file).w === 4 && png.size(file).h === 2);
  const got = png.decode(file);
  let same = true;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++){
    const i = (y * 4 + x) * 4;
    if (got.px[i] !== x * 10 || got.px[i + 1] !== y * 10 || got.px[i + 2] !== 7) same = false;
  }
  ok('лишився саме лівий верхній кут, без зсуву рядків', same);
  ok('другий раз різати нічого', png.crop(file, 4, 2) === false);
  let refused = false;
  try { png.crop(file, 99, 2); } catch { refused = true; }
  ok('збільшити не дає', refused);
  fs.unlinkSync(file);
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
