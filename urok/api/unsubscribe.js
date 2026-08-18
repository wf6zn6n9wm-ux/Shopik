/* Вимкнути автопродовження. Кажемо про це LiqPay і собі: доступ
   лишається до кінця оплаченого періоду, гроші більше не списуються. */
const L = require('./_lib.js');

module.exports = async function handler(req, res){
  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  if (!L.configured()) return L.json(res, 503, {ok: false, error: 'not_configured'});

  const lic = await L.readLicence(login);
  if (!lic) return L.json(res, 200, {ok: true, active: false});
  /* право вимикати має той, хто вже користується підпискою на цьому пристрої */
  if (device && !(lic.devices || []).includes(device)) return L.json(res, 403, {ok: false, error: 'unknown_device'});

  if (lic.orderId){
    const data = L.pack({public_key: L.ENV.pub, version: 3, action: 'unsubscribe', order_id: lic.orderId});
    try {
      await fetch('https://www.liqpay.ua/api/request', {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({data, signature: L.sign(data)}),
      });
    } catch { /* банк відповість пізніше через callback */ }
  }
  const next = {...lic, autoRenew: false};
  await L.writeLicence(login, next);
  return L.json(res, 200, L.view(next, device));
};
