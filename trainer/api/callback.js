/* server_url для LiqPay: сюди банк повідомляє про оплату — і про кожне
   наступне регулярне списання. Єдине джерело правди про підписку.

   Довіряти можна лише тому, що пройшло перевірку підпису: підпис
   робиться нашим приватним ключем, якого ні в кого більше немає. */
const L = require('../api/_lib.js');

/* LiqPay шле application/x-www-form-urlencoded; Vercel розбирає його сам,
   але на всяк випадок читаємо і сире тіло */
function fields(req){
  if (req.body && typeof req.body === 'object' && req.body.data) return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  return {};
}

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return L.json(res, 405, {ok: false});
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
    await L.applyPayment({login, device: info.device, plan, orderId: p.order_id, autoRenew: true});
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
    return L.json(res, 200, {ok: true});
  }

  /* failure / error нічого не змінюють: попередній доступ у силі */
  return L.json(res, 200, {ok: true, status: st});
};
