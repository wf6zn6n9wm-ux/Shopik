/* «Восстановить покупку»: привязать ещё одно устройство к уже оплаченной
   подписке. Слотов ровно DEVICES — иначе знание чужой почты давало бы
   чужой доступ всему свету. */
const L = require('./_lib.js');

module.exports = async function handler(req, res){
  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  if (!login || !device) return L.json(res, 400, {ok: false, error: 'no_login'});

  const lic = await L.readLicence(login);
  if (!lic || lic.expiresAt < Date.now()) return L.json(res, 200, {ok: true, active: false});

  const devices = lic.devices || [];
  if (!devices.includes(device)){
    if (devices.length >= L.DEVICES){
      return L.json(res, 200, {ok: true, active: false, error: 'device_limit', devices: devices.length, limit: L.DEVICES});
    }
    devices.push(device);
    await L.writeLicence(login, {...lic, devices});
  }
  return L.json(res, 200, L.view({...lic, devices}, device));
};
