// Serverless-функція (Vercel): дані для адмін-панелі платформи (admin.html).
//
// Читає ВСІ магазини в обхід RLS через service-role ключ (він лишається на
// сервері, у браузер не потрапляє) і повертає агреговані показники платформи.
//
// Доступ лише для адміністраторів: перевіряємо токен користувача, що увійшов,
// і його пошту проти списку ADMIN_EMAILS.
//
// Потрібні змінні оточення (Vercel → Settings → Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  — service_role ключ (Supabase → Settings → API)
//   ADMIN_EMAILS               — пошти адмінів через кому, напр. "me@shop.com,cofounder@shop.com"
//   SUPABASE_URL               — (необов'язково) URL проєкту; за замовчуванням береться нижче
//
// Якщо ключ або список не задані — функція повертає reason:"not_configured",
// а admin.html м'яко відкочується в демо-режим (сторінка не ламається).

const DEFAULT_URL = 'https://cjxqdlvqofqvbymahkhm.supabase.co';

// сума замовлення зашита в тексті коментаря: "Сума: 1 234 ₴ ..."
function orderSum(comment) {
  if (!comment) return 0;
  const m = String(comment).match(/Сума:\s*([\d\s]+)/);
  if (!m) return 0;
  return parseInt(m[1].replace(/\s/g, ''), 10) || 0;
}

function fmtDate(ts) {
  const n = Number(ts);
  if (!n || !isFinite(n)) return '—';
  const d = new Date(n);
  if (isNaN(d.getTime())) return '—';
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

module.exports = async (req, res) => {
  try {
    const URL = process.env.SUPABASE_URL || DEFAULT_URL;
    const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

    if (!SERVICE || ADMIN_EMAILS.length === 0) {
      res.status(500).json({ ok: false, reason: 'not_configured' });
      return;
    }

    // 1) токен користувача, що увійшов
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) { res.status(401).json({ ok: false, reason: 'no_token' }); return; }

    // 2) перевірка токена → пошта
    const meRes = await fetch(`${URL}/auth/v1/user`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) { res.status(401).json({ ok: false, reason: 'bad_token' }); return; }
    const me = await meRes.json();
    const myEmail = (me && me.email || '').toLowerCase();
    if (!myEmail || ADMIN_EMAILS.indexOf(myEmail) === -1) {
      res.status(403).json({ ok: false, reason: 'not_admin' });
      return;
    }

    // 3) всі магазини (service-role обходить RLS)
    const shopsRes = await fetch(`${URL}/rest/v1/shops?select=id,owner,data`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    if (!shopsRes.ok) {
      const t = await shopsRes.text().catch(() => '');
      res.status(500).json({ ok: false, reason: 'db_error', detail: t.slice(0, 200) });
      return;
    }
    const rows = await shopsRes.json();

    // 4) мапа owner(uuid) → пошта продавця
    const emailById = {};
    try {
      const usersRes = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=1000`, {
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      if (usersRes.ok) {
        const uj = await usersRes.json();
        const list = Array.isArray(uj) ? uj : (uj.users || []);
        list.forEach((u) => { if (u && u.id) emailById[u.id] = u.email || '—'; });
      }
    } catch (e) { /* не критично: залишимо owner-uuid */ }

    // 5) агрегація по магазинах
    const shops = (Array.isArray(rows) ? rows : []).map((r) => {
      const d = (r && r.data) || {};
      const orders = Array.isArray(d.orders) ? d.orders : [];
      const realOrders = orders.filter((o) => o && o.kind === 'order');
      const rev = realOrders.reduce((s, o) => s + orderSum(o.comment), 0);
      const products = Array.isArray(d.products) ? d.products.length : 0;
      const paid = !!d.paid;
      const email = emailById[r.owner] || (r.owner ? String(r.owner).slice(0, 8) + '…' : '—');
      return {
        id: r.id,
        name: d.name || 'Без назви',
        owner: email,
        ownerEmail: email,
        ownerId: r.owner || null,
        plan: paid ? 'Pro' : 'Free',
        status: 'active',
        rev: '₴' + rev.toLocaleString('uk'),
        revNum: rev,
        flags: 0,
        orders: realOrders.length,
        products,
        city: '—',
        joined: fmtDate(d.id || r.id),
        rating: 0,
      };
    });

    // 6) продавці (групування за власником)
    const byOwner = {};
    shops.forEach((s) => {
      const k = s.ownerId || s.owner;
      const b = byOwner[k] || (byOwner[k] = { shops: 0, orders: 0, paid: false, rev: 0, email: s.ownerEmail });
      b.shops += 1; b.orders += s.orders; b.rev += s.revNum;
      if (s.plan !== 'Free') b.paid = true;
    });
    const users = Object.keys(byOwner).map((k, i) => {
      const b = byOwner[k];
      const email = b.email || '—';
      return {
        id: i + 1, name: (email.split('@')[0] || 'Продавець'), email, phone: '—',
        role: 'seller', plan: b.paid ? 'Pro' : 'Free', shopName: null,
        shops: b.shops, joined: '—', status: 'active', orders: b.orders,
        spent: '₴' + b.rev.toLocaleString('uk'), since: '—', nextBill: '—',
      };
    });

    // 7) показники платформи
    const stats = {
      shops: shops.length,
      sellers: users.length,
      orders: shops.reduce((s, x) => s + x.orders, 0),
      paidSubs: shops.filter((x) => x.plan !== 'Free').length,
      revenue: shops.reduce((s, x) => s + x.revNum, 0),
    };

    res.status(200).json({ ok: true, me: { email: myEmail }, stats, shops, users });
  } catch (e) {
    res.status(500).json({ ok: false, reason: 'error', error: String(e && e.message) });
  }
};
