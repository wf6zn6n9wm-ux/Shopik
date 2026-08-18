/* Приложение спрашивает: есть ли активная подписка на этот логин и это
   устройство. Ответ нарочно бедный — никаких персональных данных. */
const L = require('./_lib.js');

module.exports = async function handler(req, res){
  const q = req.query || {};
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});
  const lic = await L.readLicence(login);
  return L.json(res, 200, L.view(lic, device));
};
