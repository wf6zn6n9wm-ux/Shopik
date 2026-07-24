// Serverless-функция (Vercel Cron) — бэкстоп для PVP.
//
// Основной резолв раундов ленивый (в api/shark.js, когда кто-то опрашивает
// состояние после дедлайна). Но если ВСЕ закрыли приложение, истёкший раунд
// повиснет с незачисленным банком. Этот cron раз в минуту дорешает такие
// раунды: выбирает победителя, начисляет выплату, помечает done.
//
// Подключение — в vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 3 * * *" }] }
// (на бесплатном тарифе Vercel cron ограничен ~1 раз в день; для 15-сек раундов
//  основной резолв — ленивый в api/shark.js, cron лишь подстраховка.)
// Использует те же env, что и api/shark.js.

const crypto = require('crypto');
function env(name) { return process.env['SHARK_' + name] || process.env[name] || ''; }

function sbHeaders() {
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
}
async function sbGet(path) {
  const URL = env('SUPABASE_URL'); if (!URL) return [];
  const r = await fetch(URL + '/rest/v1/' + path, { headers: sbHeaders() });
  const t = await r.text(); try { return t ? JSON.parse(t) : []; } catch (e) { return []; }
}
async function sbReq(path, method, body, prefer) {
  const URL = env('SUPABASE_URL'); if (!URL) return { ok: false, data: null };
  const r = await fetch(URL + '/rest/v1/' + path, {
    method, headers: Object.assign({}, sbHeaders(), prefer ? { Prefer: prefer } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text(); let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
  return { ok: r.ok, data };
}
async function applyLedger(tg_id, currency, amount, kind, ref, idem, meta) {
  const URL = env('SUPABASE_URL'); if (!URL) return { ok: false };
  const r = await fetch(URL + '/rest/v1/rpc/shark_apply_ledger', {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({ p_tg: tg_id, p_currency: currency, p_amount: amount, p_kind: kind, p_ref: ref || null, p_idem: idem || null, p_meta: meta || {} })
  });
  return { ok: r.ok };
}
async function bumpPlayed(tg_id, playedInc, wonInc) {
  const u = await sbGet('shark_users?tg_id=eq.' + tg_id + '&select=played,won_stars');
  if (!u[0]) return;
  const patch = {};
  if (playedInc) patch.played = Number(u[0].played || 0) + playedInc;
  if (wonInc) patch.won_stars = Number(u[0].won_stars || 0) + wonInc;
  if (Object.keys(patch).length) await sbReq('shark_users?tg_id=eq.' + tg_id, 'PATCH', patch, 'return=minimal');
}
function winnerIndex(seed, bets, pot) {
  const roll = parseInt(crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) / 0xffffffff;
  let acc = 0;
  for (let i = 0; i < bets.length; i++) { acc += Number(bets[i].stake) / pot; if (roll <= acc) return i; }
  return bets.length - 1;
}

async function resolveRound(round) {
  const claim = await sbReq('shark_pvp_rounds?id=eq.' + round.id + '&status=eq.countdown', 'PATCH', { status: 'resolving' }, 'return=representation');
  if (!Array.isArray(claim.data) || !claim.data[0]) return false;
  const r = claim.data[0];
  const bets = await sbGet('shark_pvp_bets?round_id=eq.' + r.id + '&order=id.asc&select=*');
  const pot = bets.reduce((a, b) => a + Number(b.stake), 0);
  let winner = null;
  if (bets.length && pot > 0) {
    const w = bets[winnerIndex(r.seed, bets, pot)];
    const payout = Math.floor(pot * (1 - Number(r.rake)));
    winner = { name: w.name, av: w.av, tg_id: w.tg_id, stake: Number(w.stake), pct: Math.round((w.stake / pot) * 1000) / 10, payout };
    if (w.tg_id) {
      await applyLedger(w.tg_id, 'stars', payout, 'win', 'pvp:' + r.id, 'pvp_win:' + r.id, { pot });
      await bumpPlayed(w.tg_id, 0, Math.max(payout - Number(w.stake), 0));
    }
  }
  for (const b of bets) { if (b.tg_id) await bumpPlayed(b.tg_id, 1, 0); }
  await sbReq('shark_pvp_rounds?id=eq.' + r.id, 'PATCH', { status: 'done', pot, winner, resolved_at: new Date().toISOString() }, 'return=minimal');
  return true;
}

module.exports = async (req, res) => {
  try {
    if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }
    const nowIso = new Date().toISOString();
    const stale = await sbGet('shark_pvp_rounds?status=eq.countdown&resolve_at=lte.' + nowIso + '&select=id,seed,rake&limit=20');
    let resolved = 0;
    for (const r of stale) { if (await resolveRound(r)) resolved++; }
    res.status(200).json({ ok: true, resolved, checked: stale.length });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message) });
  }
};
