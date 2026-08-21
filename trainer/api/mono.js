/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · щоденне списання за автопродовження (monobank)

   LiqPay продовжує підписку сам, автоматично, без нашої участі —
   тренер один раз погодився, і банк списує далі. monobank так не вміє:
   гаманець лише зберігає картку, а списати з неї має саме той, хто
   зберігав, — тобто ми. Цей файл і є тим «хто».

   Запускається раз на добу кроном Vercel (див. vercel.json), тим самим
   способом, що й api/mail.js.

   GET /api/mono                          крон Vercel (X-Vercel-Cron)
   GET /api/mono?run=1  Authorization: Bearer $CRON_SECRET    вручну

   Кого чіпаємо: provider === 'mono', autoRenew, план з періодом
   (щомісячний/річний — тримається на тому самому p.period, що і в
   LiqPay), і «справжній» кінець періоду (без запасу GRACE_DAYS) уже
   близько. Запас лишається на випадок, якщо списання не вдалось із
   першого разу: крон іде щодня, спроб — на весь запас днів.
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');
const MONO = require('../api/_mono.js');

const DAY = 86400000;

module.exports = async function handler(req, res){
  const secret = process.env.CRON_SECRET || '';
  const auth = String(req.headers['authorization'] || '');
  const allowed = secret ? auth === 'Bearer ' + secret : !!req.headers['x-vercel-cron'];
  if (!allowed) return L.json(res, 401, {ok: false, error: 'forbidden'});

  if (!process.env.MONO_TOKEN)
    return L.json(res, 200, {ok: true, note: 'mono_not_configured', charged: 0});

  const now = Date.now();
  const keys = await L.store.keys('lic:*');
  const report = {ok: true, checked: 0, charged: [], skipped: {}};

  for (const key of keys){
    const lic = await L.store.get(key);
    if (!lic || lic.provider !== 'mono' || !lic.autoRenew) continue;
    const plan = L.PLANS[lic.plan];
    if (!plan || !plan.period) continue;               /* разовий тариф сам не продовжується */

    /* «справжній» кінець — без запасу на затримку банку. Списуємо за
       день до нього, щоб доступ ніколи не переривався в людини, яка
       справно платить. */
    report.checked++;
    const realEnd = lic.expiresAt - L.GRACE_DAYS * DAY;
    if (realEnd - now > DAY) continue;                  /* ще рано */
    if (now - realEnd > 7 * DAY){                        /* пізно й для запасу — облишили */
      report.skipped[lic.login] = 'too_late';
      continue;
    }
    /* цей самий цикл продовження вже спробували сьогодні — крон, який
       упав посеред дня й запустився вдруге, не має списати двічі */
    const dayKey = new Date(now).toISOString().slice(0, 10);
    if (lic.renewTriedOn === dayKey) continue;

    const orderId = 'mr_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const r = await MONO.chargeWallet({login: lic.login, plan, orderId});
    await L.store.set(key, {...lic, renewTriedOn: dayKey});

    if (r.ok){
      await L.applyPayment({login: lic.login, plan: lic.plan, orderId, autoRenew: true, provider: 'mono'});
      await L.logPayment({login: lic.login, plan: lic.plan, orderId, kind: 'pay', provider: 'mono'});
      report.charged.push(lic.login);
    } else {
      report.skipped[lic.login] = r.why;
    }
  }

  return L.json(res, 200, report);
};
