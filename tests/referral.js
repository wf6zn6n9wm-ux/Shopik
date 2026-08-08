/* Реферальная программа: одно правило — 5% с пополнений приглашённого,
   никаких призов за сам переход. */
const { браузер, открыть, день, Отчёт } = require('./helpers');

(async () => {
  const о = new Отчёт('referral');
  const b = await браузер();

  о.раздел('название и правила');
  let p = await открыть(b, { состояние: { bal: 1000, fs: { d: день() }, dl: { streak: 1, last: день() } } });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(400);
  const кор = await p.evaluate(() => document.querySelector('#pRef .nm').textContent);
  const влез = await p.evaluate(() => {
    const e = document.querySelector('#pRef .nm'); return e.scrollWidth <= e.clientWidth + 1;
  });
  о.проверка('в профиле короткое название и оно влезает', кор === 'Рефералы' && влез, '«' + кор + '»');
  await p.click('#pRef'); await p.waitForTimeout(600);
  const ш = await p.evaluate(() => ({
    заголовок: document.getElementById('rfTitle').textContent,
    правила: [...document.querySelectorAll('.rfr span')].map(e => e.textContent)
  }));
  о.проверка('заголовок «Реферальная программа»', ш.заголовок === 'Реферальная программа', ш.заголовок);
  о.проверка('правил два, приза за переход нет',
    ш.правила.length === 2 && !ш.правила.some(x => /25 ★|за каждого друга/.test(x)), ш.правила.join(' | '));
  о.проверка('в правиле ровно 5%', /\b5%/.test(ш.правила[1]) && !/10%/.test(ш.правила[1]));
  о.проверка('число подставлено, а не осталось шаблоном', !/\{n\}/.test(ш.правила[1]));

  /* Форма ссылки — не мелочь: ?start= уходит боту, приложение метку не
     увидит и все приглашения потеряются молча. */
  const сс = await p.evaluate(() => document.getElementById('rfHost').textContent +
                                    document.getElementById('rfCode').textContent);
  о.проверка('ссылка открывает мини-апп (startapp), а не переписку с ботом',
    /^t\.me\/starshashx_bot(\/[\w]+)?\?startapp=ref_\d+$/.test(сс), сс);
  await p.close();

  о.раздел('переход по чужой ссылке');
  p = await b.newPage({ viewport: { width: 393, height: 752 } });
  await p.addInitScript(() => localStorage.setItem('starshash_prefs',
    JSON.stringify({ vibro: true, sound: false, lang: 'ru' })));
  await p.goto(require('./helpers').АДРЕС + '?startapp=ref_777777');
  await p.waitForTimeout(1700);
  const итог = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('starshash_state') || '{}');
    return { баланс: s.bal, пригласил: s.rf && s.rf.by, записи: (s.nt && s.nt.l || []).map(x => x.k).join(',') };
  });
  о.проверка('связь с пригласившим запомнена', итог.пригласил === '777777', 'by=' + итог.пригласил);
  о.проверка('звёзд за сам переход не начислено', итог.баланс === 0, 'баланс ' + итог.баланс);
  о.проверка('уведомления о призе нет', !/ref/.test(итог.записи), '«' + итог.записи + '»');
  await p.close();

  о.раздел('три языка');
  for (const [l, заг, корот] of [['ru', 'Реферальная программа', 'Рефералы'],
                                 ['en', 'Referral program', 'Referrals'],
                                 ['uk', 'Реферальна програма', 'Реферали']]) {
    const pg = await открыть(b, { язык: l, состояние: { bal: 1000, fs: { d: день() }, dl: { streak: 1, last: день() } } });
    await pg.click('.tab[data-p="me"]'); await pg.waitForTimeout(400);
    const к = await pg.evaluate(() => document.querySelector('#pRef .nm').textContent);
    const в = await pg.evaluate(() => {
      const e = document.querySelector('#pRef .nm'); return e.scrollWidth <= e.clientWidth + 1;
    });
    await pg.click('#pRef'); await pg.waitForTimeout(500);
    const q = await pg.evaluate(() => ({
      т: document.getElementById('rfTitle').textContent,
      п: [...document.querySelectorAll('.rfr span')].map(e => e.textContent)
    }));
    о.проверка('язык ' + l, q.т === заг && к === корот && в && q.п.length === 2 &&
      /5%/.test(q.п[1]) && !/\{n\}/.test(q.п[1]), '«' + q.т + '» / «' + к + '»');
    await pg.close();
  }

  /* Счётчики приглашённых знает только сервер: телефон пригласившего о
     чужой регистрации не узнаёт никак. Поэтому проверяем и то, что цифры
     сервера доезжают, и то, что без сервера остаются честные нули. */
  о.раздел('счётчики с сервера');
  const СОСТ = { bal: 1000, fs: { d: день() }, dl: { streak: 1, last: день() } };
  p = await открыть(b, {
    состояние: СОСТ,
    телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
    сервер: { state: { ok: true, ref_n: 7, ref: { by: '555', earned: 42 }, bal: 1000, inv: 0 } }
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(400);
  await p.click('#pRef'); await p.waitForTimeout(700);
  const с = await p.evaluate(() => ({
    n: document.getElementById('rfN').textContent,
    e: document.getElementById('rfE').textContent,
    знак: document.getElementById('pRefN').textContent,
    пришёл: !document.getElementById('rfJoin').hidden
  }));
  о.проверка('приглашённые показаны числом сервера', с.n.replace(/\s/g, '') === '7', с.n);
  о.проверка('заработано показано числом сервера', с.e.replace(/\s/g, '') === '42', с.e);
  о.проверка('значок в профиле совпадает', с.знак.replace(/\s/g, '') === '7', с.знак);
  о.проверка('связь с пригласившим подхвачена с сервера', с.пришёл);
  await p.close();

  о.раздел('сервера нет');
  p = await открыть(b, {
    состояние: СОСТ,
    телеграм: { user: { id: 6029995640, first_name: 'Андрій' } },
    сервер: { state: false }                       // запрос не доходит
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(400);
  await p.click('#pRef'); await p.waitForTimeout(700);
  const без = await p.evaluate(() => ({
    n: document.getElementById('rfN').textContent,
    ссылка: document.getElementById('rfHost').textContent,
    баланс: document.querySelector('.hero .big').textContent
  }));
  о.проверка('приложение работает без сервера', /1[\s ]*000/.test(без.баланс), без.баланс);
  о.проверка('счётчик приглашённых — ноль, а не выдумка', без.n.replace(/\s/g, '') === '0', без.n);
  о.проверка('ссылка на месте', /starshashx_bot/.test(без.ссылка), без.ссылка);
  о.проверка('ошибок в консоли нет', p.ошибки.length === 0, p.ошибки.join(' | '));
  await p.close();

  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
