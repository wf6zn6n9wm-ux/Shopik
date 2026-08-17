/* Створення оплати: віддаємо сторінку, яка сама відправляє форму в LiqPay.
   Приватний ключ лишається на сервері — у браузер їде тільки підпис. */
const L = require('../api/_lib.js');

module.exports = function handler(req, res){
  const q = {...(req.query || {}), ...(req.body || {})};
  const plan = L.PLANS[q.plan];
  const login = L.normLogin(q.login);
  const device = String(q.device || '');
  const lang = ['uk', 'ru', 'en', 'pl'].includes(q.lang) ? q.lang : 'uk';

  if (!L.configured()) return L.json(res, 503, {ok: false, error: 'not_configured'});
  if (!plan) return L.json(res, 400, {ok: false, error: 'unknown_plan'});
  if (!login) return L.json(res, 400, {ok: false, error: 'no_login'});

  const orderId = 'pt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const base = L.ENV.base || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host));

  /* info повертається в callback незміненим і підписаним нашим ключем,
     тому саме звідти сервер дізнається, кому зарахувати оплату */
  const payload = {
    public_key: L.ENV.pub,
    version: 3,
    action: plan.period ? 'subscribe' : 'pay',
    amount: plan.uah,
    currency: 'UAH',
    description: 'PRO Trainer · ' + plan.id,
    order_id: orderId,
    language: lang === 'uk' ? 'uk' : lang === 'ru' ? 'ru' : 'en',
    server_url: base + '/api/callback',
    result_url: base + '/paid?lang=' + lang,
    info: JSON.stringify({login, device, plan: plan.id}),
  };
  if (plan.period){
    payload.subscribe = 1;
    payload.subscribe_periodicity = plan.period;
    payload.subscribe_date_start = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  const data = L.pack(payload);
  const signature = L.sign(data);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.status(200).send(`<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PRO Trainer</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font:600 15px/1.5 -apple-system,system-ui,sans-serif;
background:#0e0e14;color:#a8a8b8}</style>
<body>
<p>…</p>
<form id="f" method="POST" accept-charset="utf-8" action="https://www.liqpay.ua/api/3/checkout">
  <input type="hidden" name="data" value="${esc(data)}">
  <input type="hidden" name="signature" value="${esc(signature)}">
</form>
<script>document.getElementById('f').submit();</script>`);
};
