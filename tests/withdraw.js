/* Вывод и админка. Заявку на вывод и её обработку ведёт сервер: деньги
   снимаются сразу и висят в удержании, человек-админ выплачивает или
   отклоняет (отказ возвращает сумму). Проверяем и арифметику вывода, и
   что серверные ветки клиента доносят состояние без браузера ломается.

   Как и в наборе `server`, живой базы тут нет: чистую часть — константы,
   расчёт комиссии, наличие действий и защиту доступа — проверяем по коду,
   а поведение клиента — в браузере с подставным сервером. */
const fs = require('fs');
const { браузер, открыть, состояние, близко, день, исходник, Отчёт } = require('./helpers');
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
  const адм = (сервер.match(/if \(!isAdmin\) \{ res\.status\(200\)\.json\(\{ ok: false, reason: 'forbidden' \}\)/g) || []).length;
  о.проверка('оба админских действия закрыты проверкой isAdmin', адм >= 2, 'нашлось ' + адм);
  о.проверка('решение принимается только из состояния pending',
    /з\.status !== 'pending'/.test(сервер) && /reason: 'already'/.test(сервер));
  о.проверка('отказ возвращает удержанное на баланс',
    /refund: true/.test(сервер) && /decision === 'reject'/.test(сервер));

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

  о.раздел('админка: обработка заявок');
  p = await открыть(b, {
    состояние: { bal: 0, fs: { d: день() }, dl: { streak: 1, last: день() } },
    телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
    сервер: {
      state: Object.assign({}, БАЗА, { admin: true }),
      admin_withdrawals: { ok: true, status: 'pending', rows: [
        { id: 5, tg_id: 42, name: 'Тест', method: 'stars', amount: 300, fee: 15, net: 285, dest: 'user5', status: 'pending', created_at: '2026-08-08T10:00:00Z' }
      ] },
      admin_decide: { ok: true, wd: { id: 5, status: 'done' } }
    }
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(500);
  const виден = await p.evaluate(() => !document.getElementById('pAdmin').hidden);
  о.проверка('раздел заявок виден админу', виден);
  const значок = await p.evaluate(() => document.getElementById('pAdminN').textContent);
  о.проверка('на разделе счётчик заявок в обработке', значок === '1', '«' + значок + '»');

  await p.click('#pAdmin'); await p.waitForTimeout(500);
  const заявка = await p.evaluate(() => {
    const row = document.querySelector('#adList .ghrow');
    return row ? {
      имя: (row.querySelector('.nm') || {}).textContent || '',
      выплатить: !!row.querySelector('button[data-act="done"]'),
      отклонить: !!row.querySelector('button[data-act="reject"]')
    } : null;
  });
  о.проверка('заявка в списке с кнопками «Выплатить» и «Отклонить»',
    !!заявка && заявка.выплатить && заявка.отклонить && /Тест/.test(заявка.имя),
    заявка ? заявка.имя : 'списка нет');
  await p.click('#adList button[data-act="done"]'); await p.waitForTimeout(500);
  о.проверка('решение по заявке не роняет приложение', p.ошибки.length === 0, p.ошибки.join(' | '));

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
