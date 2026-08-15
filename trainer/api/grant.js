/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · видати підписку вручну

   Навіщо. Перше й головне — ревізор магазину. Застосунок у магазині
   нічого не продає, тож без чинної підписки перевіряльник побачить лише
   екран «підписка неактивна» і поверне збірку, не подивившись нічого.
   Йому потрібен логін, який уже працює.

   Далі — звичайні життєві випадки: оплата зависла між банком і нами,
   людині треба повернути доступ; знайомому тренеру дати місяць
   подивитись; собі — перевірити, як застосунок поводиться з підпискою.

   Хто може. Той самий секрет, що й у розсилки: заголовок
   Authorization: Bearer $CRON_SECRET. Через браузер такий запит не
   зробити — кнопка живе в GitHub (.github/workflows/grant.yml).

   GET /api/grant?login=…&months=12          видати
   GET /api/grant?login=…&revoke=1           забрати

   Видана підписка не продовжується сама: продовжувати нічого, грошей за
   нею немає. Пристрої лишаються ті самі, що були, — застосунок
   прив'яжеться сам, коли людина натисне «Я вже оплатив».
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');

const MAX_MONTHS = 60;

module.exports = async function handler(req, res){
  const secret = process.env.CRON_SECRET || '';
  const auth = String(req.headers['authorization'] || '');
  /* Без заданого секрету не пускаємо взагалі: тут роздають доступ, і
     «якось працює саме по собі» тут гірше, ніж не працює. */
  if (!secret || auth !== 'Bearer ' + secret) return L.json(res, 401, {ok: false, error: 'forbidden'});

  const q = {...(req.query || {}), ...(req.body || {})};
  const login = L.normLogin(q.login);
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});

  const old = await L.readLicence(login);

  if (q.revoke === '1' || q.revoke === 'true'){
    if (!old) return L.json(res, 200, {ok: true, login, revoked: false, note: 'підписки не було'});
    await L.writeLicence(login, {...old, expiresAt: Date.now() - 1, autoRenew: false});
    return L.json(res, 200, {ok: true, login, revoked: true});
  }

  const months = Math.min(MAX_MONTHS, Math.max(1, Math.round(Number(q.months) || 12)));
  const plan = L.PLANS[q.plan] ? q.plan : 'yearly';
  /* продовжуємо від більшої з дат, як і звичайна оплата: інакше видача
     з'їдала б залишок чинної підписки */
  const from = Math.max(Date.now(), (old && old.expiresAt) || 0);

  const lic = {
    login, plan,
    orderId: 'grant_' + Date.now().toString(36),
    purchasedAt: (old && old.purchasedAt) || Date.now(),
    paidAt: Date.now(),
    expiresAt: L.addMonths(from, months),
    autoRenew: false,
    devices: (old && old.devices) || [],
    granted: true,                       /* видана вручну, не оплачена */
  };
  await L.writeLicence(login, lic);

  return L.json(res, 200, {
    ok: true, login, plan, months,
    until: new Date(lic.expiresAt).toISOString().slice(0, 10),
    devices: lic.devices.length, limit: L.DEVICES,
  });
};
