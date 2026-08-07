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

  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
