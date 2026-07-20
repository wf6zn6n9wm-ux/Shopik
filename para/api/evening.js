// Vercel Cron — вечернее напоминание парам, которые сегодня ещё не заходили.
// Запуск раз в сутки вечером (vercel.json "0 18 * * *" ≈ 20–21:00 по Киеву).
// Цель — только «спящие сегодня» связанные пары (никто из двоих не отвечал и
// не активничал сегодня), чтобы не дёргать тех, кто уже пользовался приложением.
// Дедуп: событие 'ev' — не больше одного вечернего пуша в день на человека.

function env(name) { return process.env['PARA_' + name] || process.env[name] || ''; }

module.exports = async (req, res) => {
  const URL = env('SUPABASE_URL');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  const BOT = env('BOT_TOKEN');
  const APP = env('APP_URL') || 'https://para-psi.vercel.app/';
  const SECRET = env('CRON_SECRET');

  if (SECRET) {
    const auth = req.headers['authorization'] || '';
    const key = (req.query && req.query.key) || '';
    if (auth !== 'Bearer ' + SECRET && key !== SECRET) { res.status(401).json({ ok: false, reason: 'unauthorized' }); return; }
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
    const day = new Date().toISOString().slice(0, 10);
    const startDay = day + 'T00:00:00Z';
    const couples = await sb('para_couples?select=id,para_members(tg_id,slot)');
    const linked = (couples || []).filter((c) => (c.para_members || []).length >= 2);

    // кто отвечал сегодня
    let answered = [];
    try { answered = await sb('para_answers?day=eq.' + day + '&select=tg_id'); } catch (e) {}
    const answeredSet = {}; (answered || []).forEach((a) => { answeredSet[a.tg_id] = true; });
    // у каких пар была РЕАЛЬНАЯ активность сегодня (заход/очки/квест/желание — не служебные пуши)
    let events = [];
    try { events = await sb('para_events?created_at=gte.' + encodeURIComponent(startDay) + '&type=in.(active,points,quest,wish,paired)&select=couple_id'); } catch (e) {}
    const activeCouple = {}; (events || []).forEach((e) => { if (e.couple_id) activeCouple[e.couple_id] = true; });
    // кому уже слали вечерний пуш сегодня
    let evd = [];
    try { evd = await sb('para_events?type=eq.ev&created_at=gte.' + encodeURIComponent(startDay) + '&select=tg_id'); } catch (e) {}
    const evSet = {}; (evd || []).forEach((n) => { evSet[n.tg_id] = true; });

    // пара «спит сегодня» если никто не отвечал и не было событий
    const targets = [];
    for (let a = 0; a < linked.length; a++) {
      const c = linked[a], mm = c.para_members || [];
      if (activeCouple[c.id]) continue;
      const someoneAnswered = mm.some((m) => answeredSet[m.tg_id]);
      if (someoneAnswered) continue;
      for (let b = 0; b < mm.length; b++) {
        const tid = mm[b].tg_id;
        if (!tid || evSet[tid]) continue;
        targets.push({ tg_id: tid, couple_id: c.id });
      }
    }

    const kb = { inline_keyboard: [[{ text: '🌙 Открыть PARA', web_app: { url: APP } }]] };
    // текст чередуется по дням, чтобы вечерний пуш не приедался
    const EVENING = [
      'Как прошёл день? 🌙\n\nЗагляните в PARA вдвоём: ответьте на вопрос дня, загадайте желание или выполните квест. Пара минут — и вы стали ближе ❤️',
      'Вечер вдвоём 🌙\n\nОтветьте на вопрос дня в PARA, пока не легли спать — маленький ритуал, который сближает ❤️',
      'Перед сном — пара минут для вас двоих 🌙\n\nВопрос дня в PARA уже ждёт. Ответьте вдвоём и станьте чуть ближе ❤️',
      'Не забудьте про PARA сегодня 🌙\n\nОтвет на вопрос дня, желание или тёплое слово партнёру — вечер станет теплее ❤️',
      'Как ты сегодня? 🌙\n\nПоделитесь настроением и ответьте на вопрос дня в PARA — это займёт минуту ❤️'
    ];
    const eveningText = EVENING[Math.floor(Date.now() / 86400000) % EVENING.length];
    let sent = 0, skipped = 0;
    for (let i = 0; i < targets.length; i += 25) {
      const chunk = targets.slice(i, i + 25);
      await Promise.all(chunk.map(async (t) => {
        try {
          await tgSend(t.tg_id, eveningText, kb);
          await sb('para_events', { method: 'POST', body: JSON.stringify({ tg_id: t.tg_id, couple_id: t.couple_id, type: 'ev', amount: 0 }) }).catch(() => {});
          sent++;
        } catch (e) { skipped++; }
      }));
    }
    res.status(200).json({ ok: true, sent: sent, skipped: skipped, sleeping: targets.length });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message).slice(0, 200) });
  }
};
