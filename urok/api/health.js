/* Чи готовий сервер приймати оплату: ключі на місці, сховище живе.
   Секретів не віддає — лише «так/ні», щоб можна було перевірити
   налаштування без здогадок. */
const L = require('./_lib.js');

module.exports = async function handler(req, res){
  L.json(res, 200, {
    ok: true,
    liqpay: L.configured(),
    storage: await L.store.live(),
    plans: Object.keys(L.PLANS),
    currency: L.CURRENCY,
    base: L.ENV.base || null,
  });
};
