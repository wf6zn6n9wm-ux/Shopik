// Serverless-функция (Vercel) — бэкенд «Доля»: общий учёт прибыли магазина
// для двоих (владелец + управляющая), синхронно на двух телефонах.
//
// Модель «Склад»:
//   • Владелец заводит МОДЕЛЬ (фото + название) и добавляет ПАРЫ по размерам:
//     у каждого лота своя закупка за пару, позже добавляется доставка за пару.
//     Себестоимость пары = закупка + доставка. Товар оплачивает владелец.
//   • Управляющая продаёт: выбирает модель+размер, вносит цену продажи и зарплату.
//     Прибыль = продажа − себестоимость − зарплата, делится (по умолч. 30% ей / 70% ему).
//     Владельцу возвращается вложенная себестоимость + его доля; управляющей — зарплата + её доля.
//     Остаток выбранного размера уменьшается на 1.
//
// Идентификация — по подписи Telegram initData (HMAC токеном бота). Доступ к базе —
// только отсюда, service-role ключом (в браузер он не попадает).
//
// Действия (POST { action, initData, ... }):
//   state
//   shop_create · shop_join {code} · settings_save {share_pct,currency}
//   product_add {name,photo} · product_edit {id,name,photo} · product_delete {id}
//   stock_add {product_id,size,qty,purchase} · stock_edit {id,size,qty,purchase,shipping}
//   stock_ship {id,shipping} · stock_delete {id}
//   sale_add {product_id,size,sale,salary} · sale_settle {id,settled} · sale_delete {id}
//
// Переменные окружения (Vercel → Settings → Environment Variables):
//   PROFIT_SUPABASE_URL / PROFIT_SUPABASE_SERVICE_ROLE_KEY / PROFIT_BOT_TOKEN
// (читаются и без префикса PROFIT_, если отдельные не заданы). Без ключей —
// reason:"not_configured", а index.html мягко откатывается в демо-режим.

const crypto = require('crypto');

function env(name) {
  return process.env['PROFIT_' + name] || process.env[name] || '';
}

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
    if (authDate && (Date.now() / 1000 - authDate) > 86400) return null;
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
function sizeNorm(v) { return String(v == null ? '' : v).trim().slice(0, 12); }

// раздел прибыли по проданной паре (для пуша). Клиент считает так же.
// Закупку вкладывает УПРАВЛЯЮЩАЯ → ей возврат себестоимости + её доля прибыли.
// Зарплата — это оплата ПРОДАВЦУ (расход), уменьшает прибыль и уходит продавцу,
// в доход управляющей/владельца не входит. Владельцу — его доля от прибыли.
function split(sale, cost, salary, pct) {
  const net = n0(sale) - n0(cost) - n0(salary);
  const mgrShare = Math.round(net * pct / 100);
  const ownShare = net - mgrShare;
  return {
    net, mgrShare, ownShare,
    mgrTotal: n0(cost) + mgrShare, // управляющей: возврат вложенного + её доля
    ownTotal: ownShare             // владельцу: только его доля прибыли
  };
}

const RL = new Map();
function rateLimited(id, max, windowMs) {
  max = max || 80; windowMs = windowMs || 60000;
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
    if (!URL || !SERVICE || !BOT) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const me = verifyInitData(body.initData, BOT);
    if (!me) { res.status(401).json({ ok: false, reason: 'bad_auth' }); return; }
    if (rateLimited(me.id)) { res.status(429).json({ ok: false, reason: 'rate_limited' }); return; }

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
      // с salary_pct; если колонка ещё не создана (миграция не выполнена) — откат без неё
      let rows;
      try { rows = await sb('profit_shops?id=eq.' + shopId + '&select=id,invite_code,share_pct,salary_pct,currency,owner_tg'); }
      catch (e) { rows = await sb('profit_shops?id=eq.' + shopId + '&select=id,invite_code,share_pct,currency,owner_tg'); }
      return (rows && rows[0]) || null;
    }
    function shopView(shop, members) {
      const partner = members.find((m) => Number(m.tg_id) !== me.id) || null;
      const mine = members.find((m) => Number(m.tg_id) === me.id) || null;
      return {
        id: shop.id, inviteCode: shop.invite_code,
        sharePct: shop.share_pct == null ? 30 : shop.share_pct,
        salaryPct: shop.salary_pct == null ? 0 : shop.salary_pct,
        currency: shop.currency || 'грн',
        role: (mine && mine.role) || 'owner',
        me: { name: me.name },
        partner: partner ? { name: partner.name, role: partner.role } : null,
        linked: members.length >= 2
      };
    }
    async function shopFolders(shopId) {
      // папки склада; если таблицы ещё нет (миграция не выполнена) — пустой список
      try {
        const rows = await sb('profit_folders?shop_id=eq.' + shopId + '&select=id,name,created_at&order=created_at.asc');
        return (rows || []).map((f) => ({ id: f.id, name: f.name }));
      } catch (e) { return []; }
    }
    async function shopProducts(shopId) {
      // с folder_id; откат без него, если колонка ещё не создана
      let prods;
      try { prods = await sb('profit_products?shop_id=eq.' + shopId + '&select=id,name,photo,folder_id,created_at&order=created_at.desc'); }
      catch (e) { prods = await sb('profit_products?shop_id=eq.' + shopId + '&select=id,name,photo,created_at&order=created_at.desc'); }
      const stock = await sb('profit_stock?shop_id=eq.' + shopId + '&select=id,product_id,size,qty,purchase,shipping,created_at&order=created_at.asc');
      const byProd = {};
      (stock || []).forEach((s) => {
        (byProd[s.product_id] = byProd[s.product_id] || []).push({
          id: s.id, size: s.size, qty: n0(s.qty), purchase: n0(s.purchase),
          shipping: s.shipping == null ? null : n0(s.shipping)
        });
      });
      return (prods || []).map((p) => ({ id: p.id, name: p.name, photo: p.photo || null, folderId: p.folder_id || null, stock: byProd[p.id] || [] }));
    }
    async function shopSales(shopId) {
      const rows = await sb('profit_sales?shop_id=eq.' + shopId + '&select=id,product_id,name,size,sale,salary,cost,settled,sold_at&order=sold_at.desc');
      return (rows || []).map((s) => ({
        id: s.id, productId: s.product_id, name: s.name, size: s.size,
        sale: n0(s.sale), salary: n0(s.salary), cost: n0(s.cost),
        settled: !!s.settled, soldAt: s.sold_at
      }));
    }
    async function pushOthers(members, text) {
      const others = members.filter((m) => Number(m.tg_id) !== me.id);
      for (let i = 0; i < others.length; i++) sendPush(BOT, others[i].tg_id, text).catch(() => {});
    }
    async function stateResponse(shopId) {
      const shop = await shopRow(shopId);
      const members = await shopMembers(shopId);
      const folders = await shopFolders(shopId);
      const products = await shopProducts(shopId);
      const sales = await shopSales(shopId);
      return { ok: true, shop: shopView(shop, members), folders, products, sales };
    }

    const action = body.action;

    // -------- STATE --------
    if (action === 'state') {
      const mem = await myMembership();
      if (!mem) { res.status(200).json({ ok: true, shop: null, me: { name: me.name } }); return; }
      res.status(200).json(await stateResponse(mem.shop_id));
      return;
    }

    // -------- SHOP CREATE --------
    if (action === 'shop_create') {
      const existing = await myMembership();
      if (existing) { res.status(200).json(await stateResponse(existing.shop_id)); return; }
      let shop = null;
      for (let i = 0; i < 5 && !shop; i++) {
        try {
          const rows = await sb('profit_shops', {
            method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }),
            body: JSON.stringify({ invite_code: makeCode(), owner_tg: me.id, share_pct: 30, currency: 'грн' })
          });
          shop = rows && rows[0];
        } catch (e) { if (String(e).indexOf('409') === -1) throw e; }
      }
      if (!shop) { res.status(200).json({ ok: false, reason: 'code_collision' }); return; }
      await sb('profit_members', { method: 'POST', body: JSON.stringify({ shop_id: shop.id, tg_id: me.id, name: me.name, photo_url: me.photo_url, role: 'owner' }) });
      res.status(200).json(await stateResponse(shop.id));
      return;
    }

    // -------- SHOP JOIN --------
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
      await sb('profit_members', { method: 'POST', body: JSON.stringify({ shop_id: shop.id, tg_id: me.id, name: me.name, photo_url: me.photo_url, role: 'manager' }) });
      const first = members[0];
      if (first) sendPush(BOT, first.tg_id, '🤝 ' + me.name + ' присоединился(ась) как управляющая. Теперь вы ведёте склад и учёт прибыли вместе.').catch(() => {});
      res.status(200).json(await stateResponse(shop.id));
      return;
    }

    // дальше — только для участников магазина
    const mem = await myMembership();
    if (!mem) { res.status(200).json({ ok: false, reason: 'no_shop' }); return; }
    const isOwner = mem.role === 'owner';
    const SHOP = mem.shop_id;

    // -------- SETTINGS SAVE (владелец) --------
    if (action === 'settings_save') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const patch = {};
      if (body.share_pct != null) patch.share_pct = Math.min(100, Math.max(0, Math.round(Number(body.share_pct) || 0)));
      if (body.salary_pct != null) patch.salary_pct = Math.min(100, Math.max(0, Math.round(Number(body.salary_pct) || 0)));
      if (body.currency != null) patch.currency = String(body.currency).slice(0, 12) || 'грн';
      if (Object.keys(patch).length) {
        await sb('profit_shops?id=eq.' + SHOP, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(patch) });
      }
      res.status(200).json(await stateResponse(SHOP));
      return;
    }

    // --- запись профиля товара с мягким откатом, если колонки folder_id ещё нет ---
    async function saveProduct(path, method, rec) {
      try {
        return await sb(path, { method, headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(rec) });
      } catch (e) {
        if ('folder_id' in rec) { const o = Object.assign({}, rec); delete o.folder_id; return await sb(path, { method, headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(o) }); }
        throw e;
      }
    }

    // -------- FOLDER ADD/EDIT/DELETE (владелец) --------
    if (action === 'folder_add') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      try { await sb('profit_folders', { method: 'POST', body: JSON.stringify({ shop_id: SHOP, name }) }); }
      catch (e) { res.status(200).json({ ok: false, reason: 'folders_off' }); return; }
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    if (action === 'folder_edit') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || ''); const name = String(body.name || '').trim().slice(0, 80);
      if (!name) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      await sb('profit_folders?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ name }) });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    if (action === 'folder_delete') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      // товары внутри — FK on delete set null снимет folder_id (останутся «без папки»)
      await sb('profit_folders?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }

    // -------- PRODUCT ADD/EDIT/DELETE (владелец) --------
    if (action === 'product_add') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const name = String(body.name || '').trim().slice(0, 120);
      if (!name) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      const photo = typeof body.photo === 'string' && body.photo.length < 700000 ? body.photo : null;
      const rec = { shop_id: SHOP, name, photo };
      if (body.folder_id) rec.folder_id = String(body.folder_id);
      await saveProduct('profit_products', 'POST', rec);
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    if (action === 'product_edit') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      const patch = {};
      if (body.name != null) patch.name = String(body.name).trim().slice(0, 120);
      if (body.photo !== undefined) patch.photo = (typeof body.photo === 'string' && body.photo.length < 700000) ? body.photo : null;
      if (body.folder_id !== undefined) patch.folder_id = body.folder_id ? String(body.folder_id) : null;
      await saveProduct('profit_products?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, 'PATCH', patch);
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    if (action === 'product_delete') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      await sb('profit_stock?product_id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
      await sb('profit_products?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }

    // -------- STOCK ADD/EDIT/SHIP/DELETE (владелец) --------
    if (action === 'stock_add') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const product_id = String(body.product_id || '');
      const size = sizeNorm(body.size);
      const qty = Math.max(1, n0(body.qty) || 1);
      const purchase = n0(body.purchase);
      if (!product_id || !size) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      const prod = await sb('profit_products?id=eq.' + encodeURIComponent(product_id) + '&shop_id=eq.' + SHOP + '&select=id,name');
      if (!prod || !prod[0]) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      const ship = body.shipping == null ? null : n0(body.shipping);
      await sb('profit_stock', { method: 'POST', body: JSON.stringify({ shop_id: SHOP, product_id, size, qty, purchase, shipping: ship }) });
      const members = await shopMembers(SHOP);
      pushOthers(members, '📦 На склад добавлено: «' + prod[0].name + '», размер ' + size + ' — ' + qty + ' пар(ы).');
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    // -------- STOCK BULK (несколько размеров сразу, одна себестоимость) --------
    if (action === 'stock_bulk') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const product_id = String(body.product_id || '');
      const purchase = n0(body.purchase);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!product_id || !purchase || !items.length) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      const prod = await sb('profit_products?id=eq.' + encodeURIComponent(product_id) + '&shop_id=eq.' + SHOP + '&select=id,name');
      if (!prod || !prod[0]) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      const rows = items
        .map((it) => ({ shop_id: SHOP, product_id, size: sizeNorm(it.size), qty: Math.max(1, n0(it.qty) || 1), purchase, shipping: null }))
        .filter((r) => r.size);
      if (!rows.length) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      await sb('profit_stock', { method: 'POST', body: JSON.stringify(rows) });
      const members = await shopMembers(SHOP);
      const total = rows.reduce((s, r) => s + r.qty, 0);
      pushOthers(members, '📦 На склад: «' + prod[0].name + '» — ' + rows.map((r) => r.size + '×' + r.qty).join(', ') + ' (' + total + ' пар).');
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    if (action === 'stock_edit') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      const patch = {};
      if (body.size != null) patch.size = sizeNorm(body.size);
      if (body.qty != null) patch.qty = Math.max(0, n0(body.qty));
      if (body.purchase != null) patch.purchase = n0(body.purchase);
      if (body.shipping !== undefined) patch.shipping = body.shipping == null ? null : n0(body.shipping);
      await sb('profit_stock?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(patch) });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    if (action === 'stock_ship') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      await sb('profit_stock?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ shipping: n0(body.shipping) }) });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }
    if (action === 'stock_delete') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      await sb('profit_stock?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }

    // -------- SALE ADD (любой участник) — продать пару со склада --------
    if (action === 'sale_add') {
      const product_id = String(body.product_id || '');
      const size = sizeNorm(body.size);
      const sale = n0(body.sale);
      if (!product_id || !size || !sale) { res.status(200).json({ ok: false, reason: 'bad_input' }); return; }
      const prod = await sb('profit_products?id=eq.' + encodeURIComponent(product_id) + '&shop_id=eq.' + SHOP + '&select=id,name');
      if (!prod || !prod[0]) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      // FIFO: самый ранний лот этого размера с остатком > 0
      const lots = await sb('profit_stock?product_id=eq.' + encodeURIComponent(product_id) + '&shop_id=eq.' + SHOP + '&size=eq.' + encodeURIComponent(size) + '&qty=gt.0&select=id,qty,purchase,shipping&order=created_at.asc');
      const lot = lots && lots[0];
      if (!lot) { res.status(200).json({ ok: false, reason: 'out_of_stock' }); return; }
      const cost = n0(lot.purchase) + (lot.shipping == null ? 0 : n0(lot.shipping));
      const shop = await shopRow(SHOP);
      const salPct = shop.salary_pct == null ? 0 : shop.salary_pct;
      // зарплата продавцу — единый % от цены продажи (задаёт владелец в настройках).
      const salary = Math.round(sale * salPct / 100);
      await sb('profit_stock?id=eq.' + lot.id + '&shop_id=eq.' + SHOP, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ qty: n0(lot.qty) - 1 }) });
      await sb('profit_sales', { method: 'POST', body: JSON.stringify({ shop_id: SHOP, product_id, name: prod[0].name, size, sale, salary, cost }) });
      const members = await shopMembers(SHOP);
      const s = split(sale, cost, salary, shop.share_pct == null ? 30 : shop.share_pct);
      members.filter((m) => Number(m.tg_id) !== me.id).forEach((o) => {
        const txt = o.role === 'owner'
          ? '💰 Продажа «' + prod[0].name + '» (' + size + ') за ' + sale + '. Чистая прибыль ' + s.net + '. Ваша доля: ' + s.ownShare + '. К выдаче управляющей: ' + s.mgrTotal + ' (вложенное + её доля).'
          : '💰 Продажа «' + prod[0].name + '» (' + size + ') за ' + sale + '. Тебе к получению: вложенное ' + cost + ' + доля ' + s.mgrShare + ' = ' + s.mgrTotal + '.';
        sendPush(BOT, o.tg_id, txt).catch(() => {});
      });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }

    // -------- SALE SETTLE --------
    if (action === 'sale_settle') {
      const id = String(body.id || '');
      const settled = !!body.settled;
      const rows = await sb('profit_sales?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP + '&select=id,name,size');
      const sale = rows && rows[0];
      if (!sale) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      await sb('profit_sales?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ settled, settled_at: settled ? new Date().toISOString() : null }) });
      if (settled) { const members = await shopMembers(SHOP); pushOthers(members, '✅ Продажа «' + sale.name + '» (' + sale.size + ') рассчитана — деньги распределены.'); }
      res.status(200).json(await stateResponse(SHOP));
      return;
    }

    // -------- SALE DELETE (владелец) — вернуть пару на склад --------
    if (action === 'sale_delete') {
      if (!isOwner) { res.status(200).json({ ok: false, reason: 'forbidden' }); return; }
      const id = String(body.id || '');
      const rows = await sb('profit_sales?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP + '&select=id,product_id,size,cost');
      const sale = rows && rows[0];
      if (!sale) { res.status(200).json({ ok: false, reason: 'not_found' }); return; }
      // вернуть 1 пару в самый ранний лот того же размера (или в любой этого размера)
      if (sale.product_id) {
        const lots = await sb('profit_stock?product_id=eq.' + encodeURIComponent(sale.product_id) + '&shop_id=eq.' + SHOP + '&size=eq.' + encodeURIComponent(sale.size) + '&select=id,qty&order=created_at.asc');
        if (lots && lots[0]) await sb('profit_stock?id=eq.' + lots[0].id + '&shop_id=eq.' + SHOP, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ qty: n0(lots[0].qty) + 1 }) });
      }
      await sb('profit_sales?id=eq.' + encodeURIComponent(id) + '&shop_id=eq.' + SHOP, { method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });
      res.status(200).json(await stateResponse(SHOP));
      return;
    }

    res.status(400).json({ ok: false, reason: 'unknown_action' });
  } catch (e) {
    res.status(200).json({ ok: false, reason: 'error', error: String(e && e.message).slice(0, 300) });
  }
};

module.exports._verifyInitData = verifyInitData;
module.exports._split = split;

async function sendPush(botToken, chatId, text) {
  return fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text })
  });
}
