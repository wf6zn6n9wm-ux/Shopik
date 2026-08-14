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
