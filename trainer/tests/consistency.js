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
const checkout = read('api/checkout.js');

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
    ok('  сервер виставляє рахунок на ту саму суму', p.web === onServer.uah, p.web + ' / ' + onServer.uah);
    ok('  тривалість збігається', p.months === onPage.months && p.months === onServer.months,
       [p.months, onPage.months, onServer.months].join(' / '));
  });
  ok('на сайті не завелось зайвих планів', PAY_PLANS.length === APP_PLANS.length,
     PAY_PLANS.length + ' проти ' + APP_PLANS.length);
  /* Ціни в різних валютах навмисно: магазин рахує в доларах і бере свою
     комісію, сайт — у гривнях, бо платить український ФОП і саме гривню
     вимагає бачити моніторинг банку. Порівнювати їх числом не можна, а
     сплутати — легко, і тоді в рахунок пішло б 4.49 замість 299. Тому
     перевіряємо не «дешевше», а що кожне число лишилось у своїй валюті. */
  ok('ціни магазину — в доларах', APP_PLANS.every(p => p.price < 100),
     APP_PLANS.map(p => p.price).join(', '));
  ok('ціни на сайті — у гривнях', APP_PLANS.every(p => Number.isInteger(p.web) && p.web >= 100),
     APP_PLANS.map(p => p.web).join(', '));
  ok('на сервері валюта рахунку — гривня', /currency: 'UAH'/.test(checkout),
     (checkout.match(/currency: '(\w+)'/) || [])[1] || '—');

  /* ─── публічна сторінка ───
     Її читає моніторинг банку, і саме через неї ми вже одного разу
     вилетіли: цін на сайті не було взагалі. Другий список цін розійшовся
     б із першим тихо, тому звіряємо його з застосунком, а реквізити — з
     LEGAL, звідки їх бере решта сторінок. */
  {
    const about = read('about.html');
    const plans = decl(about, 'PLANS');
    ok('тарифи на публічній сторінці є всі', plans.length === APP_PLANS.length,
       plans.length + ' проти ' + APP_PLANS.length);
    APP_PLANS.forEach(p => {
      const row = plans.find(x => x.id === p.id) || {};
      ok('  ' + p.id + ': ціна й строк збігаються з застосунком',
         row.uah === p.web && row.months === p.months,
         row.uah + ' / ' + p.web + ' · ' + row.months + ' / ' + p.months);
    });
    const legal = decl(app, 'LEGAL');
    const shown = decl(about, 'LEGAL');
    ['company', 'id', 'addr', 'phone', 'email'].forEach(k => {
      ok('  реквізит ' + k + ' збігається з застосунком', legal[k] === shown[k],
         String(shown[k] || '—'));
    });
    /* Ціни живуть ще й у відповідях підтримки — чотирма мовами. Саме
       там вони одного разу й застаріли: на сторінці одне, у рахунку
       інше. Перевіряємо, що кожна гривнева ціна названа скрізь. */
    const help = read('support.html');
    APP_PLANS.forEach(p => {
      ok('  ціну ' + p.web + ' ₴ названо в підтримці',
         (help.match(new RegExp(p.web + ' ₴', 'g')) || []).length >= 4,
         (help.match(new RegExp(p.web + ' ₴', 'g')) || []).length + ' з 4 мов');
    });
    ok('  старих доларових цін на сайті не лишилось',
       !/4\.49|11\.99|48\.99/.test(help + about + pay),
       'ціна сайту тепер у гривні');

    /* ─── ціни в умовах використання ───
       Тут вони пережили перехід на гривню: у документі лишалось
       «1 місяць — $4.49», поки каса брала 299 ₴. Розбіжність між
       опублікованими умовами й рахунком — саме те, за що банк знімає
       з моніторингу, тож звіряємо і сам документ, і сторінку. */
    const terms = read('terms.html');
    ok('  в умовах немає старих доларових цін сайту',
       !/4\.49|11\.99|48\.99/.test(app + terms), 'умови перерахували в гривню');
    APP_PLANS.forEach(p => {
      ok('  ціну ' + p.web + ' ₴ названо в опублікованих умовах',
         terms.includes(p.web + ' ₴'), 'terms.html');
    });
    /* Ціна, вписана числом просто в розмітку, тихо застаріває — так на
       екрані пробного періоду ще довго світилось $4.99. Числа мають
       приходити з PLANS, а не з коду екрана. */
    ok('  ціни в застосунку не вписані числом', !/\buah\(\s*\d|\busd\(\s*\d/.test(app),
       (app.match(/\b(?:uah|usd)\(\s*\d[\d.]*/g) || []).join(', ') || 'усі з PLANS');

    /* ─── долара тренер не бачить ніде ───
       Збірки для магазинів нічого не продають усередині: прапорець
       PRO_TRAINER_FREE прибирає покупку, і платить людина тільки на
       сайті, тільки гривнею. Доларова ціна лишається в таблиці тарифів
       на випадок, якщо колись з'явиться справжній магазин, але жодна
       сторінка, яку читає людина, назвати її не має права: у нас уже
       були умови з доларом і рахунок у гривні водночас. */
    [['сторінка оплати', pay], ['підтримка', help], ['публічна сторінка', about],
     ['умови', terms], ['політика', read('privacy.html')]].forEach(([name, text]) => {
      ok('  ' + name + ' не називає долара', !/\$\s?\d/.test(text),
         (text.match(/\$\s?\d[\d.]*/g) || []).join(', ') || 'лише гривня');
    });
    ok('  збірка для магазину нічого не продає', /PRO_TRAINER_FREE = true/.test(
       read('native/scripts/sync-web.js')), 'прапорець ставиться при збиранні');

    ok('  умови повернення на сторінці є', /повернен/i.test(about));
    ok('  строк повернення названо', /14<\/b> днів|14 днів/.test(about));
  }
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
  ['/support', '/privacy', '/terms', '/delete', '/about'].forEach(path =>
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

/* ─── збірка для магазину ───
   Веб-версія тягне React і Babel з CDN — у браузері це нормально.
   Усередині застосунку так не можна: він відкривається де завгодно, у
   залі без зв'язку теж, а з CDN першого разу не запуститься зовсім —
   порожній екран замість застосунку. Перевіряємо саму збірку, а не
   наміри: у ній не має лишитись жодного зовнішнього посилання. */
part('збірка для магазину не потребує мережі');
{
  const sync = read('native/scripts/sync-web.js');
  ok('JSX компілюється тим самим build.js, що й для сайту', /require\(.*build\.js.*\)/.test(sync));
  ok('React береться локально, а не з CDN', /vendor\/react\.js/.test(sync));
  ok('React є в залежностях складання', /"react":/.test(read('native/package.json')));
  /* Скрипт сам падає, якщо посилання лишилось. Без цієї перевірки
     помилку побачив би не складальник, а рецензент магазину. */
  ok('складання зупиняється, якщо посилання на CDN лишилось',
     /unpkg[^]*throw new Error/.test(sync));
  ok('прапорець безкоштовної збірки на місці', /PRO_TRAINER_FREE/.test(sync));

  /* Відступи від «чубчика» й смуги home застосунок рахує сам, через
     env(safe-area-inset-*). Якщо оболонці дозволити робити те саме,
     відступ стає подвійним, сторінка не дістає до низу екрана — і в
     смузі, що лишилась, видно темний фон оболонки. На світлій темі це
     чорна смуга впоперек екрана; саме так виглядала перша збірка на
     справжньому телефоні. */
  const cap = JSON.parse(read('native/capacitor.config.json'));
  ok('оболонка не додає своїх відступів', cap.ios.contentInset === 'never',
     cap.ios.contentInset);
  ok('застосунок малює під безпечними зонами', /viewport-fit=cover/.test(app));
  ok('відступи знизу пораховані в CSS', /--safe-bottom/.test(app));

  /* JSX компілює bun, а на складальних машинах його немає з коробки.
     Перша збірка iOS так і впала — «spawnSync bun ENOENT» через двадцять
     секунд після старту. Тому будь-який робочий процес, який кличе
     sync:web, зобов'язаний спершу поставити bun. */
  const flows = path.join(__dirname, '..', '..', '.github', 'workflows');
  fs.readdirSync(flows).filter(f => f.endsWith('.yml')).forEach(f => {
    const txt = fs.readFileSync(path.join(flows, f), 'utf8');
    if (!/npm run sync:web/.test(txt)) return;
    ok('  ' + f + ' ставить bun перед складанням', /bun\.sh\/install/.test(txt));
  });

  /* ─── застосунок не має відставати від сайту ───
     Сайт пересобирається сам на кожен push у main, а збірка для iPhone
     колись запускалась тільки руками — і версії розходились мовчки.
     Одного разу виправлення вже стояло на сайті, у TestFlight ще ні, і
     тренер півгодини читав стару помилку, поки ми шукали причину не там.
     Повернути ручний запуск легко й непомітно, тому перевіряємо. */
  /* ─── іконка застосунку ───
     `cap add ios` кладе власну болванку — синій хрестик, — і в TestFlight
     застосунок стояв саме з нею: своєї іконки в збірку не потрапляло
     взагалі. На домашньому екрані він виглядав чужим, а Apple такі збірки
     відхиляє окремим пунктом. Картинки лежать готовими: складальна машина
     Apple — це macOS без Chrome, намалювати їх там нічим. */
  {
    const assets = path.join(__dirname, '..', 'native', 'assets');
    const png = require('../store/png.js');
    /* Дивимось на бік у пікселях, а не на вагу файла: вага залежить від
       того, як добре стиснувся градієнт, і поріг для неї довелось би
       вигадувати. Розмір же задано магазинами: Apple вимагає рівно
       1024×1024, а заставка має бути з запасом на найбільший екран. */
    [['icon.png', 1024], ['splash.png', 2732]].forEach(([f, side]) => {
      const file = path.join(assets, f);
      const s = fs.existsSync(file) ? png.size(file) : {w: 0, h: 0};
      ok('native/assets/' + f + ' на місці й потрібного розміру',
         s.w === side && s.h === side, s.w + '×' + s.h);
    });
    ['ios.yml', 'android.yml'].forEach(f => {
      const txt = fs.readFileSync(path.join(flows, f), 'utf8');
      ok('  ' + f + ' розкладає іконку по проєкту', /capacitor-assets generate/.test(txt));
    });
    const pkg = JSON.parse(read('native/package.json'));
    ok('  і має чим це робити', !!(pkg.devDependencies || {})['@capacitor/assets'],
       Object.keys(pkg.devDependencies || {}).join(', '));
  }

  {
    const ios = fs.readFileSync(path.join(flows, 'ios.yml'), 'utf8');
    const on = ios.slice(ios.indexOf('\non:'), ios.indexOf('\njobs:'));
    ok('збірка для iPhone йде сама на зміни в main', /push:/.test(on) && /branches:\s*\[main\]/.test(on),
       (on.match(/^\s{2}\w+:/gm) || []).join(' ').trim() || '—');
    ok('  і відправляє в TestFlight, а не лишає .ipa артефактом',
       /github\.event_name == 'push'/.test(ios), 'умова кроку відправки');
  }
}

/* ─── знімки онбордингу ───
   Перші три екрани показують справжні знімки застосунку, а не малюнки:
   так попросив тренер, який відкрив сайт («хочу побачити, а не
   уявляти»). Файли лежать окремо, і розійтись із застосунком можуть
   мовчки: слайд є, картинки немає — і людина бачить порожнє місце
   рівно там, де ми обіцяли показати програму. */
part('знімки онбордингу на місці');
{
  const shots = fs.readdirSync(path.join(ROOT, 'ob')).filter(f => f.endsWith('.png')).sort();
  ok('знімків стільки ж, скільки слайдів', shots.length === 3, shots.join(', '));
  shots.forEach(f => {
    const kb = Math.round(fs.statSync(path.join(ROOT, 'ob', f)).size / 1024);
    /* Це перший екран сайту, часто з мобільного інтернету в залі.
       Півтори сотні кілобайтів на картинку — межа, за якою відкриття
       починає відчуватись. */
    ok('  ' + f + ' не заважкий', kb <= 150, kb + ' КБ');
    ok('  ' + f + ' згаданий у застосунку', app.includes(f.replace('.png', '')) || /ob-' \+ \(k \+ 1\)/.test(app));
    ok('  ' + f + ' кешується офлайн', read('sw.js').includes(f), f);
  });
  ok('нативна збірка бере теж', /DIRS = \['ob'\]/.test(read('native/scripts/sync-web.js')));
  /* Кеш названий версією: без її зміни браузер віддавав би стару
     оболонку, у якій цих файлів немає, і онбординг лишався б порожнім. */
  ok('версія кеша піднята під нові файли', /protrainer-v[3-9]/.test(read('sw.js')),
     (read('sw.js').match(/protrainer-v\d+/) || [])[0]);
}

/* ─── підтвердження права на сайт ───
   Google Search Console тримає право власності на сайт доти, доки лежить
   виданий ним файл: «не видаляйте його навіть після успішного
   підтвердження». Прибрати такий файл легко — він виглядає сміттям і
   ніде більше не згаданий. А без нього Play Console перестає вважати
   сайт нашим, і застосунок не опублікувати. */
part('файл підтвердження сайту на місці');
{
  const files = fs.readdirSync(ROOT).filter(f => /^google[0-9a-f]+\.html$/.test(f));
  ok('файл від Search Console лежить у корені', files.length > 0, files.join(', ') || 'жодного');
  files.forEach(f => {
    const text = read(f).trim();
    ok('  ' + f + ' називає сам себе', text === 'google-site-verification: ' + f, text);
  });
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

/* ─── скільки серверних функцій ───
   Vercel на безкоштовному тарифі бере не більше дванадцяти на одну
   викладку. Тринадцята не попереджає — вона просто ламає викладку, і
   дізнаєшся про це після того, як усе зелене й запушене. Так і сталось:
   зайва функція зупинила сайт на кілька годин.

   Файли з підкресленням Vercel за функції не рахує — це спільний код. */
part('серверних функцій не більше, ніж дозволено');
{
  const dir = path.join(__dirname, '..', 'api');
  const fns = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  const LIMIT = 12;
  ok('уміщаємось у ' + LIMIT, fns.length <= LIMIT,
     fns.length + ' шт.' + (fns.length > LIMIT ? ' — зайві: ' + fns.slice(LIMIT).join(', ') : ''));

  /* Щоб уміститись, /api/unsubscribe перестав бути функцією й став
     переадресацією. Адреса лишилась у застосунках, які вже стоять у
     людей на телефонах, тож зникни вона — відмова від автопродовження
     мовчки перестала б працювати саме там, де про це не дізнаєшся. */
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const rules = conf.rewrites || [];
  const used = new Set();
  ['account.html', 'index.html'].forEach(f => {
    const txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    (txt.match(/\/api\/[a-z]+/g) || []).forEach(a => used.add(a));
  });
  const missing = [...used].filter(a =>
    !fns.includes(a.slice('/api/'.length) + '.js') &&
    !rules.some(r => r.source === a));
  ok('усі адреси /api, якими користуються сторінки, куди-небудь ведуть',
     !missing.length, missing.join(', ') || [...used].length + ' адрес');
}

/* ─── опис у магазині не спорить з анкетою ───
   В анкеті Google ми заявили: копія бази з даними клієнтів іде на сервер,
   тобто дані збираються. А в описі застосунку роками стояло «ми не
   збираємо дані ваших клієнтів» — чотирма мовами. Магазин звіряє одне з
   одним сам, і розбіжність — це не зауваження, а знята сторінка.

   Речення було правдою, поки копії не існувало. Саме тому й перевіряємо:
   такі фрази переживають зміну, через яку стали неправдою, — вони ж не
   ламаються.                                                          */
part('опис у магазині не обіцяє того, чого немає');
{
  const text = fs.readFileSync(path.join(__dirname, '..', 'store', 'listing.md'), 'utf8');
  const LIES = [
    ['українською', /не збираємо дан/i],
    ['російською', /не собираем дан/i],
    ['англійською', /do not collect .{0,20}data/i],
    ['польською', /nie zbieramy dan/i],
  ];
  LIES.forEach(([lang, re]) => {
    ok('  ' + lang + ' не сказано «не збираємо дані»', !re.test(text),
       (text.match(re) || [''])[0] || 'копію заявлено чесно');
  });
  /* Ключ від копії у нас є, поки увімкнене відновлення пароля. Обіцяти
     при цьому «ніхто, крім вас, не прочитає» — не можна. */
  ok('  і немає обіцянки, що прочитати копію не можемо ми',
     !/нульов\w* знанн|zero.knowledge|ніхто, крім вас|никто, кроме вас/i.test(text),
     'сказано, що ключ є і в нас');
}

/* ─── адмінка показує все, що їй прислали ───
   Сервер рахує зведення і шле його одним об'єктом. Сторінка сама
   вирішує, що з цього намалювати, — і тут легко мовчки загубити цілий
   розділ: під час переробки вигляду зникли мови й розбивка оплат по
   днях, а сторінка лишилась зеленою, бо помилки немає — просто числа
   більше ніхто не питає.

   Тому вимагаємо зворотного: кожне поле, яке сервер порахував, має
   десь на сторінці згадуватись. Порахувати й не показати — або
   недогляд, або марна робота на сервері; і те, і те треба помітити.  */
part('адмінка не губить те, що порахував сервер');
{
  const api = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

  /* Що саме сервер віддає, читаємо з самої відповіді, а не зі списку в
     перевірці: список довелося б правити руками, і він відстав би від
     коду рівно тоді, коли з'явиться нове поле. */
  const answers = [...api.matchAll(/return L\.json\(res, 200, \{ok: true,([\s\S]*?)\}\);/g)];
  const answer = answers.length ? answers[answers.length - 1][1] : '';
  const top = [...new Set((answer.match(/[a-zA-Z][a-zA-Z0-9]*/g) || []))]
    .filter(k => !['TRIAL', 'DAYS', 'L', 'configured', 'trialDays', 'pay'].includes(k));
  const money = ((api.match(/const money = \{([\s\S]*?)\n  \};/) || [])[1] || '')
    .split('\n').map(s => (s.match(/^\s*([a-zA-Z][a-zA-Z0-9]*):/) || [])[1]).filter(Boolean);

  ok('поля зведення знайшлись у коді сервера', top.length >= 8, top.join(', '));
  const lost = top.filter(k => !new RegExp('\\b' + k + '\\b').test(page));
  ok('усі поля зведення десь показані', !lost.length, lost.join(', ') || top.length + ' полів');

  ok('поля про гроші знайшлись', money.length >= 8, money.join(', '));
  const lostMoney = money.filter(k => !new RegExp('\\b' + k + '\\b').test(page));
  ok('усі поля про гроші десь показані', !lostMoney.length,
     lostMoney.join(', ') || money.length + ' полів');

  /* Розділи. Кнопка в меню без сторінки веде в порожнечу, сторінка без
     кнопки недосяжна — обидва боки списку мають збігатись. */
  const menu = [...page.matchAll(/^\s*\['([a-z]+)',\s*'[^']+',\s*IC\./gm)].map(m => m[1]);
  const drawn = [...page.matchAll(/PAGE === '([a-z]+)'\s*\?/g)].map(m => m[1]);
  ok('меню зібралось', menu.length >= 8, menu.join(', '));
  const noPage = menu.filter(k => k !== 'dash' && !drawn.includes(k));
  ok('у кожної кнопки меню є своя сторінка', !noPage.length,
     noPage.join(', ') || menu.length + ' розділів');
}

console.log('\n══════ ' + (checks - fails) + ' з ' + checks + (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
process.exit(fails ? 1 : 0);
