// Serverless-функция (Vercel) — бэкенд «Доля»: общий учёт прибыли магазина
// для двоих (владелец + управляющая), синхронно на двух телефонах.
//
// Идентификация — по подписи Telegram initData (проверяем HMAC токеном бота),
// поэтому подделать чужой tg_id нельзя. Доступ к базе — только отсюда,
// service-role ключом (в браузер он не попадает).
//
// Действия (POST { action, initData, ... }):
//   state                       → магазин (роль, %, валюта, партнёр, код) + список товаров
//   shop_create                 → создать магазин (ты — владелец), вернуть код-приглашение
//   shop_join {code}            → войти в магазин по коду (ты — управляющая)
//   settings_save {share_pct,currency}   → владелец меняет процент доли и валюту
//   deal_add {name,purchase}    → владелец заводит товар (закупку)
//   deal_edit {id,name,purchase} → владелец правит товар
//   deal_delete {id}            → владелец удаляет товар
//   deal_sell {id,sale,salary}  → внести продажу и зарплату (товар → «продано»)
//   deal_settle {id,settled}    → отметить/снять «рассчитано»
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   PROFIT_SUPABASE_URL              — URL проекта Supabase для «Доли»
//   PROFIT_SUPABASE_SERVICE_ROLE_KEY — service_role ключ этого проекта (секрет!)
//   PROFIT_BOT_TOKEN                 — токен Telegram-бота (от @BotFather)
//   PROFIT_BOT_USERNAME  — (необяз.) юзернейм бота для ссылок-приглашений
//   PROFIT_APP_URL       — (необяз.) URL мини-аппа для кнопки «Открыть»
// (для удобства читаются и без префикса PROFIT_, если отдельные не заданы)
//
// Без ключей возвращаем reason:"not_configured", а index.html мягко откатывается
// в локальный демо-режим (одно устройство) и не ломается.

const crypto = require('crypto');

function env(name) {
  return process.env['PROFIT_' + name] || process.env[name] || '';
}

// --- проверка подписи Telegram WebApp initData ---
function verifyInitData(initData, botToken) {
  try {
    if (!initData || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dcs = [...params.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (calc !== hash) return null;
    const authDate = Number(params.get('auth_date') || 0);
    if (authDate && (Date.now() / 1000 - authDate) > 86400) return null; // свежесть — сутки
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return {
      id: Number(user.id),
      name: (user.first_name || '') + (user.last_name ? ' ' + user.last_name : ''),
      photo_url: user.photo_url || null
    };
  } catch (e) { return null; }
}

function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
function n0(v) { return Math.max(0, Math.round(Number(v) || 0)); }

// раздел прибыли по товару (для текста пуша). Клиент считает так же.
function split(deal, pct) {
  const net = n0(deal.sale) - n0(deal.purchase) - n0(deal.salary);
  const mgrShare = Math.round(net * pct / 100);
  const ownShare = net - mgrShare;
  return { net, mgrShare, ownShare, mgrTotal: n0(deal.purchase) + n0(deal.salary) + mgrShare };
}

// rate-limit по tg_id (best-effort, в памяти инстанса)
const RL = new Map();
function rateLimited(id, max, windowMs) {
  max = max || 60; windowMs = windowMs || 60000;
  const now = Date.now();
  const arr = (RL.get(id) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  RL.set(id, arr);
  if (RL.size > 5000) RL.clear();
  return arr.length > max;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method' }); return; }

    const URL = env('SUPABASE_URL');
    const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
    const BOT = env('BOT_TOKEN');
    const BOT_USER = env('BOT_USERNAME') || '';
    const APP = env('APP_URL') || '';
    if (!URL || !SERVICE || !BOT) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const me = verifyInitData(body.initData, BOT);
    if (!me) { res.status(401).json({ ok: false, reason: 'bad_auth' }); return; }
    if (rateLimited(me.id)) { res.status(429).json({ ok: false, reason: 'rate_limited' }); return; }

    // ---- helpers к Supabase REST ----
    const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
    async function sb(path, opts) {
      const r = await fetch(URL + '/rest/v1/' + path, Object.assign({ headers: H }, opts || {}));
      const t = await r.text();
      let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
      if (!r.ok) throw new Error('db ' + r.status + ' ' + String(t).slice(0, 200));
      return j;
    }
    async function myMembership() {
      const rows = await sb('profit_members?tg_id=eq.' + me.id + '&select=shop_id,tg_id,name,role');
      return (rows && rows[0]) || null;
    }
    async function shopMembers(shopId) {
      return await sb('profit_members?shop_id=eq.' + shopId + '&select=tg_id,name,role&order=role');
    }
    async function shopRow(shopId) {
      const rows = await sb('profit_shops?id=eq.' + shopId + '&select=id,invite_code,share_pct,currency,owner_tg');
      return (rows && rows[0]) || null;
    }
    async function shopDeals(shopId) {
      const rows = await sb('profit_deals?shop_id=eq.' + shopId + '&select=id,name,purchase,sale,salary,status,settled,created_at,sold_at&order=created_at.desc');
      return (rows || []).map((d) => ({
        id: d.id, name: d.name, purchase: n0(d.purchase), salePrice: n0(d.sale), salary: n0(d.salary),
        status: d.status, settled: !!d.settled, createdAt: d.created_at, soldAt: d.sold_at
      }));
    }
    function shopView(shop, members) {
      const partner = members.find((m) => Number(m.tg_id) !== me.id) || null;
      const mine = members.find((m) => Number(m.tg_id) === me.id) || null;
      return {
        id: shop.id, inviteCode: shop.invite_code,
        sharePct: shop.share_pct == null ? 30 : shop.share_pct,
        currency: shop.currency || 'грн',
        role: (mine && mine.role) || 'owner',
        me: { name: me.name },
        partner: partner ? { name: partner.name, role: partner.role } : null,
        linked: members.length >= 2
      };
    }
    // пуш всем участникам магазина, кроме себя
    async function pushOthers(members, text, kb) {
      const others = members.filter((m) => Number(m.tg_id) !== me.id);
      for (let i = 0; i < others.length; i++) {
        sendPush(BOT, others[i].tg_id, text, kb).catch(() => {});
      }
    }
    // общий ответ «текущее состояние»
    async function stateResponse(shopId) {
      const shop = await shopRow(shopId);
      const members = await shopMembers(shopId);
      const deals = await shopDeals(shopId);
      return { ok: true, shop: shopView(shop, members), deals: deals };
    }

    const action = body.action;

    // -------- STATE --------
    if (action === 'state') {
      const mem = await myMembership();
      if (!mem) { res.status(200).json({ ok: true, shop: null, me: { name: me.name } }); return; }
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    // -------- SHOP CREATE (создатель = владелец) --------
    if (action === 'shop_create') {
      const existing = await myMembership();
      if (existing) { res.status(200).json(await stateResponse(existing.shop_id)); return; }
      let shop = null;
      for (let i = 0; i < 5 && !shop; i++) {
        try {
          const rows = await sb('profit_shops', {
            method: 'POST',
            headers: Object.assign({}, H, { Prefer: 'return=representation' }),
            body: JSON.stringify({ invite_code: makeCode(), owner_tg: me.id, share_pct: 30, currency: 'грн' })
          });
          shop = rows && rows[0];
        } catch (e) { if (String(e).indexOf('409') === -1) throw e; }
      }
      if (!shop) { res.status(200).json({ ok: false, reason: 'code_collision' }); return; }
      await sb('profit_members', {
        method: 'POST',
        body: JSON.stringify({ shop_id: shop.id, tg_id: me.id, name: me.name, photo_url: me.photo_url, role: 'owner' })
      });
      res.status(200).json(await stateResponse(shop.id));
      return;
    }

    // -------- SHOP JOIN (входящий = управляющая) --------
    if (action === 'shop_join') {
      const code = String(body.code || '').toUpperCase().trim();
      if (code.length < 4) { res.status(200).json({ ok: false, reason: 'bad_code' }); return; }
      const existing = await myMembership();
      if (existing) { res.status(200).json(await stateResponse(existing.shop_id)); return; }
      const rows = await sb('profit_shops?invite_code=eq.' + encodeURIComponent(code) + '&select=id,invite_code');
      const shop = rows && rows[0];
      if (!shop) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      const members = await shopMembers(shop.id);
      if (members.length >= 2) { res.status(200).json({ ok: false, reason: 'shop_full' }); return; }
      await sb('profit_members', {
        method: 'POST',
        body: JSON.stringify({ shop_id: shop.id, tg_id: me.id, name: me.name, photo_url: me.photo_url, role: 'manager' })
      });
      const first = members[0];
      if (first) sendPush(BOT, first.tg_id, '🤝 ' + me.name + ' присоединился(ась) как управляющая. Теперь вы ведёте учёт прибыли вместе — заводите товары и вносите закупки.').catch(() => {});
      res.status(200).json(await stateResponse(shop.id));
      return;
    }

    // дальше — только для участников магазина
    const mem = await myMembership();
    if (!mem) { res.status(200).json({ ok: false, reason: 'no_shop' }); return; }
    const isOwner = mem.role === 'owner';

    // -------- SETTINGS SAVE (только владелец) --------
    if (action === 'settings_save') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const patch = {};
      if (body.share_pct != null) patch.share_pct = Math.min(100, Math.max(0, Math.round(Number(body.share_pct) || 0)));
      if (body.currency != null) patch.currency = String(body.currency).slice(0, 12) || 'грн';
      if (Object.keys(patch).length) {
        await sb('profit_shops?id=eq.' + mem.shop_id, {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(patch)
        });
      }
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    // -------- DEAL ADD (только владелец) --------
    if (action === 'deal_add') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const name = String(body.name || '').trim().slice(0, 120);
      const purchase = n0(body.purchase);
      if (!name || !purchase) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      await sb('profit_deals', {
        method: 'POST',
        body: JSON.stringify({ shop_id: mem.shop_id, name: name, purchase: purchase, status: 'onsale' })
      });
      const members = await shopMembers(mem.shop_id);
      pushOthers(members, '👟 Новый товар «' + name + '» в продаже. Закупка ' + purchase + '. Как продадите — внесите продажу и зарплату.');
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    // -------- DEAL EDIT (только владелец) --------
    if (action === 'deal_edit') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      const patch = {};
      if (body.name != null) patch.name = String(body.name).trim().slice(0, 120);
      if (body.purchase != null) patch.purchase = n0(body.purchase);
      await sb('profit_deals?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + mem.shop_id, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(patch)
      });
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    // -------- DEAL DELETE (только владелец) --------
    if (action === 'deal_delete') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      await sb('profit_deals?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + mem.shop_id, {
        method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' })
      });
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    // -------- DEAL SELL (любой участник) --------
    if (action === 'deal_sell') {
      const id = String(body.id || '');
      const sale = n0(body.sale);
      if (!sale) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      const salary = n0(body.salary);
      const rows = await sb('profit_deals?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + mem.shop_id + '&select=id,name,purchase');
      const deal = rows && rows[0];
      if (!deal) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      await sb('profit_deals?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + mem.shop_id, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ sale: sale, salary: salary, status: 'sold', sold_at: new Date().toISOString() })
      });
      const shop = await shopRow(mem.shop_id);
      const members = await shopMembers(mem.shop_id);
      const s = split({ purchase: deal.purchase, sale: sale, salary: salary }, shop.share_pct == null ? 30 : shop.share_pct);
      // владельцу важна его доля, управляющей — что можно забрать
      const others = members.filter((m) => Number(m.tg_id) !== me.id);
      others.forEach((o) => {
        const txt = o.role === 'owner'
          ? '💰 Продажа «' + deal.name + '» за ' + sale + '. Чистая прибыль ' + s.net + '. Ваша доля: ' + s.ownShare + '.'
          : '💰 Продажа «' + deal.name + '» за ' + sale + '. Можно забрать (вложенное+ЗП+доля): ' + s.mgrTotal + '.';
        sendPush(BOT, o.tg_id, txt).catch(() => {});
      });
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    // -------- DEAL SETTLE (любой участник) --------
    if (action === 'deal_settle') {
      const id = String(body.id || '');
      const settled = !!body.settled;
      const rows = await sb('profit_deals?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + mem.shop_id + '&select=id,name');
      const deal = rows && rows[0];
      if (!deal) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      await sb('profit_deals?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + mem.shop_id, {
        method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ settled: settled, settled_at: settled ? new Date().toISOString() : null })
      });
      if (settled) {
        const members = await shopMembers(mem.shop_id);
        pushOthers(members, '✅ Товар «' + deal.name + '» рассчитан — деньги распределены.');
      }
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    res.status(400).json({ ok: false, reason: 'unknown_action' });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'error', error: String(e && e.message).slice(0, 300) });
  }
};

// экспорт для юнит-тестов
module.exports._verifyInitData = verifyInitData;
module.exports._split = split;

async function sendPush(botToken, chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
}
