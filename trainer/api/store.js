/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · покупка в магазині застосунків

   POST /api/store  {login, device, store, proof}
     store — 'apple' | 'google'
     proof — те, що магазин видав телефону після оплати:
             purchaseToken у Google, transactionId в Apple

   Застосунок купив у магазині — і приходить сюди сказати про це. Ми не
   віримо йому на слово: чек перевіряється в самого магазину (див.
   api/_store.js), і лише його відповідь відкриває доступ.

   Чому підписка з магазину теж лягає в нашу ліцензію, а не живе окремо
   в телефоні: підписка одна на кабінет, а пристроїв у тренера до трьох.
   Купив на телефоні — маєш доступ і на планшеті, і в браузері. Крім
   того, локальний запис у телефоні переживає скасування підписки, а
   серверний — ні.

   GET /api/store — чи налаштована перевірка взагалі. Без секретів.
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');
const S = require('../api/_store.js');

module.exports = async function handler(req, res){
  /* розвідник браузера перед POST із нативної оболонки */
  if (L.preflight(req, res)) return;

  if ((req.method || 'GET').toUpperCase() === 'GET')
    return L.json(res, 200, {ok: true, ready: S.ready()});

  if (req.method !== 'POST') return L.json(res, 405, {ok: false, error: 'bad_method'});

  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  const store = String(q.store || '');
  const proof = String(q.proof || '');

  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});
  if (!proof) return L.json(res, 400, {ok: false, error: 'no_proof'});
  if (store !== 'apple' && store !== 'google')
    return L.json(res, 400, {ok: false, error: 'unknown_store'});

  const check = await S.verify({store, proof});
  if (!check.ok){
    /* Причину віддаємо як є: вона знадобиться в підтримці, коли тренер
       напише «заплатив, а доступу немає». Секретів у ній немає — це
       відповідь магазину про його ж покупку. */
    return L.json(res, 402, {ok: false, error: 'not_verified', why: check.why});
  }

  /* ─── одна покупка — один кабінет ───
     Інакше один оплачений телефон роздавав би доступ будь-якій кількості
     кабінетів: купив сам, а чек переслав друзям. Перший, хто прийшов із
     цим чеком, його й займає. */
  const owner = 'storebuy:' + store + ':' + check.orderId;
  const taken = await L.store.get(owner);
  if (taken && taken !== login)
    return L.json(res, 409, {ok: false, error: 'proof_taken'});
  if (!taken) await L.store.set(owner, login);

  /* Строк беремо той, що назвав магазин, а не рахуємо самі: він знає
     про продовження, скасування й пільгові періоди більше за нас.
     applyPayment рахує строк сам, тому пишемо ліцензію прямо. */
  const old = await L.readLicence(login);
  const devices = (old && old.devices) || [];
  if (device && !devices.includes(device) && devices.length < L.DEVICES) devices.push(device);

  const lic = {
    login, plan: check.plan, orderId: check.orderId,
    provider: store,
    purchasedAt: (old && old.purchasedAt) || Date.now(),
    paidAt: Date.now(),
    expiresAt: check.expiresAt || Date.now(),
    autoRenew: !!check.autoRenew,
    devices,
  };
  await L.writeLicence(login, lic);

  /* У журнал оплат пишемо лише першу покупку за цим чеком: далі магазин
     продовжує підписку сам, і кожна перевірка застосунку інакше
     додавала б у виручку той самий платіж по колу. */
  if (!old || old.orderId !== check.orderId)
    await L.logPayment({login, plan: check.plan, orderId: check.orderId, kind: 'pay', provider: store});

  return L.json(res, 200, L.view(lic, device));
};
