// Vercel Cron — вечернее сообщение барберу: что завтра.
//
// Сервер не знает ни имён клиентов, ни услуг из календаря — только
// занятые интервалы, которые публикует кабинет. Поэтому план дня
// выглядит так: сколько записей, во сколько первая и последняя, где
// остались окна. Этого хватает, чтобы вечером понять свой завтрашний
// день, и при этом на сервере не появляется ни одной лишней строки о
// клиентах.
//
// Запускается по расписанию из vercel.json. Время в cron — UTC:
// «0 16 * * *» это 19:00 по Киеву.
//
// Переменные окружения: те же, что у api/barber.js, плюс
//   BARBER_CRON_SECRET — если задан, требуем его в заголовке или ?key=

function env(name){ return process.env['BARBER_' + name] || process.env[name] || ''; }

const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const mins = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const pad = n => (n < 10 ? '0' : '') + n;
const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const URL_ = env('SUPABASE_URL');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  const BOT = env('BOT_TOKEN');
  const SECRET = env('CRON_SECRET');

  if (SECRET){
    const auth = req.headers['authorization'] || '';
    const key = (req.query && req.query.key) || '';
    if (auth !== 'Bearer ' + SECRET && key !== SECRET){
      res.status(401).json({ok: false, reason: 'unauthorized'});
      return;
    }
  }
  if (!URL_ || !SERVICE || !BOT){ res.status(200).json({ok: false, reason: 'not_configured'}); return; }

  const H = {apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json'};
  async function sb(path, opts){
    const r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({headers: H}, opts || {}));
    const t = await r.text();
    if (!r.ok) throw new Error(r.status + ' ' + path + ' ' + t.slice(0, 200));
    return t ? JSON.parse(t) : [];
  }
  const patch = (path, row) => sb(path, {
    method: 'PATCH', body: JSON.stringify(row),
    headers: Object.assign({}, H, {Prefer: 'return=minimal'}),
  });
  async function send(chatId, text){
    try {
      await fetch('https://api.telegram.org/bot' + BOT + '/sendMessage', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({chat_id: chatId, text}),
      });
      return true;
    } catch (e){ return false; }
  }

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const dow = DOW[(new Date(tomorrow + 'T00:00:00Z').getUTCDay() + 6) % 7];

  try {
    const shops = await sb('barber_shops?tg_chat_id=not.is.null&select=slug,hours,tg_chat_id,plan_sent_for');
    let sent = 0;

    for (const shop of shops){
      /* один план на день: повторный запуск крона не разбудит барбера дважды */
      if (String(shop.plan_sent_for || '').slice(0, 10) === tomorrow) continue;

      const busy = await sb('barber_busy?slug=eq.' + shop.slug + '&date=eq.' + tomorrow +
                            '&select=time,dur&order=time.asc');
      const open = await sb('barber_requests?slug=eq.' + shop.slug + '&status=eq.new&select=id');
      const h = (shop.hours || {})[dow];

      let text;
      if (!h || !h.on){
        /* в выходной пишем, только если есть что решать */
        if (!open.length){ await patch('barber_shops?slug=eq.' + shop.slug, {plan_sent_for: tomorrow}); continue; }
        text = 'Завтра выходной.\n\n' + openLine(open.length);
      } else if (!busy.length){
        text = 'Завтра записей нет — день свободен с ' + h.from + ' до ' + h.to + '.' +
               (open.length ? '\n\n' + openLine(open.length) : '');
      } else {
        const rows = busy.map(b => [mins(b.time), mins(b.time) + (Number(b.dur) || 0)])
          .sort((a, b) => a[0] - b[0]);
        const gaps = [];
        let cur = mins(h.from);
        rows.forEach(([s, e]) => {
          if (s - cur >= 30) gaps.push(hhmm(cur) + '–' + hhmm(s));
          cur = Math.max(cur, e);
        });
        if (mins(h.to) - cur >= 30) gaps.push(hhmm(cur) + '–' + hhmm(mins(h.to)));

        text = 'Завтра ' + rows.length + ' ' + plural(rows.length, 'запись', 'записи', 'записей') + '.\n' +
               'Первая в ' + hhmm(rows[0][0]) + ', последняя заканчивается в ' + hhmm(rows[rows.length - 1][1]) + '.\n' +
               (gaps.length ? 'Свободно: ' + gaps.join(', ') : 'Свободных окон нет.') +
               (open.length ? '\n\n' + openLine(open.length) : '');
      }

      if (await send(shop.tg_chat_id, text)) sent++;
      await patch('barber_shops?slug=eq.' + shop.slug, {plan_sent_for: tomorrow});
    }

    res.status(200).json({ok: true, shops: shops.length, sent});
  } catch (e){
    res.status(200).json({ok: false, reason: 'error', message: String(e && e.message || e).slice(0, 200)});
  }
};

function openLine(n){
  return n + ' ' + plural(n, 'заявка ждёт', 'заявки ждут', 'заявок ждут') + ' ответа — /zayavki';
}
function plural(n, one, few, many){
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
