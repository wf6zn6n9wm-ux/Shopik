/* Вывод и админка. Заявку на вывод и её обработку ведёт сервер: деньги
   снимаются сразу и висят в удержании, человек-админ выплачивает или
   отклоняет (отказ возвращает сумму). Проверяем и арифметику вывода, и
   что серверные ветки клиента доносят состояние без браузера ломается.

   Как и в наборе `server`, живой базы тут нет: чистую часть — константы,
   расчёт комиссии, наличие действий и защиту доступа — проверяем по коду,
   а поведение клиента — в браузере с подставным сервером. */
const fs = require('fs');
const { браузер, открыть, жди, состояние, близко, день, исходник, Отчёт } = require('./helpers');
const S = require('../starshash/api/starshash.js');

(async () => {
  const о = new Отчёт('withdraw');
  const src = исходник();
  const сервер = fs.readFileSync(__dirname + '/../starshash/api/starshash.js', 'utf8');
  const схема = fs.readFileSync(__dirname + '/../starshash/db.sql', 'utf8');

  о.раздел('условия вывода сходятся с приложением');
  const m = src.match(/var MIN=(\d+),\s*FEE=([\d.]+),\s*RATE=([\d.]+);/) || [];
  const MIN = Number(m[1]), FEE = Number(m[2]), RATE = Number(m[3]);
  о.проверка('минимум тот же', MIN === S.ВЫВОД.MIN, MIN + ' / ' + S.ВЫВОД.MIN);
  о.проверка('комиссия та же', FEE === S.ВЫВОД.FEE, FEE + ' / ' + S.ВЫВОД.FEE);
  о.проверка('курс GRAM тот же', RATE === S.ВЫВОД.GRAM, RATE + ' / ' + S.ВЫВОД.GRAM);

  о.раздел('расчёт удержания');
  const r1 = S.расчётВывода(1000);
  о.проверка('1000 ★: списывается вся сумма', r1.сумма === 1000, String(r1.сумма));
  о.проверка('1000 ★: комиссия 5% = 50', r1.fee === 50, String(r1.fee));
  о.проверка('1000 ★: к выдаче 950', r1.net === 950, String(r1.net));
  const r2 = S.расчётВывода(150);
  о.проверка('минимум 150 ★: к выдаче 142.5', r2.net === 142.5, String(r2.net));
  о.проверка('к выдаче = сумма − комиссия', близко(r1.net, r1.сумма - r1.fee, 1e-9) &&
    близко(r2.net, r2.сумма - r2.fee, 1e-9));
  о.проверка('дробную сумму округляем вниз до звезды', S.расчётВывода(150.9).сумма === 150);

  о.раздел('действия сервера на месте');
  о.проверка('заявка на вывод', /action === 'withdraw'/.test(сервер));
  о.проверка('история выводов игрока', /action === 'withdrawals'/.test(сервер));
  о.проверка('список заявок для админа', /action === 'admin_withdrawals'/.test(сервер));
  о.проверка('решение по заявке', /action === 'admin_decide'/.test(сервер));
  о.проверка('деньги снимаются сразу и пишутся в журнал',
    /движение\(u, 'withdraw', -сумма/.test(сервер));
  о.проверка('заявка заводится со статусом «в обработке»',
    /sh_withdrawals/.test(сервер) && /status: decision === 'done'/.test(сервер));

  о.раздел('только админ и только один раз');
  /* Оба админских действия обязаны спросить isAdmin: без этого любой,
     подобрав имя действия, увидел бы чужие заявки или закрыл бы их. */
  const адм = (сервер.match(/if \(!isAdmin\) \{ res\.status\(200\)\.json\(\{ ok: false, reason: 'forbidden'/g) || []).length;
  о.проверка('оба действия по заявкам закрыты проверкой isAdmin', адм >= 2, 'нашлось ' + адм);
  о.проверка('решение принимается только из состояния pending',
    /з\.status !== 'pending'/.test(сервер) && /reason: 'already'/.test(сервер));
  о.проверка('отказ возвращает удержанное на баланс',
    /refund: true/.test(сервер) && /decision === 'reject'/.test(сервер));

  о.раздел('админка: вход и права');
  {
    const crypto = require('crypto');
    const ТОКЕН = '111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    /* Вход в браузерную админку идёт через Telegram Login Widget: поля те
       же, но ключ подписи другой — sha256 от токена, а не HMAC. Ошибка
       здесь тихо пускает внутрь кого угодно, поэтому проверяем как
       initData: своя подпись, чужой токен, подмена id, срок. */
    const подписать = (поля, токен) => {
      const o = Object.assign({}, поля);
      const dcs = Object.keys(o).sort().map(k => k + '=' + o[k]).join('\n');
      const secret = crypto.createHash('sha256').update(токен || ТОКЕН).digest();
      o.hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
      return o;
    };
    const сейчас = () => String(Math.floor(Date.now() / 1000));
    const свой = S.verifyLoginWidget(подписать({ id: 6029995640, first_name: 'Андрій', auth_date: сейчас() }), ТОКЕН);
    о.проверка('своя подпись входа принимается', !!свой && свой.id === 6029995640, свой ? свой.name : 'отказ');

    const чужой = S.verifyLoginWidget(подписать({ id: 6029995640, auth_date: сейчас() }, '222:BBB'), ТОКЕН);
    о.проверка('подпись чужим токеном отвергнута', чужой === null);

    const подмена = подписать({ id: 6029995640, auth_date: сейчас() }, ТОКЕН);
    подмена.id = 1111111111;
    о.проверка('подменённый id отвергнут', S.verifyLoginWidget(подмена, ТОКЕН) === null);

    const старый = подписать({ id: 6029995640, auth_date: String(Math.floor(Date.now() / 1000) - 90000) }, ТОКЕН);
    о.проверка('вчерашний вход отвергнут', S.verifyLoginWidget(старый, ТОКЕН) === null);
    о.проверка('без подписи и без токена отказ',
      S.verifyLoginWidget({ id: 1 }, ТОКЕН) === null && S.verifyLoginWidget(подписать({ id: 1, auth_date: сейчас() }), '') === null);

    о.проверка('вход из браузера принимается сервером', /body\.auth\) me = verifyLoginWidget/.test(сервер));
  }

  о.раздел('админка: действия и защита');
  {
    ['admin_dash', 'admin_users', 'admin_adjust', 'admin_ban'].forEach(a =>
      о.проверка('действие ' + a, new RegExp("action === '" + a + "'").test(сервер)));
    /* Каждое админское действие обязано спросить isAdmin: иначе любой,
       подобрав имя, увидел бы чужие балансы или начислил себе. */
    const всего = (сервер.match(/action === 'admin_\w+'/g) || []).length;
    const закрыто = (сервер.match(/if \(!isAdmin\)/g) || []).length;
    о.проверка('все админские действия закрыты проверкой isAdmin', закрыто >= всего,
      'действий ' + всего + ', проверок ' + закрыто);
    о.проверка('правка баланса пишется в журнал с причиной',
      /kind: 'admin'/.test(сервер) && /reason: String\(body\.reason/.test(сервер));
    о.проверка('в минус баланс не уводится', /бал < 0/.test(сервер) && /reason: 'not_enough'/.test(сервер));
    о.проверка('отказ в доступе называет свой id — иначе не настроить SH_ADMIN_IDS',
      /reason: 'forbidden', yourId: me\.id/.test(сервер));
  }

  о.раздел('админка: страница');
  {
    const адм = fs.readFileSync(__dirname + '/../starshash/admin.html', 'utf8');
    о.проверка('страница на месте', адм.length > 1000, адм.length + ' байт');
    о.проверка('ходит только к своему серверу',
      [...адм.matchAll(/fetch\(\s*([^,)\s]+)/g)].every(m => m[1].trim() === 'АДРЕС'));
    о.проверка('разделы: дашборд, заявки, игроки',
      /Дашборд/.test(адм) && /Заявки на вывод/.test(адм) && /Игроки/.test(адм));
    о.проверка('графики свои, без внешних библиотек',
      !/<script[^>]+src="https?:\/\/(?!telegram\.org)/.test(адм));
    о.проверка('ключей и токенов в странице нет',
      !/\d{8,10}:AA[\w-]{30,}/.test(адм) && !/service_role/.test(адм));
    /* Имена приходят из Telegram и могут содержать кавычки. В разметку их
       пускаем только через esc(), а в обработчики — вообще не пускаем:
       склейка чужой строки в атрибут onclick это дыра, и открыта она была
       бы у админа, то есть у того, кто может двигать деньги. */
    о.проверка('вывод в разметку экранируется',
      /function esc\(/.test(адм) && (адм.match(/esc\(/g) || []).length >= 8);
    о.проверка('имена не подставляются в обработчики', !/onclick="[^"]*name/.test(адм));
    о.проверка('из поиска закрыта', /noindex/.test(адм));
    const vc = JSON.parse(fs.readFileSync(__dirname + '/../starshash/vercel.json', 'utf8'));
    о.проверка('admin.html не кэшируется',
      (vc.headers || []).some(h => h.source === '/admin.html' &&
        h.headers.some(x => x.key === 'Cache-Control' && /no-store/.test(x.value))));
    /* В репозитории шесть проектов, и без этой строки пуш в starshash
       собирает все шесть разом. Сотня сборок в сутки на бесплатном тарифе
       кончается за день, после чего выкладка встаёт вся — с сообщением
       api-deployments-free-per-day и без единой подсказки, при чём тут
       соседние папки. */
    о.проверка('сборка не запускается, когда папка не менялась',
      /git diff --quiet HEAD\^ HEAD \.\//.test(String(vc.ignoreCommand || '')),
      vc.ignoreCommand || 'нет');
  }

  о.раздел('схема базы');
  о.проверка('таблица заявок есть', /create table if not exists sh_withdrawals/.test(схема));
  о.проверка('по умолчанию заявка в обработке', /status\s+text not null default 'pending'/.test(схема));
  о.проверка('в заявке есть сумма, комиссия, к выдаче и получатель',
    /amount\s+numeric/.test(схема) && /fee\s+numeric/.test(схема) &&
    /net\s+numeric/.test(схема) && /dest\s+text/.test(схема));
  о.проверка('ходить в таблицу может только сервер (RLS + грант service_role)',
    /alter table sh_withdrawals enable row level security/.test(схема) &&
    /sh_withdrawals to service_role/.test(схема));

  // ── браузер: серверные ветки клиента ────────────────────────────────
  const b = await браузер();

  о.раздел('заявка на вывод через сервер');
  const БАЗА = {
    ok: true, admin: false, bal: 1000, inv: 0, mined: 0,
    ref: { by: '', earned: 0 }, ref_n: 0, bonus: { streak: 0, day: null },
    tasks: {}, daily: {}, stats: {}
  };
  let p = await открыть(b, {
    состояние: { bal: 5, fs: { d: день() }, dl: { streak: 1, last: день() } },
    телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
    сервер: {
      state: БАЗА,
      withdraw: Object.assign({}, БАЗА, { bal: 700, wd: { id: 1, status: 'pending' } }),
      withdrawals: { ok: true, rows: [
        { id: 1, method: 'stars', amount: 300, fee: 15, net: 285, dest: 'starshash', status: 'pending', created_at: '2026-08-08T10:00:00Z' }
      ] }
    }
  });
  const бал0 = (await состояние(p)).bal;
  о.проверка('баланс принят с сервера, а не из памяти телефона', близко(бал0, 1000), 'баланс ' + бал0);

  await p.click('#btnWithdraw'); await p.waitForTimeout(500);
  await p.fill('#wUser', 'starshash'); await p.fill('#wAmt', '300');
  await p.evaluate(() => ['#wUser', '#wAmt'].forEach(s =>
    document.querySelector(s).dispatchEvent(new Event('input', { bubbles: true }))));
  await p.waitForTimeout(300);
  const историяЕсть = await p.evaluate(() => {
    const w = document.getElementById('wdHistWrap');
    return !w.hidden && document.querySelectorAll('#wdHist .ghrow').length;
  });
  о.проверка('история выводов показана и в ней заявка', историяЕсть === 1, 'строк: ' + историяЕсть);
  const статус = await p.evaluate(() => (document.querySelector('#wdHist .ghrow .tm') || {}).textContent || '');
  о.проверка('статус заявки — «В обработке»', /В обработке/.test(статус), статус);

  await p.click('#wdGo', { force: true }); await p.waitForTimeout(700);
  const бал1 = (await состояние(p)).bal;
  о.проверка('после заявки баланс — тот, что вернул сервер (700), а не 1000−300 локально',
    близко(бал1, 700), 'баланс ' + бал1);
  о.проверка('ошибок в консоли нет', p.ошибки.length === 0, p.ошибки.join(' | '));
  await p.close();

  о.раздел('без сервера вывод работает из памяти телефона');
  p = await открыть(b, { состояние: { bal: 1000, fs: { d: день() }, dl: { streak: 1, last: день() } } });
  await p.click('#btnWithdraw'); await p.waitForTimeout(500);
  const скрыта = await p.evaluate(() => document.getElementById('wdHistWrap').hidden);
  о.проверка('без сервера истории выводов нет (заявок не бывает)', скрыта === true);
  await p.fill('#wUser', 'starshash'); await p.fill('#wAmt', '300');
  await p.evaluate(() => ['#wUser', '#wAmt'].forEach(s =>
    document.querySelector(s).dispatchEvent(new Event('input', { bubbles: true }))));
  await p.waitForTimeout(300);
  const до = (await состояние(p)).bal;
  await p.click('#wdGo', { force: true }); await p.waitForTimeout(500);
  const после = (await состояние(p)).bal;
  о.проверка('локально списывается вся сумма', близко(до - после, 300), 'списано ' + (до - после).toFixed(2));
  await p.close();

  о.раздел('пополнение криптой в приложении');
  {
    /* Счёт выписывает сервер, а зачисление приходит не сразу: приложение
       опрашивает статус, пока @CryptoBot не подтвердит оплату. */
    let опрошено = 0;
    p = await открыть(b, {
      состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
      телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
      сервер: {
        state: БАЗА,
        crypto_invoice: { ok: true, invoiceId: 555, link: 'https://t.me/CryptoBot?start=IV', stars: 500, price: 11.97, asset: 'USDT' },
        crypto_check: Object.assign({}, БАЗА, { bal: 500, status: 'paid', credited: true, stars: 500 })
      }
    });
    await p.click('#btnAdd'); await p.waitForTimeout(600);
    await p.click('#dmUsdt'); await p.waitForTimeout(400);
    const пакеты = await p.evaluate(() => [...document.querySelectorAll('#gpList .gp')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    о.проверка('пакеты в USDT по таблице', пакеты.length === 7 &&
      /50 .*1\.33 USDT/.test(пакеты[0]) && /5 000 .*118\.37 USDT/.test(пакеты[6]),
      пакеты.slice(0, 2).join(' | '));

    await p.click('#gpList .gp:nth-child(4)'); await p.waitForTimeout(300);   // 500 ★ = 11.97 USDT
    /* Счёт живёт на t.me, и открыть его нужно внутри Telegram. Отдай мы
       ссылку встроенному браузеру — человек увидел бы веб-страницу t.me с
       кнопкой «OPEN APP» и рекламой Telegram, то есть лишний шаг посреди
       оплаты. Запоминаем, каким способом ушла ссылка. */
    await p.evaluate(() => {
      window.__куда = [];
      const W = window.Telegram.WebApp;
      W.openTelegramLink = u => window.__куда.push(['telegram', u]);
      W.openLink = u => window.__куда.push(['браузер', u]);
    });
    await p.click('#dpGo', { force: true }); await p.waitForTimeout(1200);
    const куда = await p.evaluate(() => window.__куда);
    о.проверка('счёт открывается внутри Telegram, а не во встроенном браузере',
      куда.length === 1 && куда[0][0] === 'telegram',
      куда.map(x => x[0] + ' ' + x[1]).join(' | ') || 'ссылка никуда не ушла');

    const ждём = await p.evaluate(() => document.getElementById('dpHint').textContent);
    о.проверка('после счёта ждём оплату, а не зачисляем сразу', /Ждём оплату/.test(ждём), '«' + ждём + '»');
    /* Уходя платить, приложение на части телефонов схлопывается. Номер
       счёта переживает это в памяти телефона — иначе оплаченное повисло бы
       до жалобы «где мои звёзды». */
    const отложен = await p.evaluate(() => localStorage.getItem('sh_pay'));
    о.проверка('номер счёта пережил уход на оплату', отложен === '555', String(отложен));

    /* опрос идёт раз в три секунды — дожидаемся первого ответа «оплачено» */
    const зачли = await жди(p, () => /Зачислено/.test(document.getElementById('dpHint').textContent), 12000);
    о.проверка('оплата подтверждена сервером и зачислена', зачли,
      await p.evaluate(() => document.getElementById('dpHint').textContent));
    const бал = (await состояние(p)).bal;
    о.проверка('баланс принят с сервера', близко(бал, 500, 1), бал.toFixed(2));
    о.проверка('зачтённый счёт из памяти убран',
      (await p.evaluate(() => localStorage.getItem('sh_pay'))) === null);
    о.проверка('ошибок в консоли нет', p.ошибки.length === 0, p.ошибки.join(' | '));
    await p.close();

    о.раздел('оплата догоняет закрывшееся приложение');
    {
      /* Уход в @CryptoBot на части телефонов схлопывает мини-апп: опрос
         умирает, и оплата повисает. Открывшись заново, приложение должно
         само спросить про отложенный счёт — деньги уже уплачены. */
      const p2 = await открыть(b, {
        состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
        память: { sh_pay: '555' },
        телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
        сервер: {
          state: БАЗА,
          /* баланс нарочно не тот, что в state: иначе не отличить
             «оплата дошла» от «просто прочитали состояние» */
          crypto_check: Object.assign({}, БАЗА, { bal: 2500, status: 'paid', credited: true, stars: 1500 })
        }
      });
      const дошло = await жди(p2, () => JSON.parse(localStorage.getItem('starshash_state') || '{}').bal > 2000, 9000);
      о.проверка('оплата дошла без участия человека', дошло,
        String((await состояние(p2)).bal));
      о.проверка('счёт больше не отложен',
        (await p2.evaluate(() => localStorage.getItem('sh_pay'))) === null);
      о.проверка('ошибок в консоли нет', p2.ошибки.length === 0, p2.ошибки.join(' | '));
      await p2.close();
    }

    о.раздел('пополнение переводом GRAM');
    {
      /* GRAM — родная монета сети TON, поэтому платят ровно числом из
         таблицы, без пересчёта в доллары. Вкладку показываем только когда
         сервер сказал, что есть куда принимать. */
      const СОСТ = Object.assign({}, БАЗА, { bal: 0, ton: true, gram_usd: 2 });
      const p3 = await открыть(b, {
        состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
        телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
        сервер: {
          state: СОСТ,
          ton_invoice: { ok: true, address: 'UQCpwhvvs_dccEQWgzUqaueVFAIX612AqrYmm--J2qObDDpK',
            gram: 18, nano: '18000000000', comment: 'SH6029995640.1000.deadbeef',
            payload: 'te6cc', stars: 1000, validUntil: 2000000000 },
          ton_check: Object.assign({}, БАЗА, { bal: 3000, status: 'paid', credited: true, stars: 1000 })
        }
      });
      await p3.click('#btnAdd'); await p3.waitForTimeout(600);
      const вкладки = await p3.evaluate(() =>
        [...document.querySelectorAll('#dpSheet .wmet button')].filter(e => !e.hidden).map(e => e.querySelector('.nm').textContent));
      о.проверка('способов три, включая GRAM', вкладки.length === 3 && вкладки.indexOf('GRAM') > 0,
        вкладки.join(' | '));

      await p3.click('#dmTon'); await p3.waitForTimeout(400);
      const пакGRAM = await p3.evaluate(() => [...document.querySelectorAll('#gpList .gp')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      о.проверка('пакеты в GRAM по таблице, без пересчёта', пакGRAM.length === 7 &&
        /50 .*\b1 GRAM/.test(пакGRAM[0]) && /5 000 .*89 GRAM/.test(пакGRAM[6]),
        пакGRAM.slice(0, 2).join(' | '));

      /* Курс живой и приходит с сервера: доллар обязан считаться по нему,
         а не по прибитому числу, иначе на экране одна цена, в счёте другая. */
      await p3.click('#dmUsdt'); await p3.waitForTimeout(400);
      const пакUSD = await p3.evaluate(() => [...document.querySelectorAll('#gpList .gp')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
      о.проверка('доллар пересчитан по курсу с сервера', /50 .*2\.00 USDT/.test(пакUSD[0]),
        пакUSD[0]);

      await p3.click('#dmTon'); await p3.waitForTimeout(300);
      await p3.evaluate(() => {
        window.__куда = [];
        /* `ton://` уходит обычным переходом, а не через openLink: Telegram
           умеет только http и https, а чужую схему проглатывает молча.
           Ловим оба пути сразу — и переход, и вызовы Telegram. */
        document.addEventListener('click', e => {
          const a = e.target.closest && e.target.closest('a');
          if (a && a.href) { window.__куда.push(a.href); e.preventDefault(); }
        }, true);
        const W = window.Telegram.WebApp;
        W.openLink = u => window.__куда.push(u);
        W.openTelegramLink = u => window.__куда.push(u);
      });
      await p3.click('#gpList .gp:nth-child(5)'); await p3.waitForTimeout(300);   // 1000 ★ = 18 GRAM
      await p3.click('#dpGo', { force: true }); await p3.waitForTimeout(1200);
      const ушло = await p3.evaluate(() => window.__куда);
      о.проверка('кошелёк открыт с адресом, суммой и пометкой', ушло.length === 1 &&
        /^ton:\/\/transfer\/UQCpwhvvs/.test(ушло[0]) && /amount=18000000000/.test(ушло[0]) &&
        /text=SH6029995640\.1000\.deadbeef/.test(ушло[0]), ушло.join(' | ') || 'никуда');
      о.проверка('пометка отложена на случай закрытия',
        (await p3.evaluate(() => localStorage.getItem('sh_ton'))) === 'SH6029995640.1000.deadbeef');

      /* Ссылку в мини-аппе может проглотить кто угодно: `ton://` Telegram
         не открывает вовсе. Поэтому реквизиты обязаны быть на экране —
         переписав три строки, человек заплатит из любого кошелька. */
      const рекв = await p3.evaluate(() => {
        const б = document.getElementById('dpTonPay');
        return { видно: !б.hidden,
          сумма: document.getElementById('tpSum').textContent,
          адрес: document.getElementById('tpAddr').textContent,
          пометка: document.getElementById('tpMemo').textContent,
          кнопка: document.getElementById('dpGo').textContent };
      });
      о.проверка('реквизиты показаны, а не спрятаны за ссылкой', рекв.видно);
      о.проверка('в реквизитах сумма, адрес и пометка',
        рекв.сумма === '18 GRAM' && /^UQCpwhvvs/.test(рекв.адрес) &&
        рекв.пометка === 'SH6029995640.1000.deadbeef',
        рекв.сумма + ' · ' + рекв.адрес.slice(0, 12) + '… · ' + рекв.пометка);
      о.проверка('кнопка зовёт кошелёк, а не заводит второй перевод',
        /кошел/i.test(рекв.кнопка), '«' + рекв.кнопка + '»');
      о.проверка('пометку можно скопировать', await p3.evaluate(() =>
        !!document.getElementById('tpMemoC') && !!document.getElementById('tpAddrC')));

      /* Сменил сумму — прежние реквизиты уже не те, и оставлять их на
         экране опаснее, чем убрать: заплатят по старой пометке. */
      await p3.click('#gpList .gp:nth-child(2)'); await p3.waitForTimeout(300);
      о.проверка('другая сумма убирает прежние реквизиты',
        await p3.evaluate(() => document.getElementById('dpTonPay').hidden));
      await p3.click('#gpList .gp:nth-child(5)'); await p3.waitForTimeout(200);
      await p3.click('#dpGo', { force: true }); await p3.waitForTimeout(900);

      const пришло = await жди(p3, () => /Зачислено/.test(document.getElementById('dpHint').textContent), 15000);
      о.проверка('перевод найден в сети и зачислен', пришло,
        await p3.evaluate(() => document.getElementById('dpHint').textContent));
      о.проверка('баланс принят с сервера', близко((await состояние(p3)).bal, 3000, 2));
      о.проверка('зачтённая пометка убрана',
        (await p3.evaluate(() => localStorage.getItem('sh_ton'))) === null);
      о.проверка('ошибок в консоли нет', p3.ошибки.length === 0, p3.ошибки.join(' | '));
      await p3.close();
    }

    о.раздел('без кошелька вкладки перевода нет');
    {
      /* Обещать способ, которого нет, нельзя: сервер не назвал кошелёк —
         значит принимать перевод некуда, и вкладка не показывается. */
      const p4 = await открыть(b, {
        состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
        телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
        сервер: { state: Object.assign({}, БАЗА, { ton: false }) }
      });
      await p4.click('#btnAdd'); await p4.waitForTimeout(600);
      const видно = await p4.evaluate(() =>
        [...document.querySelectorAll('#dpSheet .wmet button')].filter(e => !e.hidden).map(e => e.querySelector('.nm').textContent));
      о.проверка('осталось два способа', видно.length === 2 && видно.indexOf('GRAM') < 0, видно.join(' | '));
      о.проверка('ошибок в консоли нет', p4.ошибки.length === 0, p4.ошибки.join(' | '));
      await p4.close();
    }

    о.раздел('крипта не настроена — честный отказ');
    p = await открыть(b, {
      состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
      телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
      сервер: { state: БАЗА, crypto_invoice: { ok: false, reason: 'not_configured' } }
    });
    await p.click('#btnAdd'); await p.waitForTimeout(600);
    await p.click('#dmUsdt'); await p.waitForTimeout(400);
    await p.click('#dpGo', { force: true }); await p.waitForTimeout(900);
    const отказ = await p.evaluate(() => ({ т: document.getElementById('dpHint').textContent,
      бал: JSON.parse(localStorage.getItem('starshash_state')).bal }));
    о.проверка('без настройки говорим прямо, а не молчим', /недоступна/.test(отказ.т), '«' + отказ.т + '»');
    /* 1000 — это баланс, который вернул подставной state; важно, что
       неудачная попытка оплаты его не тронула */
    о.проверка('и ничего не зачисляем', близко(отказ.бал, БАЗА.bal, 1), отказ.бал.toFixed(2));
    await p.close();
  }

  о.раздел('админка внутри приложения');
  /* Владельцу панель нужна там же, где он играет — в профиле. Три раздела:
     показатели, заявки и игроки; данные те же, что у отдельной страницы. */
  const ДАШ = {
    ok: true, admin: { name: 'Андрій', id: 6029995640 },
    totals: { users: 12, newToday: 3, new7d: 8, banned: 0, online: 5, dau: 4,
              bal: 1234, inv: 900, mined: 77, topup30: 5000, wd30: 300,
              bet30: 2000, win30: 1750, ggr30: 250, bonus30: 40, ref30: 25,
              wdPending: 1, wdPendingSum: 300, wdDone: 2, wdDoneSum: 570, wdRejected: 0 },
    series: { users: [{ date: '2026-08-08', v: 3 }, { date: '2026-08-09', v: 0 }],
              dau: [{ date: '2026-08-08', v: 4 }, { date: '2026-08-09', v: 2 }],
              topup: [{ date: '2026-08-08', v: 500 }, { date: '2026-08-09', v: 120 }],
              withdraw: [{ date: '2026-08-08', v: 300 }, { date: '2026-08-09', v: 0 }],
              bet: [{ date: '2026-08-08', v: 2000 }, { date: '2026-08-09', v: 0 }],
              win: [{ date: '2026-08-08', v: 1750 }, { date: '2026-08-09', v: 0 }] },
    month: '2026-08', months: ['2026-06', '2026-07', '2026-08'],
    topups: [{ date: '2026-08-09', n: 2, v: 120, stars: 0, crypto: 70, gram: 50 },
             { date: '2026-08-08', n: 4, v: 500, stars: 400, crypto: 100, gram: 0 }],
    truncated: false
  };
  p = await открыть(b, {
    состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
    телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
    сервер: {
      state: Object.assign({}, БАЗА, { admin: true }),
      admin_dash: ДАШ,
      admin_withdrawals: { ok: true, status: 'pending', rows: [
        { id: 5, tg_id: 42, name: 'Тест', method: 'stars', amount: 300, fee: 15, net: 285, dest: 'user5', status: 'pending', created_at: '2026-08-08T10:00:00Z' }
      ] },
      admin_users: { ok: true, month: '2026-08', rows: [
        { tg_id: 42, name: 'Тест', bal: 100, inv: 50, mined: 7, wagered: 20, won: 10,
          plays: 3, banned: false, created_at: '2026-08-08T10:00:00Z', seen_at: '2026-08-08T10:00:00Z',
          m: { topup: 250, win: 180, bet: 400, wd: 0 } }
      ] },
      admin_decide: { ok: true, wd: { id: 5, status: 'done' } }
    }
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(500);
  const виден = await p.evaluate(() => ({
    есть: !document.getElementById('pAdmin').hidden,
    имя: document.querySelector('#pAdmin .nm').textContent,
    значок: document.getElementById('pAdminN').textContent
  }));
  о.проверка('в профиле есть раздел «Админка»', виден.есть && /Админка/.test(виден.имя), виден.имя);
  о.проверка('на разделе счётчик заявок в обработке', виден.значок === '1', '«' + виден.значок + '»');

  await p.click('#pAdmin'); await p.waitForTimeout(900);
  const даш = await p.evaluate(() => ({
    разделов: document.querySelectorAll('#adNav button').length,
    показателей: document.querySelectorAll('#adDash .adkpi').length,
    графиков: document.querySelectorAll('#adDash svg.adchart').length,
    текст: document.getElementById('adDash').innerText
  }));
  о.проверка('открывается на обзоре, разделов четыре', даш.разделов === 4, String(даш.разделов));
  о.проверка('показатели и графики нарисованы',
    даш.показателей >= 16 && даш.графиков >= 4,
    'показателей ' + даш.показателей + ', графиков ' + даш.графиков);
  о.проверка('числа с сервера, а не заглушки', /1\s?234/.test(даш.текст) && /\b12\b/.test(даш.текст));

  /* Месяц вместо скользящих тридцати дней: числа за отрезок «последние
     тридцать» не с чем сравнить, а месяцы сравнимы между собой. */
  const мес = await p.evaluate(() => ({
    видно: !document.getElementById('adMonth').hidden,
    подпись: document.getElementById('adMonthT').textContent,
    назад: !document.getElementById('adPrev').disabled,
    вперёд: !document.getElementById('adNext').disabled,
    строк: document.querySelectorAll('#adDash .adtab tbody tr').length
  }));
  о.проверка('месяц назван словами', мес.видно && /Август 2026/.test(мес.подпись), мес.подпись);
  о.проверка('назад листается, вперёд — некуда', мес.назад && !мес.вперёд,
    'назад ' + мес.назад + ', вперёд ' + мес.вперёд);
  о.проверка('разбивка по дням на месте', мес.строк === 2, 'строк ' + мес.строк);

  /* Пополнения — отдельной вкладкой и с разбивкой по способу оплаты: у
     звёзд, криптосчёта и перевода GRAM разные комиссии, а в общей сумме
     они неразличимы. */
  await p.click('#adNav button[data-v="tops"]'); await p.waitForTimeout(500);
  const поп = await p.evaluate(() => ({
    видно: !document.getElementById('adTops').hidden,
    обзорСпрятан: document.getElementById('adDash').hidden,
    строк: document.querySelectorAll('#adTops .adtab tbody tr').length,
    текст: document.getElementById('adTops').innerText
  }));
  о.проверка('вкладка пополнений открывается отдельно от обзора',
    поп.видно && поп.обзорСпрятан);
  о.проверка('способы оплаты разделены', /Звёздами/.test(поп.текст) &&
    /Криптой/.test(поп.текст) && /GRAM/.test(поп.текст), поп.текст.slice(0, 60));
  о.проверка('пополнения расписаны по дням', поп.строк === 2, 'строк ' + поп.строк);

  /* Прошлый месяц — это отдельный запрос: показывать июльские числа под
     подписью «Август» хуже, чем не показывать вовсе. */
  await p.evaluate(() => {
    window.__месяцы = [];
    const f = window.fetch;
    window.fetch = function (u, init) {
      try {
        const b = JSON.parse(init.body);
        if (b.action === 'admin_dash' && b.month) window.__месяцы.push(b.month);
      } catch (e) {}
      return f.apply(this, arguments);
    };
  });
  await p.click('#adPrev'); await p.waitForTimeout(600);
  о.проверка('переключение месяца спрашивает сервер заново',
    (await p.evaluate(() => window.__месяцы || [])).indexOf('2026-07') >= 0,
    (await p.evaluate(() => (window.__месяцы || []).join(', '))) || 'запросов не было');
  await p.click('#adNav button[data-v="dash"]'); await p.waitForTimeout(400);

  await p.click('#adNav button[data-v="wd"]'); await p.waitForTimeout(700);
  const заявка = await p.evaluate(() => {
    const row = document.querySelector('#adList .ghrow');
    return row ? {
      имя: (row.querySelector('.nm') || {}).textContent || '',
      выплатить: !!row.querySelector('button[data-do="done"]'),
      отклонить: !!row.querySelector('button[data-do="reject"]')
    } : null;
  });
  о.проверка('заявка в списке с кнопками «Выплатить» и «Отклонить»',
    !!заявка && заявка.выплатить && заявка.отклонить && /Тест/.test(заявка.имя),
    заявка ? заявка.имя : 'списка нет');
  await p.click('#adList button[data-do="done"]'); await p.waitForTimeout(600);

  await p.click('#adNav button[data-v="users"]'); await p.waitForTimeout(700);
  const игроки = await p.evaluate(() => ({
    строк: document.querySelectorAll('#adUList .ghrow').length,
    начислить: !!document.querySelector('#adUList button[data-give]'),
    доступ: !!document.querySelector('#adUList button[data-ban]'),
    поиск: !!document.getElementById('adQ')
  }));
  о.проверка('раздел «Игроки» с поиском и кнопками',
    игроки.строк === 1 && игроки.начислить && игроки.доступ && игроки.поиск,
    'строк ' + игроки.строк);

  /* «Всего за всё время» не отвечает на вопрос, что человек делал в
     августе, — а решение о нём принимают именно по этому. */
  const карточка = await p.evaluate(() => ({
    текст: document.querySelector('#adUList .ghrow').innerText,
    месяц: !document.getElementById('adMonth').hidden
  }));
  /* «Выиграл 180» само по себе читается как доход, хотя человек поставил
     400 и ушёл в минус на 220 — итог по играм обязан стоять со знаком. */
  о.проверка('у игрока видны итоги за месяц',
    /пополнил\s*250/.test(карточка.текст) && /в играх\s*−?-?220/.test(карточка.текст),
    карточка.текст.replace(/\n/g, ' · '));
  о.проверка('и когда он заходил', /заходил/.test(карточка.текст));
  о.проверка('месяц на этой вкладке тот же, что и на обзоре', карточка.месяц);
  о.проверка('панель не роняет приложение', p.ошибки.length === 0, p.ошибки.join(' | '));

  о.раздел('страница админки в браузере');
  {
    /* Открываем саму панель с подставным сервером: важно не только то,
       что файл лежит на месте, но и что он рисует числа, графики и
       таблицы и не падает. */
    const ДАШ = {
      ok: true, admin: { name: 'Андрій', id: 6029995640 },
      totals: { users: 12, newToday: 3, new7d: 8, banned: 1, online: 5, dau: 4,
                bal: 1234.5, inv: 900, mined: 77, topup30: 5000, wd30: 300,
                bet30: 2000, win30: 1750, ggr30: 250, bonus30: 40, ref30: 25,
                wdPending: 2, wdPendingSum: 450, wdDone: 1, wdDoneSum: 285, wdRejected: 0 },
      series: { users: [{ date: '2026-08-08', v: 3 }], dau: [{ date: '2026-08-08', v: 4 }],
                topup: [{ date: '2026-08-08', v: 500 }], withdraw: [{ date: '2026-08-08', v: 300 }],
                bet: [{ date: '2026-08-08', v: 200 }], win: [{ date: '2026-08-08', v: 175 }],
                mine: [{ date: '2026-08-08', v: 12 }] },
      truncated: false
    };
    const ОТВЕТЫ = {
      admin_dash: ДАШ,
      admin_withdrawals: { ok: true, status: 'pending', rows: [
        { id: 7, tg_id: 42, name: 'Тест', method: 'stars', amount: 300, fee: 15, net: 285,
          dest: 'user7', status: 'pending', created_at: '2026-08-08T10:00:00Z' }] },
      admin_users: { ok: true, rows: [
        { tg_id: 42, name: 'Тест', bal: 100, inv: 50, mined: 7, wagered: 20, won: 10,
          plays: 3, banned: false, created_at: '2026-08-08T10:00:00Z', seen_at: '2026-08-08T10:00:00Z' }] }
    };
    const стр = await b.newPage({ viewport: { width: 900, height: 900 } });
    const беды = [];
    стр.on('pageerror', e => беды.push('JS: ' + e.message));
    стр.on('console', m => {
      if (m.type() !== 'error') return;
      const т = m.text();
      /* песочница не пускает telegram.org — сам скрипт мини-аппа там не
         грузится; в Telegram он есть. Как и в общей обвязке, молчим */
      if (/TUNNEL_CONNECTION_FAILED|telegram-web-app|telegram\.org/.test(т)) return;
      беды.push('консоль: ' + т.slice(0, 80));
    });
    await стр.addInitScript(о => {
      window.Telegram = { WebApp: { initData: 'user=%7B%22id%22%3A1%7D&hash=подделка',
        initDataUnsafe: {}, ready() {}, expand() {} } };
      window.fetch = function (u, init) {
        let d = 'admin_dash';
        try { d = JSON.parse(init.body).action || d; } catch (e) {}
        return Promise.resolve({ json: () => Promise.resolve(о[d] || { ok: false, reason: 'unknown_action' }) });
      };
    }, ОТВЕТЫ);
    await стр.goto('file://' + require('path').join(__dirname, '..', 'starshash', 'admin.html'));
    await стр.waitForTimeout(900);

    const д = await стр.evaluate(() => ({
      показателей: document.querySelectorAll('.kpi').length,
      графиков: document.querySelectorAll('svg.chart').length,
      разделов: document.querySelectorAll('.nav2 button').length,
      текст: document.body.innerText
    }));
    о.проверка('дашборд отрисовался', д.показателей >= 16, 'показателей ' + д.показателей);
    о.проверка('графики нарисованы', д.графиков >= 7, 'графиков ' + д.графиков);
    о.проверка('три раздела в навигации', д.разделов === 3, String(д.разделов));
    /* 1234.5 на балансах показывается округлённым до 1 235, а разделитель
       разрядов у ru-RU — неразрывный пробел, поэтому \s, а не обычный */
    о.проверка('числа подставлены, а не заглушки', /1\s?235/.test(д.текст) && /\b12\b/.test(д.текст));
    о.проверка('имя админа показано', /Андрій/.test(д.текст));

    await стр.click('.nav2 button:nth-child(2)'); await стр.waitForTimeout(500);
    const з = await стр.evaluate(() => ({
      строк: document.querySelectorAll('tbody tr').length,
      выплатить: !!Array.from(document.querySelectorAll('button')).find(b => /Выплатить/.test(b.textContent)),
      текст: document.body.innerText
    }));
    о.проверка('раздел заявок работает', з.строк === 1 && з.выплатить && /Тест/.test(з.текст),
      'строк ' + з.строк);

    await стр.click('.nav2 button:nth-child(3)'); await стр.waitForTimeout(500);
    const и = await стр.evaluate(() => ({
      строк: document.querySelectorAll('tbody tr').length,
      поиск: !!document.getElementById('q'),
      текст: document.body.innerText
    }));
    о.проверка('раздел игроков работает', и.строк === 1 && и.поиск && /Тест/.test(и.текст),
      'строк ' + и.строк);
    о.проверка('ошибок на странице нет', беды.length === 0, беды.join(' | '));
    await стр.close();
  }

  о.раздел('обычному игроку админка не видна');
  await p.close();
  p = await открыть(b, {
    состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
    телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
    сервер: { state: Object.assign({}, БАЗА, { admin: false }) }
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(500);
  const скрыт = await p.evaluate(() => document.getElementById('pAdmin').hidden);
  о.проверка('раздел заявок спрятан от не-админа', скрыт === true);
  await p.close();

  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
