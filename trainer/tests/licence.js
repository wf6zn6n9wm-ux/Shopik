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
  ok('ціна веб, а не магазину', p.amount === 48.99, '$' + p.amount);
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
  const offed = (await call(API('unsubscribe.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('автопродовження вимикається', offed.autoRenew === false);
  ok('доступ лишається до кінця періоду', offed.active === true, new Date(offed.expiresAt).toISOString().slice(0, 10));

  const stranger = await call(API('unsubscribe.js'), {query: {login: LOGIN, device: 'dev_чужий'}});
  ok('чужий пристрій не може вимкнути підписку', stranger.code === 403, String(stranger.code));

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
  const was = d.money.usdAll;
  await L.logPayment({login: 'a@mail.com', plan: 'yearly', orderId: 'o1', kind: 'pay'});
  const paid = (await call(ADMIN, head('3.3.3.3'))).json.money;
  ok('оплата додає суму тарифу', +(paid.usdAll - was).toFixed(2) === 48.99, String(paid.usdAll - was));
  await L.logPayment({login: 'a@mail.com', plan: 'yearly', orderId: 'o1', kind: 'back'});
  const m = (await call(ADMIN, head('3.3.3.3'))).json.money;
  ok('повернення забирає її назад', +(m.usdAll - was).toFixed(2) === 0, String(m.usdAll - was));
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
      {ts: Date.parse('2026-08-03T10:00:00Z'), login: 'a@mail.com', plan: 'monthly',   usd: 4.49,   kind: 'pay'},
      {ts: Date.parse('2026-08-03T18:00:00Z'), login: 'b@mail.com', plan: 'yearly',    usd: 48.99,  kind: 'pay'},
      {ts: Date.parse('2026-08-11T09:00:00Z'), login: 'a@mail.com', plan: 'monthly',   usd: 4.49,   kind: 'pay'},
      {ts: Date.parse('2026-09-02T09:00:00Z'), login: 'c@mail.com', plan: 'quarterly', usd: 11.99,  kind: 'pay'},
      {ts: Date.parse('2026-09-04T09:00:00Z'), login: 'b@mail.com', plan: 'yearly',    usd: -48.99, kind: 'back'},
    ];
    await L.store.set(L.PAY_LOG, rows);
    const m = (await call(ADMIN, head('4.4.4.4'))).json.money;

    ok('оплат рахуємо без повернень', m.pays === 4, String(m.pays));
    ok('платників — за людьми, а не за платежами', m.payers === 3, String(m.payers));
    ok('повернення окремо', m.backs === 1 && m.backUsd === -48.99, m.backs + ' / ' + m.backUsd);

    const aug = m.byMonth.find(x => x.month === '2026-08');
    const sep = m.byMonth.find(x => x.month === '2026-09');
    ok('серпень: три оплати, двоє платників', aug.pays === 3 && aug.payers === 2,
       aug.pays + ' / ' + aug.payers);
    ok('серпень: виручка зійшлась', aug.usd === 57.97, String(aug.usd));
    /* За вересень прийшло 11.99, а повернули 48.99 — місяць у мінусі, і
       так і має бути видно. Сховати повернення означало б показати
       кращу картину, ніж є. */
    ok('вересень: повернення тягне місяць у мінус', sep.usd === -37, String(sep.usd));
    ok('новіші місяці зверху', m.byMonth[0].month === '2026-09', m.byMonth[0].month);

    const d3 = m.byDay.find(x => x.day === '2026-08-03');
    ok('день видно окремо', d3 && d3.pays === 2 && d3.usd === 53.48,
       d3 ? d3.pays + ' / ' + d3.usd : '—');
    ok('порожніх днів не показуємо', m.byDay.length === 4, String(m.byDay.length));

    const yearly = m.byPlan.find(x => x.plan === 'yearly');
    const monthly = m.byPlan.find(x => x.plan === 'monthly');
    ok('по тарифах: місячний куплено двічі', monthly.pays === 2 && monthly.usd === 8.98,
       monthly.pays + ' / ' + monthly.usd);
    ok('повернення не зменшує лічильник покупок тарифу', yearly.pays === 1, String(yearly.pays));
    ok('видно, з якого дня рахуємо', m.since === '2026-08-03', m.since);
    ok('середній чек — по оплатах', m.avg === +(m.byPlan.reduce((s, x) => s + x.usd, 0) / 4).toFixed(2),
       String(m.avg));
  }

  delete process.env.ADMIN_PASS;
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

console.log('\n══════ ' + (checks - fails) + ' з ' + checks + (fails ? ' · є замечання' : ' · все чисто') + ' ══════');
process.exit(fails ? 1 : 0);
})();
