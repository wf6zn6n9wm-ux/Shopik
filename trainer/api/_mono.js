/* ──────────────────────────────────────────────────────────────────
   PRO Trainer · monobank acquiring — спільний код

   Файл з підкресленням: сам він не адреса, і Vercel не рахує його за
   функцію (див. тест «серверних функцій не більше, ніж дозволено»).
   Дзвонять сюди /api/checkout (виставити рахунок), /api/callback
   (розібратись, що banka повідомила) і /api/mono (щоденне списання
   за автопродовження).

   Ключ один — MONO_TOKEN, токен еквайрингового рахунку. Він і підписує
   запити до monobank (заголовок X-Token), і за ним monobank знаходить,
   з чийого рахунку списувати.

   ─── чому вебхуку тут не довіряють ───
   monobank підписує кожен вебхук ключем ECDSA, і теоретично підпис
   можна перевірити локально. Але перевірка йде по сирих байтах тіла
   запиту, а Vercel віддає нашому коду вже розібраний JSON — байти, які
   бачив banka, до нас не доїжджають. Зводити їх назад означає гадати,
   як саме banka серіалізував об'єкт, і одна зайва кома тихо ламає
   перевірку назавжди.

   Тому вебхук тут — не документ, а дзвінок у двері: прийшло
   повідомлення про invoiceId — гаразд, підемо спитаємо в monobank
   напряму, своїм токеном, який справжній статус цього рахунку.
   Підробити чужий invoiceId зловмиснику ніщо не заважає, а от
   підробити «успішну» відповідь на GET /invoice/status — вже ні: цей
   запит підписаний нашим токеном, і відповідає на нього сам monobank.
   ────────────────────────────────────────────────────────────────── */
const L = require('../api/_lib.js');

const TOKEN = process.env.MONO_TOKEN || '';
const API = 'https://api.monobank.ua';
const CCY_UAH = 980;                /* ISO 4217 */
const kopecks = uah => Math.round(uah * 100);

async function call(method, path, body){
  const r = await fetch(API + path, {
    method,
    headers: {'X-Token': TOKEN, 'content-type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error('mono_' + r.status + (json && json.errText ? ': ' + json.errText : ''));
  return json || {};
}

/* ключ для тимчасового запису «який рахунок про кого» — сам monobank
   про логін і тариф нічого не знає, тож зв'язок тримаємо в себе */
const invKey = invoiceId => 'monoinv:' + invoiceId;
const INV_TTL = 3600 + 600;         /* стільки ж, скільки живе сам рахунок, і трохи зверху */

/* ─── виставити рахунок ───
   walletId ставимо, лише коли тариф продовжується сам: тоді monobank
   збереже картку на свій рахунок гаманця, і api/mono.js зможе списати
   з неї без нового посилання на оплату. Разовий тариф (3 місяці) картку
   не зберігає — саме так, як і LiqPay його не продовжує. */
async function createInvoice({login, device, plan, orderId, redirectUrl, webHookUrl}){
  const body = {
    amount: kopecks(plan.uah),
    ccy: CCY_UAH,
    merchantPaymInfo: {reference: orderId, destination: 'PRO Trainer · ' + plan.id},
    redirectUrl, webHookUrl,
    validity: 3600,
    paymentType: 'debit',
    ...(plan.period ? {saveCardData: {saveCard: true, walletId: login}} : {}),
  };
  const r = await call('POST', '/api/merchant/invoice/create', body);
  if (!r.invoiceId || !r.pageUrl) throw new Error('mono_bad_create');
  await L.store.set(invKey(r.invoiceId), {login, device, plan: plan.id, orderId}, INV_TTL);
  return r;
}

const invoiceStatus = invoiceId =>
  call('GET', '/api/merchant/invoice/status?invoiceId=' + encodeURIComponent(invoiceId));

/* Дзвінок у двері прийшов — підемо спитаємо правду й застосуємо, якщо
   вона підтвердилась. Повертає, що саме сталось, — для журналу проби. */
async function confirmAndApply(invoiceId){
  const map = await L.store.get(invKey(invoiceId));
  if (!map) return {applied: false, why: 'unknown_invoice'};

  let status;
  try { status = await invoiceStatus(invoiceId); }
  catch (e){ return {applied: false, why: 'status_failed: ' + (e && e.message)}; }

  const st = String(status.status || '');
  if (st !== 'success'){
    /* processing/created — ще не гроші; failure/expired — оплати не
       буде. Жодного разу лишати доступ не чіпаємо: він або вже є з
       попереднього періоду, або має з'явитись рівно тоді, коли
       підтвердиться успіх, а не раніше. */
    return {applied: false, why: 'status_' + (st || 'unknown')};
  }

  const plan = L.PLANS[map.plan];
  if (!plan) return {applied: false, why: 'unknown_plan'};

  await L.applyPayment({login: map.login, device: map.device, plan: map.plan,
                        orderId: map.orderId, autoRenew: !!plan.period, provider: 'mono'});
  await L.logPayment({login: map.login, plan: map.plan, orderId: map.orderId,
                      kind: 'pay', provider: 'mono'});
  return {applied: true, login: map.login, plan: map.plan};
}

/* ─── гаманець: списання за автопродовження ───
   Виконує api/mono.js раз на добу для тих, у кого підписка ось-ось
   скінчиться, а autoRenew увімкнено. */
async function walletCards(walletId){
  try {
    const r = await call('GET', '/api/merchant/wallet/' + encodeURIComponent(walletId));
    return (r && r.cards) || (r && r.wallet && r.wallet.cardList) || [];
  } catch { return []; }
}

async function chargeWallet({login, plan, orderId}){
  const cards = await walletCards(login);
  const card = cards[0];
  if (!card || !card.cardToken) return {ok: false, why: 'no_card'};

  let r;
  try {
    r = await call('POST', '/api/merchant/wallet/payment', {
      cardToken: card.cardToken,
      amount: kopecks(plan.uah),
      ccy: CCY_UAH,
      initiationKind: 'merchant',
      merchantPaymInfo: {reference: orderId, destination: 'PRO Trainer · ' + plan.id},
    });
  } catch (e){ return {ok: false, why: 'charge_failed: ' + (e && e.message)}; }

  let status = r && r.status;
  const invoiceId = r && r.invoiceId;
  /* Списання може піти в обробку банком — чекаємо коротко тут-таки,
     а не покладаємось на вебхук: списує наш власний крон, вебхук на цей
     виклик monobank взагалі не обіцяв. */
  for (let i = 0; i < 4 && status !== 'success' && status !== 'failure' && invoiceId; i++){
    await new Promise(res => setTimeout(res, 2000));
    try { status = (await invoiceStatus(invoiceId)).status; } catch { break; }
  }
  if (status !== 'success') return {ok: false, why: 'status_' + (status || 'unknown')};
  return {ok: true, orderId};
}

module.exports = {TOKEN, createInvoice, invoiceStatus, confirmAndApply, chargeWallet, kopecks};
