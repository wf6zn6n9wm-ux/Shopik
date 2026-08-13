/* Застосунок питає: чи є активна підписка на цей логін і цей пристрій.
   Відповідь навмисне бідна — жодних персональних даних. */
const L = require('../api/_lib.js');

module.exports = async function handler(req, res){
  const q = req.query || {};
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});
  const lic = await L.readLicence(login);
  return L.json(res, 200, L.view(lic, device));
};
