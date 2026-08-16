/* server_url для LiqPay: сюда банк сообщает об оплате — и о каждом
   следующем регулярном списании. Единственный источник правды о подписке.

   Доверять можно только тому, что прошло проверку подписи: подпись
   делается нашим приватным ключом, которого больше ни у кого нет. */
const L = require('./_lib.js');

/* LiqPay шлёт application/x-www-form-urlencoded; Vercel разбирает его сам,
   но на всякий случай читаем и сырое тело */
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
  try { p = L.unpack(data); } catch (e){ return L.json(res, 400, {ok: false, error: 'bad_data'}); }

  let info = {};
  try { info = JSON.parse(p.info || '{}'); } catch (e){}
  const login = L.normLogin(info.login);
  const plan = info.plan;
  if (!login || !L.PLANS[plan]) return L.json(res, 200, {ok: true, skipped: 'no_info'});

  const st = String(p.status || '');

  /* деньги пришли — продлеваем срок */
  if (st === 'success' || st === 'subscribed' || st === 'wait_accept'){
    await L.applyPayment({login, device: info.device, plan, orderId: p.order_id, autoRenew: true});
    return L.json(res, 200, {ok: true});
  }

  /* барбер выключил автопродление или банк перестал списывать:
     доступ остаётся до конца уже оплаченного периода */
  if (st === 'unsubscribed' || st === 'subscribe_cancelled'){
    const lic = await L.readLicence(login);
    if (lic) await L.writeLicence(login, {...lic, autoRenew: false});
    return L.json(res, 200, {ok: true});
  }

  /* возврат средств — доступ забираем сразу */
  if (st === 'reversed' || st === 'refund'){
    const lic = await L.readLicence(login);
    if (lic) await L.writeLicence(login, {...lic, autoRenew: false, expiresAt: Date.now()});
    return L.json(res, 200, {ok: true});
  }

  /* failure / error ничего не меняют: прежний доступ в силе */
  return L.json(res, 200, {ok: true, status: st});
};
