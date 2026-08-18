/* Перевірка серверної частини без мережі й без LiqPay: функції в api/
   кличемо напряму, підпис рахуємо тим самим кодом, що й банк.

   node trainer/tests/licence.js                                        */
process.env.LIQPAY_PUBLIC_KEY = 'test_pub';
process.env.LIQPAY_PRIVATE_KEY = 'test_priv';
process.env.PUBLIC_BASE_URL = 'https://protrainer.test';

const path = require('path');
const API = p => require(path.join(__dirname, '..', 'api', p));
const L = API('_lib.js');

let checks = 0, fails = 0;
const part = t => console.log('\n── ' + t + ' ──');
const ok = (name, cond, extra) => {
  checks++; if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};

/* мінімальна заглушка res, якої вистачає функціям */
function call(fn, {query = {}, body = null, method = 'GET', headers = {}} = {}){
  return new Promise(resolve => {
    const res = {
      code: 0, headers: {},
      setHeader(k, v){ res.headers[k.toLowerCase()] = v; },
      status(c){ res.code = c; return res; },
      send(text){
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({code: res.code, headers: res.headers, text: String(text), json});
      },
    };
    Promise.resolve(fn({query, body, method, headers: {host: 'protrainer.test', ...headers}}, res))
      .catch(e => resolve({code: 500, text: String(e), json: null}));
  });
}

/* те, що робить LiqPay, коли повідомляє про оплату */
const bank = payload => {
  const data = L.pack(payload);
  return {data, signature: L.sign(data)};
};

const LOGIN = 'Trainer@Mail.com';
const DEV_A = 'dev_a', DEV_B = 'dev_b', DEV_C = 'dev_c', DEV_D = 'dev_d';
let order = '';

(async () => {

part('підпис');
{
  const {data, signature} = bank({hello: 'world'});
  ok('свій підпис приймаємо', L.verify(data, signature));
  ok('чужий підпис відхиляємо', !L.verify(data, signature.slice(0, -2) + 'xx'));
  ok('підпис іншої довжини не ламає перевірку', !L.verify(data, 'коротко'));
  ok('логін нормалізується як у застосунку',
     L.normLogin(' Trainer@Mail.com ') === 'trainer@mail.com' && L.normLogin('0631234567') === '380631234567',
     L.normLogin('0631234567'));
}

part('оплата');
{
  const r = await call(API('checkout.js'), {query: {plan: 'yearly', login: LOGIN, device: DEV_A, lang: 'uk'}});
  ok('сторінка оплати віддається', r.code === 200 && r.text.includes('liqpay.ua/api/3/checkout'));
  const data = (r.text.match(/name="data" value="([^"]+)"/) || [])[1];
  const sig = (r.text.match(/name="signature" value="([^"]+)"/) || [])[1];
  ok('підпис на сторінці справжній', L.verify(data, sig));
  const p = L.unpack(data);
  order = p.order_id;
  ok('річний план — регулярне списання', p.action === 'subscribe' && p.subscribe_periodicity === 'year', p.action + '/' + p.subscribe_periodicity);
  /* Рахунок банку — у гривнях: платить український ФОП, і моніторинг
     банку вимагає, щоб ціна на сайті збігалась із сумою в рахунку.
     Долар лишився тільки там, де рахує магазин застосунків. */
  ok('рахунок у гривні, за ціною сайту', p.amount === 1990 && p.currency === 'UAH',
     p.amount + ' ' + p.currency);
  ok('приватний ключ у браузер не потрапляє', !r.text.includes('test_priv'));
  ok('логін і пристрій їдуть у info', JSON.parse(p.info).login === 'trainer@mail.com' && JSON.parse(p.info).device === DEV_A);

  const q = await call(API('checkout.js'), {query: {plan: 'quarterly', login: LOGIN, device: DEV_A}});
  const qp = L.unpack((q.text.match(/name="data" value="([^"]+)"/) || [])[1]);
  ok('три місяці — разова оплата, бо LiqPay не вміє такий період', qp.action === 'pay' && !qp.subscribe, qp.action);

  const bad = await call(API('checkout.js'), {query: {plan: 'wat', login: LOGIN}});
  ok('невідомий план не приймається', bad.code === 400, String(bad.code));
  const nolog = await call(API('checkout.js'), {query: {plan: 'yearly'}});
  ok('без логіна оплату не створюємо', nolog.code === 400, String(nolog.code));
}

part('відповідь банку');
{
  const forged = await call(API('callback.js'), {method: 'POST', body: {data: L.pack({status: 'success'}), signature: 'підроблено'}});
  ok('підроблений callback відхиляється', forged.code === 403, String(forged.code));

  const before = await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}});
  ok('до оплати доступу немає', before.json.active === false);

  const info = JSON.stringify({login: LOGIN, device: DEV_A, plan: 'yearly'});
  const paid = await call(API('callback.js'), {method: 'POST', body: bank({status: 'success', order_id: order, info})});
  ok('оплата зарахована', paid.code === 200 && paid.json.ok);

  const lic = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('підписка активна', lic.active === true);
  ok('строк — рік із запасом', lic.expiresAt > Date.now() + 360 * 86400000, new Date(lic.expiresAt).toISOString().slice(0, 10));
  ok('пристрій прив’язано автоматично', lic.devices === 1 && lic.autoRenew === true);
  ok('логін у відповіді не світиться', !('login' in lic));

  /* друге списання через рік не має обнуляти залишок */
  const was = lic.expiresAt;
  await call(API('callback.js'), {method: 'POST', body: bank({status: 'success', order_id: order, info})});
  const next = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('продовження додається до строку, а не обнуляє його',
     next.expiresAt > was + 360 * 86400000, new Date(next.expiresAt).toISOString().slice(0, 10));
}

part('пристрої');
{
  const other = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_B}})).json;
  ok('чужий пристрій доступу не отримує', other.active === false && other.needsClaim === true);

  const claimed = (await call(API('claim.js'), {query: {login: LOGIN, device: DEV_B}})).json;
  ok('«Відновити покупку» прив’язує пристрій', claimed.active === true && claimed.devices === 2);

  await call(API('claim.js'), {query: {login: LOGIN, device: DEV_C}});
  const over = (await call(API('claim.js'), {query: {login: LOGIN, device: DEV_D}})).json;
  ok('більше трьох пристроїв не пускаємо', over.active === false && over.error === 'device_limit', over.error);
  ok('знання чужої пошти саме по собі доступу не дає',
     (await call(API('licence.js'), {query: {login: LOGIN, device: 'dev_чужий'}})).json.active === false);
}

part('скасування й повернення');
{
  /* Вимкнення живе в licence.js під прапорцем off — окрема функція
     з'їдала слот, а їх рівно дванадцять. Старий адрес /api/unsubscribe
     переписує vercel.json, тому застосунки в людей на телефонах цього
     переїзду не помітили. */
  const off = q => call(API('licence.js'), {query: {...q, off: '1'}});
  const offed = (await off({login: LOGIN, device: DEV_A})).json;
  ok('автопродовження вимикається', offed.autoRenew === false);
  ok('доступ лишається до кінця періоду', offed.active === true, new Date(offed.expiresAt).toISOString().slice(0, 10));

  const stranger = await off({login: LOGIN, device: 'dev_чужий'});
  ok('чужий пристрій не може вимкнути підписку', stranger.code === 403, String(stranger.code));

  /* Без прапорця та сама адреса лишається звичайним «чи є підписка» —
     інакше перевірка стану мовчки скасовувала б автопродовження. */
  const plain = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('без off це просто перегляд стану', plain.active === true && plain.autoRenew === false);

  const info = JSON.stringify({login: LOGIN, device: DEV_A, plan: 'yearly'});
  await call(API('callback.js'), {method: 'POST', body: bank({status: 'reversed', order_id: order, info})});
  const back = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('після повернення коштів доступ забирається одразу', back.active === false);

  await call(API('callback.js'), {method: 'POST', body: bank({status: 'failure', order_id: order, info})});
  ok('невдала оплата нічого не ламає',
     (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json.ok === true);
}

part('пробний період');
{
  const NEW = 'newbie@mail.com';
  const first = (await call(API('trial.js'), {query: {login: NEW, device: 'dev_1'}})).json;
  ok('доти пробний не починався', first.started === false);

  const started = (await call(API('trial.js'), {query: {login: NEW, device: 'dev_1', start: '1'}})).json;
  ok('пробний період починається', started.started === true && started.days === 14);
  ok('кінець рахується від старту', started.endsAt === started.startedAt + 14 * 86400000);
  ok('щойно почався — не прострочений', started.expired === false);

  /* саме те, заради чого все це: перевстановлення застосунку */
  const again = (await call(API('trial.js'), {query: {login: NEW, device: 'dev_ІНШИЙ', start: '1'}})).json;
  ok('перевстановлення не дає нових 14 днів', again.startedAt === started.startedAt,
     new Date(again.startedAt).toISOString().slice(0, 16));

  /* той самий логін іншим написанням — це той самий тренер */
  const same = (await call(API('trial.js'), {query: {login: '  NewBie@Mail.com ', start: '1'}})).json;
  ok('логін нормалізується — регістр і пробіли не обманюють', same.startedAt === started.startedAt);

  const peek = (await call(API('trial.js'), {query: {login: 'nobody@mail.com'}})).json;
  ok('без start пробний не починається сам', peek.started === false);

  /* без цього списку розсилці нікого буде згадати в потрібний день */
  const bucket = await L.store.get(API('trial.js').dueKey(started.endsAt));
  ok('логін потрапив у список того дня, коли пробний завершиться',
     (bucket || []).includes(L.normLogin(NEW)), (bucket || []).join(', '));

  const nolog = await call(API('trial.js'), {query: {start: '1'}});
  ok('без логіна нічого не пишемо', nolog.code === 400, String(nolog.code));
}

part('листи про кінець пробного');
{
  const MAIL = API('mail.js');
  const TRIAL = API('trial.js');
  process.env.CRON_SECRET = 'cron_test';
  const cron = {authorization: 'Bearer cron_test'};

  /* сторонніх до розсилки не пускаємо */
  const stranger = await call(MAIL, {query: {}});
  ok('без секрету розсилку не запустити', stranger.code === 401, String(stranger.code));

  /* пошту нікуди не шлемо — підміняємо відправку */
  const outbox = [];
  const real = MAIL.deliver;
  MAIL.deliver = async m => { outbox.push(m); return {ok: true}; };

  const DAY = 86400000;
  const NOW = Date.parse('2026-09-01T09:00:00Z');
  const soonMan = 'soon@mail.com', endMan = 'end@mail.com', paidMan = 'paid@mail.com', phoneMan = '0631112233';

  /* пробний, що закінчиться через три дні, і три, що закінчились сьогодні */
  await L.store.set(TRIAL.dueKey(NOW + MAIL.SOON_DAYS * DAY), [soonMan]);
  await L.store.set(TRIAL.dueKey(NOW), [endMan, paidMan, phoneMan]);
  await L.store.set(TRIAL.keyOf(soonMan), {login: soonMan, startedAt: 0, lang: 'ru'});
  await L.store.set(TRIAL.keyOf(endMan), {login: endMan, startedAt: 0, lang: 'uk'});
  await L.applyPayment({login: paidMan, device: 'd1', plan: 'yearly', orderId: 'o1'});

  const run = await call(MAIL, {query: {now: String(NOW)}, headers: cron});
  ok('розсилка відпрацювала', run.code === 200 && run.json.ok, String(run.code));
  ok('попередження за три дні пішло', run.json.soon.sent === 1, JSON.stringify(run.json.soon));
  ok('лист у день завершення пішов', run.json.end.sent === 1, JSON.stringify(run.json.end));
  ok('тому, хто вже оплатив, не пишемо', run.json.end.paid === 1);
  ok('на телефон писати нікуди', run.json.end.no_email === 1);
  ok('листів рівно два', outbox.length === 2, outbox.length + ' шт.');

  const soonLetter = outbox.find(m => m.to === soonMan);
  const endLetter = outbox.find(m => m.to === endMan);
  ok('мова листа — та, якою користуються', /Пробный период/.test(soonLetter.subject), soonLetter.subject);
  ok('у листі є посилання на оплату з логіном',
     soonLetter.text.includes('/pay?login=' + encodeURIComponent(soonMan)), soonLetter.url);
  ok('лист у день завершення говорить, що дані на місці', /збережен/.test(endLetter.text));

  /* другий запуск того ж дня не повинен слати вдруге */
  const again = await call(MAIL, {query: {now: String(NOW)}, headers: cron});
  ok('двічі одне й те саме не шлемо', again.json.end.already === 1 && again.json.soon.already === 1,
     JSON.stringify(again.json.end));
  ok('нових листів не з’явилось', outbox.length === 2, outbox.length + ' шт.');

  /* кнопка «тестове письмо»: той самий код, але без списків і позначок */
  MAIL.deliver = async m => { outbox.push(m); return {ok: true}; };
  const noAuth = await call(MAIL, {query: {test: 'me@mail.com'}});
  ok('тестове письмо теж під секретом', noAuth.code === 401, String(noAuth.code));

  const probe = await call(MAIL, {query: {test: 'Me@Mail.com', kind: 'soon'}, headers: cron});
  ok('тестове письмо йде', probe.code === 200 && probe.json.test === true, String(probe.code));
  ok('пішло саме за вказаною адресою', outbox[outbox.length - 1].to === 'Me@Mail.com');
  ok('проба не лишає слідів у позначках',
     !(await L.store.get('sent:soon:me@mail.com')));

  outbox.length = 2;

  /* усі чотири мови мають повний набір рядків */
  const keys = Object.keys(MAIL.TEXT.uk);
  ok('усі мови перекладені повністю',
     ['ru', 'en', 'pl'].every(l => keys.every(k => MAIL.TEXT[l][k] && MAIL.TEXT[l][k].length)),
     Object.keys(MAIL.TEXT).join(', '));

  /* без ключа сервісу нічого не шлеться, але й не падає */
  MAIL.deliver = real;
  const noKey = await MAIL.one('end', 'nobody@mail.com', NOW);
  ok('без ключа поштового сервісу лист не йде', noKey === 'no_key', String(noKey));

  delete process.env.CRON_SECRET;
}

part('відновлення пароля');
{
  const RESET = API('reset.js');
  const MAIL = API('mail.js');
  const box = [];
  const real = MAIL.deliver;
  MAIL.deliver = async m => { box.push(m); return {ok: true}; };
  const MAN = 'lost@mail.com';

  const byPhone = await call(RESET, {query: {login: '0631112233'}});
  ok('на телефон код не шлемо', byPhone.code === 400 && byPhone.json.error === 'not_email', String(byPhone.code));

  /* Незнайомій адресі листа не шлемо: інакше сторінка стала б розсилкою
     з нашого домену на будь-яку пошту. Відповідь при цьому та сама —
     інакше вона стала б довідником «є такий тренер чи немає». */
  const stranger = await call(RESET, {query: {login: 'nikogo-tut-net@mail.com'}});
  ok('незнайомій адресі листа не шлемо', box.length === 0, box.length + ' шт.');
  ok('а відповідь та сама', stranger.code === 200 && stranger.json.sent === true, JSON.stringify(stranger.json));

  /* далі — той, кого ми справді знаємо */
  await L.store.set(require('../api/trial.js').keyOf(MAN), {startedAt: Date.now()});
  const sent = await call(RESET, {query: {login: MAN, lang: 'ru'}});
  ok('код надіслано', sent.code === 200 && sent.json.sent === true, JSON.stringify(sent.json));
  ok('лист пішов саме на цю адресу', box.length === 1 && box[0].to === MAN);
  ok('мова листа врахована', /Код для входа/.test(box[0].subject), box[0].subject);

  const code = (await L.store.get(RESET.keyOf(MAN))).code;
  ok('код — шість цифр', /^\d{6}$/.test(code), code);
  ok('код є в листі', box[0].text.includes(code));

  const again = await call(RESET, {query: {login: MAN}});
  ok('другий код одразу не даємо', again.code === 429 && again.json.error === 'too_soon', String(again.code));

  const wrong = await call(RESET, {query: {login: MAN, code: '000000'}});
  ok('чужий код не підходить', wrong.json.verified === false && wrong.json.error === 'wrong');

  const good = await call(RESET, {query: {login: MAN, code}});
  ok('свій код підходить', good.json.verified === true);
  const twice = await call(RESET, {query: {login: MAN, code}});
  ok('той самий код удруге не працює', twice.json.verified === false, JSON.stringify(twice.json));

  /* спроби рахуються: інакше шість цифр підбираються за вечір */
  await L.store.set(RESET.keyOf(MAN), {code: '111111', exp: Date.now() + 60000, sentAt: 0, tries: RESET.TRIES});
  const many = await call(RESET, {query: {login: MAN, code: '111111'}});
  ok('після п’яти спроб код закривається', many.json.error === 'too_many', JSON.stringify(many.json));

  await L.store.set(RESET.keyOf(MAN), {code: '222222', exp: Date.now() - 1, sentAt: 0, tries: 0});
  const old = await call(RESET, {query: {login: MAN, code: '222222'}});
  ok('прострочений код не працює', old.json.error === 'expired');

  /* без поштового ключа не вдаємо, що лист пішов */
  MAIL.deliver = real;
  await L.store.set(RESET.keyOf(MAN), null);
  const nokey = await call(RESET, {query: {login: MAN}});
  ok('без пошти чесно кажемо про збій', nokey.code === 503, String(nokey.code));
}

part('адмінка');
{
  const ADMIN = API('admin.js');
  const TRIAL = API('trial.js');
  const DB = API('db.js');

  delete process.env.ADMIN_PASS;
  const noPass = await call(ADMIN, {});
  ok('без заданого пароля адмінка не працює', noPass.code === 503, String(noPass.code));

  process.env.ADMIN_PASS = 'dovgyi-parol-adminky';
  const head = ip => ({headers: {authorization: 'Bearer dovgyi-parol-adminky', 'x-forwarded-for': ip}});

  const wrong = await call(ADMIN, {headers: {authorization: 'Bearer ne-toy', 'x-forwarded-for': '1.1.1.1'}});
  ok('чужий пароль не пускає', wrong.code === 401, String(wrong.code));

  /* Пароль на відкритій адресі підбирається, тому спроби рахуються.
     Після ліміту відмовляємо навіть правильному — інакше лічильник
     обходився б однією вдалою спробою в кінці перебору. */
  for (let i = 0; i < ADMIN.TRIES; i++)
    await call(ADMIN, {headers: {authorization: 'Bearer ne-toy', 'x-forwarded-for': '2.2.2.2'}});
  const locked = await call(ADMIN, head('2.2.2.2'));
  ok('після десяти спроб адресу замикає', locked.code === 429, String(locked.code));
  ok('інші адреси це не зачіпає', (await call(ADMIN, head('3.3.3.3'))).code === 200);

  const day = 86400000;
  await L.store.set(TRIAL.keyOf('a@mail.com'), {startedAt: Date.now() - 2 * day, lang: 'uk'});
  await L.store.set(DB.keyOf('a@mail.com'), {token: 't', savedAt: Date.now(), size: 2048});
  await L.store.set(TRIAL.keyOf('b@mail.com'), {startedAt: Date.now() - 60 * day, lang: 'pl'});

  const d = (await call(ADMIN, head('3.3.3.3'))).json;
  const by = login => d.people.find(p => p.login === login) || {};
  ok('свіжий кабінет — на пробному', by('a@mail.com').trial === true && by('a@mail.com').works === true);
  ok('давній без копії — ні', by('b@mail.com').trial === false && by('b@mail.com').works === false);
  ok('графік — рівно на тридцять днів', d.series.length === 30, String(d.series.length));
  ok('сьогоднішній день у графіку останній',
     d.series[29].day === new Date().toISOString().slice(0, 10), d.series[29].day);
  ok('мови рахуються', d.langs.uk >= 1 && d.langs.pl >= 1, JSON.stringify(d.langs));
  /* У лійці «купив» рахуємо лише серед тих, чий пробний скінчився:
     інакше кожен новий тренер знижував би відсоток, нічого не зробивши. */
  ok('лійка рахує тільки тих, хто дійшов до кінця пробного',
     d.funnel.finished === d.people.filter(p => !p.trial).length, String(d.funnel.finished));

  /* Журнал оплат — наш облік грошей, а не спостереження за тренером.
     Рахуємо приріст, а не суму: у журналі вже лежать оплати з перевірок
     вище, і жорстке число тут ламалось би від кожної нової. */
  const was = d.money.uahAll;
  await L.logPayment({login: 'a@mail.com', plan: 'yearly', orderId: 'o1', kind: 'pay'});
  const paid = (await call(ADMIN, head('3.3.3.3'))).json.money;
  ok('оплата додає суму тарифу', +(paid.uahAll - was).toFixed(2) === 1990, String(paid.uahAll - was));
  await L.logPayment({login: 'a@mail.com', plan: 'yearly', orderId: 'o1', kind: 'back'});
  const m = (await call(ADMIN, head('3.3.3.3'))).json.money;
  ok('повернення забирає її назад', +(m.uahAll - was).toFixed(2) === 0, String(m.uahAll - was));
  ok('у журналі обидва рядки', m.last[0].kind === 'back' && m.last[1].kind === 'pay',
     m.last.slice(0, 2).map(x => x.kind).join('/'));

  /* ─── розбивка продажів ───
     Ліцензія зберігає лише поточний стан, тож «скільки прийшло за
     серпень» по ній не порахувати. Рахуємо з журналу — і перевіряємо
     саме те, заради чого він з'явився. */
  {
    await L.store.set(L.PAY_LOG, []);
    const day = 86400000;
    const rows = [
      {ts: Date.parse('2026-08-03T10:00:00Z'), login: 'a@mail.com', plan: 'monthly',   uah: 299,   kind: 'pay'},
      {ts: Date.parse('2026-08-03T18:00:00Z'), login: 'b@mail.com', plan: 'yearly',    uah: 1990,  kind: 'pay'},
      {ts: Date.parse('2026-08-11T09:00:00Z'), login: 'a@mail.com', plan: 'monthly',   uah: 299,   kind: 'pay'},
      {ts: Date.parse('2026-09-02T09:00:00Z'), login: 'c@mail.com', plan: 'quarterly', uah: 749,   kind: 'pay'},
      {ts: Date.parse('2026-09-04T09:00:00Z'), login: 'b@mail.com', plan: 'yearly',    uah: -1990, kind: 'back'},
    ];
    await L.store.set(L.PAY_LOG, rows);
    const m = (await call(ADMIN, head('4.4.4.4'))).json.money;

    ok('оплат рахуємо без повернень', m.pays === 4, String(m.pays));
    ok('платників — за людьми, а не за платежами', m.payers === 3, String(m.payers));
    ok('повернення окремо', m.backs === 1 && m.backUah === -1990, m.backs + ' / ' + m.backUah);

    const aug = m.byMonth.find(x => x.month === '2026-08');
    const sep = m.byMonth.find(x => x.month === '2026-09');
    ok('серпень: три оплати, двоє платників', aug.pays === 3 && aug.payers === 2,
       aug.pays + ' / ' + aug.payers);
    ok('серпень: виручка зійшлась', aug.uah === 2588, String(aug.uah));
    /* За вересень прийшло 11.99, а повернули 48.99 — місяць у мінусі, і
       так і має бути видно. Сховати повернення означало б показати
       кращу картину, ніж є. */
    ok('вересень: повернення тягне місяць у мінус', sep.uah === -1241, String(sep.uah));
    ok('новіші місяці зверху', m.byMonth[0].month === '2026-09', m.byMonth[0].month);

    const d3 = m.byDay.find(x => x.day === '2026-08-03');
    ok('день видно окремо', d3 && d3.pays === 2 && d3.uah === 2289,
       d3 ? d3.pays + ' / ' + d3.uah : '—');
    ok('порожніх днів не показуємо', m.byDay.length === 4, String(m.byDay.length));

    const yearly = m.byPlan.find(x => x.plan === 'yearly');
    const monthly = m.byPlan.find(x => x.plan === 'monthly');
    ok('по тарифах: місячний куплено двічі', monthly.pays === 2 && monthly.uah === 598,
       monthly.pays + ' / ' + monthly.uah);
    ok('повернення не зменшує лічильник покупок тарифу', yearly.pays === 1, String(yearly.pays));
    ok('видно, з якого дня рахуємо', m.since === '2026-08-03', m.since);
    ok('середній чек — по оплатах', m.avg === +(m.byPlan.reduce((s, x) => s + x.uah, 0) / 4).toFixed(2),
       String(m.avg));
  }

  /* Нуль у продажах читається двояко: чи ніхто не купує, чи кнопка
     оплати ще не підключена. Адмінка має сказати, що саме, — інакше
     висновок робиться навмання. */
  const cfg = (await call(ADMIN, head('5.5.5.5'))).json;
  ok('адмінка каже, чи можна взагалі заплатити', cfg.pay === L.configured(), String(cfg.pay));

  delete process.env.ADMIN_PASS;
}

part('переписка з підтримкою');
{
  const CHAT = API('chat.js');
  const ADMIN = API('admin.js');
  const TRIAL = API('trial.js');
  const DB = API('db.js');

  const HELP = 'pomich@mail.com', PHONE = 'dev_telefon', OTHER = 'dev_chuzhyi';

  /* Telegram підміняємо: перевіряємо, що саме йому пішло б, і при цьому
     тест лишається без мережі. */
  const real = globalThis.fetch;
  const out = [];
  globalThis.fetch = async (url, opt) => {
    out.push({url: String(url), body: JSON.parse((opt && opt.body) || '{}')});
    return {ok: true, json: async () => ({ok: true})};
  };
  process.env.TELEGRAM_TOKEN = 'bot_test';
  process.env.TELEGRAM_CHAT = '777';
  process.env.TELEGRAM_SECRET = 'sekret';

  const post = (q, headers) => call(CHAT, {method: 'POST', query: q, headers: headers || {}});
  const get = q => call(CHAT, {method: 'GET', query: q});

  /* Перший лист заводить нитку: інакше тренер, який ще нічого не платив,
     не зміг би поскаржитись саме тоді, коли це найпотрібніше. */
  const first = await post({login: HELP, device: PHONE, text: 'Не рахує відсоток залу', lang: 'uk'});
  ok('перший лист заводить нитку', first.code === 200 && first.json.ok, String(first.code));
  ok('своє повідомлення тренер бачить', (await get({login: HELP, device: PHONE})).json.msgs.length === 1);

  /* Нитка приватна: у ній те, що людина написала про свою роботу. */
  const alien = await get({login: HELP, device: OTHER});
  ok('чужий пристрій нитку не читає', alien.code === 403, String(alien.code));

  /* Другий шлях усередину — той самий token, яким відкривається копія
     бази. Він потрібен на новому телефоні, де пристрій ще незнайомий. */
  await L.store.set(DB.keyOf(HELP), {token: 'tk_help', savedAt: Date.now(), size: 10});
  ok('token від копії пускає з будь-якого пристрою',
     (await get({login: HELP, device: OTHER, token: 'tk_help'})).json.msgs.length === 1);
  ok('несправжній token не пускає',
     (await get({login: HELP, device: OTHER, token: 'tk_ne_toy'})).code === 403);

  /* Пристрій, з якого почався пробний період, ми вже знаємо — питати в
     нього token нема сенсу. */
  await L.store.set(TRIAL.keyOf(HELP), {startedAt: Date.now(), device: 'dev_pershyi', lang: 'uk'});
  ok('пристрій із пробного періоду теж свій',
     (await get({login: HELP, device: 'dev_pershyi'})).json.ok === true);

  ok('у Telegram пішло сповіщення', out.length === 1 && /api\.telegram\.org/.test(out[0].url));
  ok('логін стоїть першим рядком — по ньому й відповідаємо',
     out[0].body.text.split('\n')[0] === HELP, out[0].body.text.split('\n')[0]);

  /* ─── відповідь ─── */
  const head = ip => ({headers: {authorization: 'Bearer dovgyi-parol-adminky', 'x-forwarded-for': ip}});
  process.env.ADMIN_PASS = 'dovgyi-parol-adminky';

  const answered = await call(ADMIN, {method: 'POST', query: {reply: HELP, text: 'Перевірте відсоток у налаштуваннях'},
                                      ...head('9.9.9.1')});
  ok('відповідь з адмінки лягає в нитку', answered.code === 200 && answered.json.ok, String(answered.code));
  const seen1 = (await get({login: HELP, device: PHONE})).json;
  ok('тренер бачить відповідь непрочитаною', seen1.msgs.length === 2 && seen1.unread === 1, String(seen1.unread));

  await post({login: HELP, device: PHONE, seen: '1'});
  ok('після перегляду позначка гасне', (await get({login: HELP, device: PHONE})).json.unread === 0);


  /* Відповідати з Telegram — головний шлях: сповіщення вже прийшло, і
     відповідь на нього не вимагає ні адмінки, ні набирання адресата. */
  const upd = {message: {text: 'Вже полагодили, оновіть сторінку',
                         reply_to_message: {text: HELP + '\n\nНе рахує відсоток залу'}}};
  const hook = await call(CHAT, {method: 'POST', body: upd,
                                 headers: {'x-telegram-bot-api-secret-token': 'sekret'}});
  ok('відповідь із Telegram доходить', hook.code === 200 && hook.json.sent === true, JSON.stringify(hook.json));
  ok('вона видно тренеру', (await get({login: HELP, device: PHONE})).json.msgs.pop().text === 'Вже полагодили, оновіть сторінку');

  /* Адреса вебхука рано чи пізно стане відома. Єдине, що відрізняє
     Telegram від будь-кого іншого, — секрет у заголовку. */
  const forged = await call(CHAT, {method: 'POST', body: upd,
                                   headers: {'x-telegram-bot-api-secret-token': 'ne-toy'}});
  ok('чужий секрет не дає писати від нашого імені', forged.code === 403, String(forged.code));

  /* Список ниток — те, з чого починається робота в адмінці. */
  const list = (await call(ADMIN, {query: {chat: '1'}, ...head('9.9.9.2')})).json;
  ok('нитка є в списку', list.threads.some(t => t.login === HELP));
  const thread = (await call(ADMIN, {query: {chat: HELP}, ...head('9.9.9.2')})).json;
  ok('нитка відкривається цілком', thread.msgs.length === 3, String(thread.msgs.length));

  /* Позначка рахувалась за часом, і ця перевірка падала раз на десяток
     прогонів. Причина виявилась справжньою: відповідь, написана в ту
     саму мілісекунду, що й питання, лічильником не рахувалась зовсім.
     Пишемо обидва рядки поспіль, без жодної паузи, — так само, як це
     робить швидка відповідь із Telegram. */
  await post({login: HELP, device: PHONE, text: 'а ще одне питання'});
  await call(ADMIN, {method: 'POST', query: {reply: HELP, text: 'відповідаю миттєво'}, ...head('9.9.9.3')});
  ok('миттєва відповідь теж рахується непрочитаною',
     (await get({login: HELP, device: PHONE})).json.unread === 1,
     String((await get({login: HELP, device: PHONE})).json.unread));
  await post({login: HELP, device: PHONE, seen: '1'});

  /* ─── межі ─── */
  const long = 'я'.repeat(CHAT.MAX_LEN + 500);
  await post({login: HELP, device: PHONE, text: long});
  const tail = (await get({login: HELP, device: PHONE})).json.msgs.pop();
  ok('надто довге обрізаємо, а не ламаємось', tail.text.length === CHAT.MAX_LEN, String(tail.text.length));

  /* Сховище читається ниткою цілком, тож нескінченний потік листів — це
     не грубість, а спосіб його покласти. */
  let last = null;
  for (let i = 0; i < CHAT.RATE + 2; i++) last = await post({login: HELP, device: PHONE, text: 'ще ' + i});
  ok('потік листів зупиняється', last.code === 429 && last.json.error === 'too_fast', String(last.code));

  delete process.env.ADMIN_PASS;
  delete process.env.TELEGRAM_TOKEN;
  delete process.env.TELEGRAM_CHAT;
  delete process.env.TELEGRAM_SECRET;
  globalThis.fetch = real;
}

part('видача підписки вручну');
{
  const GRANT = API('grant.js');
  process.env.CRON_SECRET = 'cron_test';
  const cron = {authorization: 'Bearer cron_test'};
  const REV = 'reviewer@apple.com', DEV = 'dev_review';

  const stranger = await call(GRANT, {query: {login: REV}});
  ok('без секрету не видаємо', stranger.code === 401, String(stranger.code));

  const given = await call(GRANT, {query: {login: REV, months: '2'}, headers: cron});
  ok('підписка видана', given.code === 200 && given.json.ok, JSON.stringify(given.json));
  ok('строк порахований', given.json.until > new Date().toISOString().slice(0, 10), given.json.until);

  /* Найважливіше: так її побачить ревізор магазину. Пристрій ще не
     прив'язаний, і без цього кроку доступ не відкрився б. */
  const seen = (await call(API('licence.js'), {query: {login: REV, device: DEV}})).json;
  ok('спершу підписка є, але пристрій чужий', seen.active === false && seen.needsClaim === true,
     JSON.stringify(seen));
  const claimed = (await call(API('claim.js'), {query: {login: REV, device: DEV}})).json;
  ok('після прив’язки доступ відкривається', claimed.active === true, JSON.stringify(claimed));

  /* видача не з'їдає залишок: другий раз додає, а не переписує */
  const again = await call(GRANT, {query: {login: REV, months: '1'}, headers: cron});
  ok('друга видача продовжує, а не скорочує', again.json.until > given.json.until,
     given.json.until + ' → ' + again.json.until);

  const back = await call(GRANT, {query: {login: REV, revoke: '1'}, headers: cron});
  ok('підписку можна забрати', back.json.revoked === true);
  const after = (await call(API('licence.js'), {query: {login: REV, device: DEV}})).json;
  ok('після цього доступу немає', after.active === false);

  delete process.env.CRON_SECRET;
}

part('перевірка налаштувань');
{
  const before = await call(API('health.js'));
  ok('здоров’я віддається без секретів', before.code === 200 && before.json.ok,
     JSON.stringify(before.json));
  ok('без поштового ключа так і сказано', before.json.mail === false);

  process.env.RESEND_API_KEY = 'test_key';
  const after = await call(API('health.js'));
  ok('з ключем — теж', after.json.mail === true);
  delete process.env.RESEND_API_KEY;

  const text = JSON.stringify(before.json) + JSON.stringify(after.json);
  ok('самих ключів у відповіді немає',
     !text.includes('test_key') && !text.includes(process.env.LIQPAY_PRIVATE_KEY));
}

part('без ключів');
{
  const keep = process.env.LIQPAY_PRIVATE_KEY;
  process.env.LIQPAY_PRIVATE_KEY = '';
  delete require.cache[require.resolve(path.join(__dirname, '..', 'api', '_lib.js'))];
  delete require.cache[require.resolve(path.join(__dirname, '..', 'api', 'checkout.js'))];
  const r = await call(API('checkout.js'), {query: {plan: 'yearly', login: LOGIN}});
  ok('без ключів мерчанта чесно кажемо, що не налаштовано', r.code === 503 && r.json.error === 'not_configured');
  process.env.LIQPAY_PRIVATE_KEY = keep;
}

/* ─── розвідник браузера перед POST ───
   Нативна оболонка живе на іншому origin, і перед кожним POST із JSON
   браузер питає окремим запитом OPTIONS: чи можна. Відповіді не було —
   і з застосунку мовчки не працювало все, що пише: копія бази, зміна
   пароля після відновлення, лист у підтримку. Виглядало як «немає
   зв'язку», тому шукали не там. Читання при цьому працювало завжди:
   простому GET розвідник не потрібен. */
part('застосунок з іншого origin може писати');
for (const f of ['db.js', 'chat.js']){
  const r = await call(API(f), {method: 'OPTIONS', query: {}});
  ok(f + ' відповідає на розвідника', r.code === 204, 'код ' + r.code);
  ok('  дозволяє POST', /POST/.test(r.headers['access-control-allow-methods'] || ''),
     r.headers['access-control-allow-methods'] || 'заголовка немає');
  ok('  дозволяє content-type', /content-type/i.test(r.headers['access-control-allow-headers'] || ''),
     r.headers['access-control-allow-headers'] || 'заголовка немає');
  ok('  і будь-який origin', r.headers['access-control-allow-origin'] === '*',
     r.headers['access-control-allow-origin'] || 'заголовка немає');
}

/* ─── пауза оплати ───
   Мерчант не активований, і заплатити тренер фізично не може. Вимкнути
   йому за це роботу — означає забрати доступ до власної бази клієнтів
   за нашу проблему. Тому поки пауза стоїть, строк не закінчується; а
   коли її знімають — людина не має прокинутись відрізаною. */
part('поки оплата не приймається');
{
  const keep = process.env.PAY_LIVE;
  const fresh = () => {
    delete require.cache[require.resolve(path.join(__dirname, '..', 'api', '_lib.js'))];
    return require(path.join(__dirname, '..', 'api', '_lib.js'));
  };

  delete process.env.PAY_LIVE;
  let lib = fresh();
  let p = await lib.payPause();
  ok('без прапорця пауза стоїть сама', p.on === true, JSON.stringify(p));
  ok('  і запас названо', p.graceDays === 7, String(p.graceDays));

  /* Порожній рядок і «0» — не «увімкнено»: саме так виглядає змінна,
     яку завели, але не заповнили. */
  process.env.PAY_LIVE = '0';
  lib = fresh();
  ok('«0» не вмикає оплату', (await lib.payPause()).on === true);

  process.env.PAY_LIVE = '1';
  lib = fresh();
  const lifted = await lib.payPause();
  ok('прапорець знімає паузу', lifted.on === false, JSON.stringify(lifted));
  ok('  і дає запас на оплату', lifted.graceUntil > Date.now(), new Date(lifted.graceUntil).toISOString());

  /* Мить зняття мусить запам'ятатись один раз: інакше запас відсувався б
     із кожним запитом і не скінчився б ніколи. */
  const again = await lib.payPause();
  ok('  запас не відсувається з кожним запитом', again.graceUntil === lifted.graceUntil,
     (again.graceUntil - lifted.graceUntil) + ' мс різниці');

  if (keep === undefined) delete process.env.PAY_LIVE; else process.env.PAY_LIVE = keep;
}

/* ─── два пристрої й один пробний період ───
   Телефон показував дванадцять днів, а сайт — десять, під тим самим
   логіном. Правило «беремо ранішу дату» діяло лише в один бік: пристрій
   підтягував дату з сервера, а сервер про раніший початок на іншому
   пристрої не дізнавався ніколи — і зійтись вони не могли. */
part('пробний період на двох пристроях');
{
  const T = API('trial.js');
  const LOG = 'two@devices.test';
  const day = 86400000;

  const first = await call(T, {query: {login: LOG, device: 'phone', start: '1'}});
  ok('пробний почався', first.json.started === true, new Date(first.json.startedAt).toISOString());

  /* Другий пристрій каже, що в нього кабінет заведено на два дні раніше. */
  const earlier = first.json.startedAt - 2 * day;
  const second = await call(T, {query: {login: LOG, device: 'web', at: String(earlier)}});
  ok('сервер бере ранішу дату', second.json.startedAt === earlier,
     new Date(second.json.startedAt).toISOString());

  /* Тепер перший пристрій питає ще раз — і бачить те саме число. */
  const again = await call(T, {query: {login: LOG, device: 'phone'}});
  ok('  і обидва пристрої показують один строк', again.json.endsAt === second.json.endsAt,
     new Date(again.json.endsAt).toISOString() + ' / ' + new Date(second.json.endsAt).toISOString());

  /* Пізнішу дату не беремо: інакше перевстановлення застосунку
     подовжувало б пробний період скільки завгодно разів. */
  const later = await call(T, {query: {login: LOG, device: 'phone', at: String(Date.now() + 5 * day)}});
  ok('пізнішу дату сервер не приймає', later.json.startedAt === earlier,
     new Date(later.json.startedAt).toISOString());

  /* Зіпсований запис або збитий годинник надішле 1970 рік — і пробний
     період згорить миттєво, без вороття. Такому не віримо. */
  const junk = await call(T, {query: {login: LOG, device: 'phone', at: '1'}});
  ok('  а безглузду відкидає', junk.json.startedAt === earlier, String(junk.json.startedAt));
}

console.log('\n══════ ' + (checks - fails) + ' з ' + checks + (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
process.exit(fails ? 1 : 0);
})();
