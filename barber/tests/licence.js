/* Проверка серверной части подписки без сети и без LiqPay: функции в api/
   зовём напрямую, подпись считаем тем же кодом, что и банк.

   node barber/tests/licence.js                                        */
process.env.BARBER_LIQPAY_PUBLIC_KEY = 'test_pub';
process.env.BARBER_LIQPAY_PRIVATE_KEY = 'test_priv';
process.env.BARBER_PUBLIC_BASE_URL = 'https://probarber.test';

const path = require('path');
const API = p => require(path.join(__dirname, '..', 'api', p));
const L = API('_lib.js');

let checks = 0, fails = 0;
const part = t => console.log('\n── ' + t + ' ──');
const ok = (name, cond, extra) => {
  checks++; if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};

/* минимальная заглушка res, которой хватает функциям */
function call(fn, {query = {}, body = null, method = 'GET', headers = {}} = {}){
  return new Promise(resolve => {
    const res = {
      code: 0, headers: {},
      setHeader(k, v){ res.headers[k.toLowerCase()] = v; },
      status(c){ res.code = c; return res; },
      send(text){
        let json = null;
        try { json = JSON.parse(text); } catch (e){}
        resolve({code: res.code, headers: res.headers, text: String(text), json});
      },
    };
    Promise.resolve(fn({query, body, method, headers: {host: 'probarber.test', ...headers}}, res))
      .catch(e => resolve({code: 500, text: String(e), json: null}));
  });
}

/* то, что делает LiqPay, когда сообщает об оплате */
const bank = payload => {
  const data = L.pack(payload);
  return {data, signature: L.sign(data)};
};

const LOGIN = 'Barber@Mail.com';
const DEV_A = 'dev_a', DEV_B = 'dev_b', DEV_C = 'dev_c', DEV_D = 'dev_d';
let order = '';

(async () => {

part('подпись');
{
  const {data, signature} = bank({hello: 'world'});
  ok('свою подпись принимаем', L.verify(data, signature));
  ok('чужую подпись отклоняем', !L.verify(data, signature.slice(0, -2) + 'xx'));
  ok('подпись другой длины не ломает проверку', !L.verify(data, 'коротко'));
  ok('логин нормализуется как в кабинете',
     L.normLogin(' Barber@Mail.com ') === 'barber@mail.com' && L.normLogin('0631234567') === '380631234567',
     L.normLogin('0631234567'));
}

part('оплата');
{
  const r = await call(API('checkout.js'), {query: {plan: 'yearly', login: LOGIN, device: DEV_A, lang: 'ru'}});
  ok('страница оплаты отдаётся', r.code === 200 && r.text.includes('liqpay.ua/api/3/checkout'));
  const data = (r.text.match(/name="data" value="([^"]+)"/) || [])[1];
  const sig = (r.text.match(/name="signature" value="([^"]+)"/) || [])[1];
  ok('подпись на странице настоящая', L.verify(data, sig));
  const p = L.unpack(data);
  order = p.order_id;
  ok('годовой план — регулярное списание', p.action === 'subscribe' && p.subscribe_periodicity === 'year', p.action + '/' + p.subscribe_periodicity);
  ok('цена совпадает с тарифом', p.amount === L.PLANS.yearly.usd, '$' + p.amount);
  ok('приватный ключ в браузер не попадает', !r.text.includes('test_priv'));
  ok('логин и устройство едут в info', JSON.parse(p.info).login === 'barber@mail.com' && JSON.parse(p.info).device === DEV_A);
  ok('возврат ведёт на свой домен', p.server_url === 'https://probarber.test/api/callback', p.server_url);

  const q = await call(API('checkout.js'), {query: {plan: 'quarterly', login: LOGIN, device: DEV_A}});
  const qp = L.unpack((q.text.match(/name="data" value="([^"]+)"/) || [])[1]);
  ok('три месяца — разовая оплата, LiqPay не умеет такой период', qp.action === 'pay' && !qp.subscribe, qp.action);

  const bad = await call(API('checkout.js'), {query: {plan: 'wat', login: LOGIN}});
  ok('неизвестный план не принимается', bad.code === 400, String(bad.code));
  const nolog = await call(API('checkout.js'), {query: {plan: 'yearly'}});
  ok('без логина оплату не создаём', nolog.code === 400, String(nolog.code));
}

part('ответ банка');
{
  const forged = await call(API('callback.js'), {method: 'POST', body: {data: L.pack({status: 'success'}), signature: 'подделано'}});
  ok('поддельный callback отклоняется', forged.code === 403, String(forged.code));

  const wrongWay = await call(API('callback.js'), {method: 'GET', query: {}});
  ok('callback принимает только POST', wrongWay.code === 405, String(wrongWay.code));

  const before = await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}});
  ok('до оплаты доступа нет', before.json.active === false);

  const info = JSON.stringify({login: LOGIN, device: DEV_A, plan: 'yearly'});
  const paid = await call(API('callback.js'), {method: 'POST', body: bank({status: 'success', order_id: order, info})});
  ok('оплата засчитана', paid.code === 200 && paid.json.ok);

  const lic = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('подписка активна', lic.active === true);
  ok('срок — год с запасом', lic.expiresAt > Date.now() + 360 * 86400000, new Date(lic.expiresAt).toISOString().slice(0, 10));
  ok('устройство привязано автоматически', lic.devices === 1 && lic.autoRenew === true);
  ok('логин в ответе не светится', !('login' in lic));

  /* второе списание через год не должно обнулять остаток */
  const was = lic.expiresAt;
  await call(API('callback.js'), {method: 'POST', body: bank({status: 'success', order_id: order, info})});
  const next = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('продление добавляется к сроку, а не обнуляет его',
     next.expiresAt > was + 360 * 86400000, new Date(next.expiresAt).toISOString().slice(0, 10));
}

part('устройства');
{
  const other = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_B}})).json;
  ok('чужое устройство доступа не получает', other.active === false && other.needsClaim === true);

  const claimed = (await call(API('claim.js'), {query: {login: LOGIN, device: DEV_B}})).json;
  ok('«Восстановить покупку» привязывает устройство', claimed.active === true && claimed.devices === 2);

  await call(API('claim.js'), {query: {login: LOGIN, device: DEV_C}});
  const over = (await call(API('claim.js'), {query: {login: LOGIN, device: DEV_D}})).json;
  ok('больше трёх устройств не пускаем', over.active === false && over.error === 'device_limit', over.error);
  ok('знание чужой почты само по себе доступа не даёт',
     (await call(API('licence.js'), {query: {login: LOGIN, device: 'dev_чужой'}})).json.active === false);
}

part('отмена и возврат');
{
  const offed = (await call(API('unsubscribe.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('автопродление выключается', offed.autoRenew === false);
  ok('доступ остаётся до конца периода', offed.active === true, new Date(offed.expiresAt).toISOString().slice(0, 10));

  const stranger = await call(API('unsubscribe.js'), {query: {login: LOGIN, device: 'dev_чужой'}});
  ok('чужое устройство не может выключить подписку', stranger.code === 403, String(stranger.code));

  const info = JSON.stringify({login: LOGIN, device: DEV_A, plan: 'yearly'});
  await call(API('callback.js'), {method: 'POST', body: bank({status: 'reversed', order_id: order, info})});
  const back = (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json;
  ok('после возврата средств доступ забирается сразу', back.active === false);

  await call(API('callback.js'), {method: 'POST', body: bank({status: 'failure', order_id: order, info})});
  ok('неудачная оплата ничего не ломает',
     (await call(API('licence.js'), {query: {login: LOGIN, device: DEV_A}})).json.ok === true);
}

part('пробный период');
{
  const NEW = 'newbie@mail.com';
  const first = (await call(API('trial.js'), {query: {login: NEW, device: 'dev_1'}})).json;
  ok('до этого пробный не начинался', first.started === false);

  const started = (await call(API('trial.js'), {query: {login: NEW, device: 'dev_1', start: '1'}})).json;
  ok('пробный период начинается', started.started === true && started.days === 14);
  ok('конец считается от старта', started.endsAt === started.startedAt + 14 * 86400000);
  ok('только что начался — не просрочен', started.expired === false);

  /* именно ради этого всё и затевалось: переустановка приложения */
  const again = (await call(API('trial.js'), {query: {login: NEW, device: 'dev_ДРУГОЙ', start: '1'}})).json;
  ok('переустановка не даёт новых 14 дней', again.startedAt === started.startedAt,
     new Date(again.startedAt).toISOString().slice(0, 16));

  /* тот же логин другим написанием — это тот же барбер */
  const same = (await call(API('trial.js'), {query: {login: '  NewBie@Mail.com ', start: '1'}})).json;
  ok('логин нормализуется — регистр и пробелы не обманывают', same.startedAt === started.startedAt);

  const peek = (await call(API('trial.js'), {query: {login: 'nobody@mail.com'}})).json;
  ok('без start пробный сам не начинается', peek.started === false);

  const nolog = await call(API('trial.js'), {query: {start: '1'}});
  ok('без логина ничего не пишем', nolog.code === 400, String(nolog.code));
}

part('здоровье и ключи');
{
  const h = (await call(API('health.js'), {})).json;
  ok('health отвечает', h.ok === true);
  ok('без KV честно говорит «память»', h.storage === 'memory', h.storage);
  ok('ключи мерчанта видит', h.liqpay === true);
  ok('секретов не отдаёт', !JSON.stringify(h).includes('test_priv'));

  const keep = process.env.BARBER_LIQPAY_PRIVATE_KEY;
  process.env.BARBER_LIQPAY_PRIVATE_KEY = '';
  delete require.cache[require.resolve(path.join(__dirname, '..', 'api', '_lib.js'))];
  delete require.cache[require.resolve(path.join(__dirname, '..', 'api', 'checkout.js'))];
  const r = await call(API('checkout.js'), {query: {plan: 'yearly', login: LOGIN}});
  ok('без ключей мерчанта честно говорим, что не настроено', r.code === 503 && r.json.error === 'not_configured');
  process.env.BARBER_LIQPAY_PRIVATE_KEY = keep;
}

part('цены сходятся в трёх местах');
{
  const fs = require('fs');
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const pay = read('pay.html'), app = read('index.html');
  /* один и тот же тариф записан в трёх файлах — разъедутся молча, если
     не проверять: сервер выставит счёт на одну сумму, страница покажет
     другую, а кабинет — третью */
  Object.values(L.PLANS).forEach(p => {
    const line = new RegExp("id: ?'" + p.id + "'[^}]*usd: ?" + String(p.usd).replace('.', '\\.'));
    ok('план ' + p.id + ' — $' + p.usd + ' и на странице оплаты, и в кабинете',
       line.test(pay) && line.test(app),
       (line.test(pay) ? '' : 'pay.html ') + (line.test(app) ? '' : 'index.html'));
  });
  ok('месяцев в плане тоже поровну',
     Object.values(L.PLANS).every(p => new RegExp("id: ?'" + p.id + "'[^}]*months: ?" + p.months).test(app)));
  ok('лимит устройств один и тот же на сервере и в кабинете',
     L.DEVICES === 3 && /devices: ?3/.test(app), String(L.DEVICES));
}

console.log('\n══════ ' + (checks - fails) + ' из ' + checks + (fails ? ' · есть замечания' : ' · всё чисто') + ' ══════');
process.exit(fails ? 1 : 0);
})();
