/* Перевірка серверної частини без мережі й без LiqPay: функції в api/
   кличемо напряму, а підпис рахуємо тим самим кодом, що й банк.

   node urok/tests/licence.js

   Сценарій рівно той, що буває в житті: людина платить на сайті →
   LiqPay стукає в callback → застосунок питає ліцензію → інший
   пристрій просить доступ → закінчуються слоти → вимикається
   автопродовження → приходить повернення коштів.                    */
process.env.LIQPAY_PUBLIC_KEY = 'test_pub';
process.env.LIQPAY_PRIVATE_KEY = 'test_priv';
process.env.PUBLIC_BASE_URL = 'https://urok.test';

const path = require('path');
const API = p => require(path.join(__dirname, '..', 'api', p));
const L = API('_lib.js');

let checks = 0, fails = 0;
const part = t => console.log('\n── ' + t + ' ──');
const ok = (name, cond, extra) => {
  checks++;
  if (!cond) fails++;
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
        try { json = JSON.parse(text); } catch (e) {}
        resolve({code: res.code, headers: res.headers, text: String(text), json});
      },
    };
    Promise.resolve(fn({query, body, method, headers}, res)).catch(e => {
      resolve({code: 500, headers: {}, text: String(e && e.message), json: null});
    });
  });
}

const DEVICE = 'dev_phone';
const OTHER = 'dev_tablet';
const THIRD = 'dev_laptop';
const FOURTH = 'dev_work';
const LOGIN = 'Teacher@Example.com';

(async () => {
  /* ── 1. підпис ── */
  part('підпис LiqPay');
  const data = L.pack({public_key: 'test_pub', version: 3, action: 'pay', amount: 149});
  const signature = L.sign(data);
  ok('підпис перевіряється', L.verify(data, signature));
  ok('чужий підпис не проходить', !L.verify(data, L.sign(data + 'x')));
  ok('порожній підпис не проходить', !L.verify(data, ''));
  ok('дані розпаковуються назад', L.unpack(data).amount === 149);

  /* ── 2. логін ── */
  part('логін');
  ok('пошта в нижньому регістрі', L.normLogin(' Me@X.COM ') === 'me@x.com');
  ok('телефон лишається цифрами', L.normLogin('+38 (063) 111-22-33') === '380631112233');
  ok('короткий номер доповнюється кодом', L.normLogin('0631112233') === '380631112233');

  /* ── 3. створення оплати ── */
  part('створення оплати');
  const checkout = await call(API('checkout.js'), {query: {plan: 'yearly', login: LOGIN, device: DEVICE, lang: 'uk'}});
  ok('віддає сторінку', checkout.code === 200 && /liqpay\.ua\/api\/3\/checkout/.test(checkout.text));
  const field = name => (checkout.text.match(new RegExp('name="' + name + '" value="([^"]+)"')) || [])[1] || '';
  const sent = L.unpack(field('data').replace(/&quot;/g, '"'));
  ok('сума з тарифу', sent.amount === L.PLANS.yearly.uah, String(sent.amount));
  ok('валюта — гривня', sent.currency === 'UAH', sent.currency);
  ok('річний план — підписка', sent.action === 'subscribe' && sent.subscribe_periodicity === 'year');
  ok('callback наш', sent.server_url === 'https://urok.test/api/callback', sent.server_url);
  ok('логін і пристрій їдуть у info', JSON.parse(sent.info).login === 'teacher@example.com'
     && JSON.parse(sent.info).device === DEVICE);
  ok('підпис форми сходиться', L.verify(field('data').replace(/&quot;/g, '"'), field('signature')));

  const quarter = await call(API('checkout.js'), {query: {plan: 'quarterly', login: LOGIN, device: DEVICE}});
  const qData = L.unpack((quarter.text.match(/name="data" value="([^"]+)"/) || [])[1].replace(/&quot;/g, '"'));
  ok('тримісячний — разовий платіж', qData.action === 'pay' && !qData.subscribe);

  const bad = await call(API('checkout.js'), {query: {plan: 'nope', login: LOGIN}});
  ok('невідомий план не проходить', bad.code === 400, String(bad.code));
  const noLogin = await call(API('checkout.js'), {query: {plan: 'yearly'}});
  ok('без логіна не проходить', noLogin.code === 400, String(noLogin.code));

  /* ── 4. поки не заплатили ── */
  part('до оплати');
  const before = await call(API('licence.js'), {query: {login: LOGIN, device: DEVICE}});
  ok('підписки немає', before.json.ok && before.json.active === false);

  /* ── 5. банк повідомляє про оплату ── */
  part('оплата пройшла');
  const payload = L.pack({
    status: 'success', order_id: 'up_test_1', amount: L.PLANS.yearly.uah, currency: 'UAH',
    info: JSON.stringify({login: LOGIN, device: DEVICE, plan: 'yearly'}),
  });
  const cbBad = await call(API('callback.js'), {method: 'POST', body: {data: payload, signature: 'nope'}});
  ok('без підпису callback відхиляється', cbBad.code === 403, String(cbBad.code));

  const cb = await call(API('callback.js'), {method: 'POST', body: {data: payload, signature: L.sign(payload)}});
  ok('callback приймає оплату', cb.code === 200 && cb.json.ok);

  const after = await call(API('licence.js'), {query: {login: LOGIN, device: DEVICE}});
  ok('підписка активна', after.json.active === true);
  ok('план збережено', after.json.plan === 'yearly', after.json.plan);
  ok('автопродовження увімкнене', after.json.autoRenew === true);
  const days = Math.round((after.json.expiresAt - Date.now()) / 86400000);
  ok('строк — рік із запасом', days > 360 && days < 372, days + ' днів');

  /* ── 6. інші пристрої ── */
  part('пристрої');
  const foreign = await call(API('licence.js'), {query: {login: LOGIN, device: OTHER}});
  ok('чужий пристрій ще не має доступу', foreign.json.active === false && foreign.json.needsClaim === true);

  const claimed = await call(API('claim.js'), {query: {login: LOGIN, device: OTHER}});
  ok('другий пристрій прив\'язується', claimed.json.active === true, String(claimed.json.devices));
  const third = await call(API('claim.js'), {query: {login: LOGIN, device: THIRD}});
  ok('третій теж', third.json.active === true, String(third.json.devices));
  const fourth = await call(API('claim.js'), {query: {login: LOGIN, device: FOURTH}});
  ok('четвертий упирається в ліміт', fourth.json.active === false && fourth.json.error === 'device_limit',
     fourth.json.devices + '/' + fourth.json.limit);
  ok('ліміт дорівнює тому, що в застосунку', fourth.json.limit === L.DEVICES);

  /* ── 7. продовження не з'їдає залишок ── */
  part('продовження');
  const wasUntil = (await call(API('licence.js'), {query: {login: LOGIN, device: DEVICE}})).json.expiresAt;
  const again = L.pack({
    status: 'success', order_id: 'up_test_2',
    info: JSON.stringify({login: LOGIN, device: DEVICE, plan: 'monthly'}),
  });
  await call(API('callback.js'), {method: 'POST', body: {data: again, signature: L.sign(again)}});
  const extended = (await call(API('licence.js'), {query: {login: LOGIN, device: DEVICE}})).json;
  ok('строк додається до чинного, а не замінює його', extended.expiresAt > wasUntil,
     Math.round((extended.expiresAt - wasUntil) / 86400000) + ' днів додалось');

  /* ── 8. вимкнення автопродовження ── */
  part('автопродовження');
  global.fetch = async () => ({ok: true, json: async () => ({})});   /* LiqPay не чіпаємо */
  const cancelled = await call(API('unsubscribe.js'), {query: {login: LOGIN, device: DEVICE}});
  ok('автопродовження вимикається', cancelled.json.autoRenew === false);
  ok('доступ лишається до кінця періоду', cancelled.json.active === true);
  const foreignCancel = await call(API('unsubscribe.js'), {query: {login: LOGIN, device: 'dev_unknown'}});
  ok('чужий пристрій не може вимкнути', foreignCancel.code === 403, String(foreignCancel.code));

  /* ── 9. повернення коштів ── */
  part('повернення коштів');
  const refund = L.pack({
    status: 'reversed', order_id: 'up_test_1',
    info: JSON.stringify({login: LOGIN, device: DEVICE, plan: 'yearly'}),
  });
  await call(API('callback.js'), {method: 'POST', body: {data: refund, signature: L.sign(refund)}});
  const dead = await call(API('licence.js'), {query: {login: LOGIN, device: DEVICE}});
  ok('доступ забирається одразу', dead.json.active === false);

  /* ── 10. службове ── */
  part('службове');
  const health = await call(API('health.js'), {});
  ok('health відповідає', health.json.ok && health.json.liqpay === true);
  ok('health не віддає ключів', !/test_priv/.test(health.text));
  ok('health знає валюту', health.json.currency === 'UAH');

  console.log(fails ? `\n${fails} помилок (перевірок: ${checks})` : `\nсервер оплати справний · перевірок: ${checks}`);
  process.exit(fails ? 1 : 0);
})();
