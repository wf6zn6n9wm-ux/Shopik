/* Сюди приходять сповіщення про оплату — від LiqPay і від monobank
   одразу, обидва на одну адресу: platform, з якого прийшов запит, видно
   з форми самого тіла, і плутати нема з чим — LiqPay шле форму з полем
   data, monobank JSON з invoiceId.

   Довіряти можна лише тому, що пройшло перевірку. Для LiqPay це підпис,
   зроблений нашим приватним ключем. Для monobank — не підпис у самому
   запиті (детально why — у api/_mono.js), а зустрічний запит до
   monobank нашим токеном: тіло вебхука лише каже, куди подивитись. */
const L = require('../api/_lib.js');
const MONO = require('../api/_mono.js');

/* LiqPay шле application/x-www-form-urlencoded; Vercel розбирає його сам,
   але на всяк випадок читаємо і сире тіло */
function fields(req){
  if (req.body && typeof req.body === 'object' && req.body.data) return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  return {};
}

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return L.json(res, 405, {ok: false});

  /* monobank: JSON з invoiceId і без поля data — інакше це LiqPay */
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  if (body.invoiceId && !body.data){
    const r = await MONO.confirmAndApply(String(body.invoiceId));
    /* monobank чекає 200 на будь-яке прийняте сповіщення — інакше
       повторюватиме дзвінки. why лишається в тілі відповіді для
       журналу, а не для monobank: йому досить самого статусу. */
    return L.json(res, 200, {ok: true, ...r});
  }

  const {data, signature} = fields(req);
  if (!data || !L.verify(data, signature)) return L.json(res, 403, {ok: false, error: 'bad_signature'});

  let p;
  try { p = L.unpack(data); } catch { return L.json(res, 400, {ok: false, error: 'bad_data'}); }

  let info = {};
  try { info = JSON.parse(p.info || '{}'); } catch {}
  const login = L.normLogin(info.login);
  const plan = info.plan;
  if (!login || !L.PLANS[plan]) return L.json(res, 200, {ok: true, skipped: 'no_info'});

  const st = String(p.status || '');

  /* гроші прийшли — продовжуємо строк */
  if (st === 'success' || st === 'subscribed' || st === 'wait_accept'){
    await L.applyPayment({login, device: info.device, plan, orderId: p.order_id, autoRenew: true, provider: 'liqpay'});
    await L.logPayment({login, plan, orderId: p.order_id, kind: 'pay', provider: 'liqpay'});
    return L.json(res, 200, {ok: true});
  }

  /* тренер вимкнув автопродовження або банк перестав списувати:
     доступ лишається до кінця вже оплаченого періоду */
  if (st === 'unsubscribed' || st === 'subscribe_cancelled'){
    const lic = await L.readLicence(login);
    if (lic) await L.writeLicence(login, {...lic, autoRenew: false});
    return L.json(res, 200, {ok: true});
  }

  /* повернення коштів — доступ забираємо одразу */
  if (st === 'reversed' || st === 'refund'){
    const lic = await L.readLicence(login);
    if (lic) await L.writeLicence(login, {...lic, autoRenew: false, expiresAt: Date.now()});
    await L.logPayment({login, plan, orderId: p.order_id, kind: 'back'});
    return L.json(res, 200, {ok: true});
  }

  /* failure / error нічого не змінюють: попередній доступ у силі */
  return L.json(res, 200, {ok: true, status: st});
};
