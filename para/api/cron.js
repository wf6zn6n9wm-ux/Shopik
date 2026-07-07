// Vercel Cron — ежедневное автонапоминание «зависшим» парам.
// Запускается по расписанию из vercel.json ("0 12 * * *" — раз в сутки).
// Находит пары, где партнёр не присоединился (старше 24 ч, моложе 7 дней),
// и шлёт создателю ссылку-приглашение. Дедуп: не чаще раза в 20 ч и не больше 3 раз всего.
//
// Переменные окружения: те же, что у api/para.js (PARA_SUPABASE_URL,
// PARA_SUPABASE_SERVICE_ROLE_KEY, PARA_BOT_TOKEN, необязательно PARA_APP_URL,
// PARA_BOT_USERNAME, PARA_CRON_SECRET).

function env(name) { return process.env['PARA_' + name] || process.env[name] || ''; }

module.exports = async (req, res) => {
  const URL = env('SUPABASE_URL');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  const BOT = env('BOT_TOKEN');
  const BOT_USER = env('BOT_USERNAME') || 'para_couple_bot';
  const APP = env('APP_URL') || 'https://para-psi.vercel.app/';
  const SECRET = env('CRON_SECRET');

  // Защита: если задан секрет — требуем заголовок Vercel Cron или ?key=<secret>.
  // (Без секрета полагаемся на дедуп — спамить пользователей всё равно не получится.)
  if (SECRET) {
    const auth = req.headers['authorization'] || '';
    const key = (req.query && req.query.key) || '';
    if (auth !== 'Bearer ' + SECRET && key !== SECRET) {
      res.status(401).json({ ok: false, reason: 'unauthorized' });
      return;
    }
  }
  if (!URL || !SERVICE || !BOT) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }

  const H = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' };
  async function sb(path, opts) {
    const r = await fetch(URL + '/rest/v1/' + path, Object.assign({ headers: H }, opts));
    if (!r.ok) throw new Error(r.status + ' ' + path);
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  }
  async function tgSend(chatId, text, kb) {
    const p = { chat_id: chatId, text: text };
    if (kb) p.reply_markup = kb;
    return fetch('https://api.telegram.org/bot' + BOT + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p)
    });
  }

  try {
    const couples = await sb('para_couples?select=id,invite_code,created_at,para_members(tg_id,slot)&order=created_at.desc');
    const now = Date.now();

    // ===== 1) Пуш «вопрос дня» участникам связанных пар, кто ещё не ответил =====
    let dqSent = 0, dqSkipped = 0;
    try {
      const day = new Date().toISOString().slice(0, 10);
      const startDay = day + 'T00:00:00Z';
      const linked = (couples || []).filter((c) => (c.para_members || []).length >= 2);
      let answered = [];
      try { answered = await sb('para_answers?day=eq.' + day + '&select=tg_id'); } catch (e) {}
      const answeredSet = {}; (answered || []).forEach((a) => { answeredSet[a.tg_id] = true; });
      let notified = [];
      try { notified = await sb('para_events?type=eq.dq&created_at=gte.' + encodeURIComponent(startDay) + '&select=tg_id'); } catch (e) {}
      const notifiedSet = {}; (notified || []).forEach((n) => { notifiedSet[n.tg_id] = true; });
      const targets = [];
      for (let a = 0; a < linked.length; a++) {
        const mm = linked[a].para_members || [];
        for (let b = 0; b < mm.length; b++) {
          const tid = mm[b].tg_id;
          if (!tid || answeredSet[tid] || notifiedSet[tid]) continue;
          targets.push({ tg_id: tid, couple_id: linked[a].id });
        }
      }
      const kbOpen = { inline_keyboard: [[{ text: '💬 Ответить на вопрос', web_app: { url: APP } }]] };
      for (let i = 0; i < targets.length; i += 25) { // батчами, чтобы не упереться в лимиты/таймаут
        const chunk = targets.slice(i, i + 25);
        await Promise.all(chunk.map(async (t) => {
          try {
            await tgSend(t.tg_id, '💬 Новый вопрос дня в PARA — ответьте вдвоём и станьте ещё ближе ❤️', kbOpen);
            await sb('para_events', { method: 'POST', body: JSON.stringify({ tg_id: t.tg_id, couple_id: t.couple_id, type: 'dq', amount: 0 }) }).catch(() => {});
            dqSent++;
          } catch (e) { dqSkipped++; }
        }));
      }
    } catch (e) {}

    // ===== 2) Напоминания «зависшим» парам (партнёр не присоединился) =====
    const minAge = now - 24 * 3600 * 1000;      // старше 24 часов
    const maxAge = now - 7 * 24 * 3600 * 1000;  // но моложе 7 дней
    const waiting = (couples || []).filter((c) => {
      if ((c.para_members || []).length !== 1) return false;
      const t = Date.parse(c.created_at || '');
      return t && t <= minAge && t >= maxAge;
    });

    // дедуп по событиям remind: 20 часов + не больше 3 напоминаний всего
    let allReminds = [];
    try { allReminds = await sb('para_events?type=eq.remind&select=couple_id,created_at'); } catch (e) {}
    const count = {}, lastAt = {};
    (allReminds || []).forEach((r) => {
      if (!r.couple_id) return;
      count[r.couple_id] = (count[r.couple_id] || 0) + 1;
      const t = Date.parse(r.created_at || '');
      if (t && t > (lastAt[r.couple_id] || 0)) lastAt[r.couple_id] = t;
    });
    const window20h = now - 20 * 3600 * 1000;

    const shareText = 'Я завёл(а) нам PARA 💞 — приложение для нас двоих: вопрос дня, желания, квесты и важные даты. Нажми, чтобы войти в нашу пару 👇';
    let sent = 0, skipped = 0;
    for (let i = 0; i < waiting.length; i++) {
      const c = waiting[i];
      if ((count[c.id] || 0) >= 3) { skipped++; continue; }
      if ((lastAt[c.id] || 0) > window20h) { skipped++; continue; }
      const m = (c.para_members || [])[0];
      if (!m || !m.tg_id) { skipped++; continue; }
      const link = 'https://t.me/' + BOT_USER + '?startapp=' + c.invite_code;
      const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(shareText);
      const kb = { inline_keyboard: [
        [{ text: '📤 Отправить партнёру', url: shareUrl }],
        [{ text: '🚀 Открыть PARA', web_app: { url: APP } }]
      ] };
      try {
        await tgSend(m.tg_id,
          'Ваш партнёр ещё не присоединился к PARA 💞\n\nПерешлите ему эту ссылку — он войдёт в вашу пару одним касанием (код вводить не нужно):\n' + link + '\n\nЗа связывание пары дарим +100 очков 🎁',
          kb);
        await sb('para_events', { method: 'POST', body: JSON.stringify({ tg_id: m.tg_id, couple_id: c.id, type: 'remind', amount: 0 }) }).catch(() => {});
        sent++;
      } catch (e) { skipped++; }
    }
    res.status(200).json({ ok: true, dailyQuestion: { sent: dqSent, skipped: dqSkipped }, reminders: { sent: sent, skipped: skipped, candidates: waiting.length } });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message).slice(0, 200) });
  }
};
