/* Игры целиком: раунды Краша, ПВП и кейсы, журнал игр, сохранность
   после перезагрузки и смена языка на лету. */
const { браузер, открыть, жди, состояние, день, Отчёт } = require('./helpers');

(async () => {
  const о = new Отчёт('games');
  const b = await браузер();
  const p = await открыть(b, { состояние: { bal: 100000, fs: { d: день() }, dl: { streak: 1, last: день() } } });

  о.раздел('Краш: пять раундов подряд');
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(400);
  await p.click('#goCrash'); await p.waitForTimeout(600);
  const точки = [];
  for (let i = 0; i < 5; i++) {
    await жди(p, () => !document.getElementById('cGo').disabled &&
      /Войти|Ставк|Играть/i.test(document.getElementById('cGo').textContent));
    await p.click('#cGo');
    await жди(p, () => document.getElementById('cMult').className.includes('boom'), 35000);
    точки.push(await p.evaluate(() => +document.getElementById('cMult').textContent.replace('×', '')));
    await p.waitForTimeout(2800);
  }
  о.проверка('обрывы в пределах закона ×1…×25', точки.every(x => x >= 1 && x <= 25), '×' + точки.join(', ×'));
  const ж = (await состояние(p)).gm;
  о.проверка('все пять раундов в журнале', ж.n === 5, 'сыграно ' + ж.n);

  о.раздел('ПВП');
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(400);
  await p.click('#goPvp'); await p.waitForTimeout(700);
  const банк0 = await p.evaluate(() => +document.getElementById('pPot').textContent.replace(/[^0-9]/g, ''));
  const обещано = await p.evaluate(() =>
    +((document.getElementById('pFee').textContent.match(/([0-9\s ]+)\s*★/) || [])[1] || '0').replace(/[^0-9]/g, ''));
  о.проверка('под банком названа выплата за вычетом 5%', обещано === Math.floor(банк0 * 0.95),
    'банк ' + банк0 + ' → ' + обещано);
  await жди(p, () => !document.getElementById('pGo').disabled && /Войти/.test(document.getElementById('pGo').textContent));
  await p.click('#pGo');
  const дошло = await жди(p, () => /Победа|Выиграл/.test(document.getElementById('pGo').textContent), 30000);
  о.проверка('раунд дошёл до результата', дошло,
    await p.evaluate(() => document.getElementById('pGo').textContent.trim()));

  о.раздел('кейсы');
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(400);
  await p.click('#goCases'); await p.waitForTimeout(700);
  await p.click('#kList .ccard:not(.free)'); await p.waitForTimeout(600);
  await жди(p, () => !document.getElementById('kGo').disabled &&
    /Открыть/.test(document.getElementById('kGo').textContent), 9000);
  await p.click('#kGo');
  const выпало = await жди(p, () => /★/.test(document.getElementById('kSub').textContent) &&
    !/Открываем/.test(document.getElementById('kSub').textContent), 18000);
  о.проверка('кейс открылся', выпало, await p.evaluate(() => document.getElementById('kSub').textContent.trim()));
  await p.waitForTimeout(2400);
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(300);
  await p.click('#goCases'); await p.waitForTimeout(600);
  await p.click('#kList .ccard.free').catch(() => {}); await p.waitForTimeout(700);
  о.проверка('бесплатный кейс требует условий, а не открывается даром',
    await p.evaluate(() => document.getElementById('fcSheet') &&
      document.getElementById('fcSheet').getAttribute('aria-hidden') === 'false'));
  await p.click('#fcX', { force: true }).catch(() => {}); await p.waitForTimeout(400);

  о.раздел('сохранность и языки');
  const до = await состояние(p);
  await p.reload(); await p.waitForTimeout(1800);
  const после = await состояние(p);
  о.проверка('баланс, журнал и серия пережили перезагрузку',
    Math.abs(после.bal - до.bal) < 1 && после.gm.n === до.gm.n && после.dl.last === до.dl.last,
    до.bal.toFixed(2) + '→' + после.bal.toFixed(2) + ', раундов ' + после.gm.n);
  /* Лента иксов сверху — то, по чему человек решает, ставить ли. Жила
     она только в памяти открытой страницы: зашёл заново — пусто, и
     решать не по чему. */
  о.проверка('лента множителей Краша пережила перезагрузку',
    Array.isArray(после.ch) && после.ch.length > 0 &&
    JSON.stringify(после.ch) === JSON.stringify(до.ch),
    (до.ch || []).slice(0, 3).join(', ') + ' → ' + (после.ch || []).slice(0, 3).join(', '));
  await require('./helpers').закрытьШаги(p);
  await p.click('.tab[data-p="games"]'); await p.waitForTimeout(300);
  await p.click('#goCrash'); await p.waitForTimeout(700);
  о.проверка('и показана на экране Краша сразу при входе',
    (await p.evaluate(() => document.querySelectorAll('#cHist i').length)) > 0,
    await p.evaluate(() => document.getElementById('cHist').textContent));
  await require('./helpers').закрытьШаги(p);
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(400);
  for (const я of ['en', 'uk', 'ru']) {
    await p.click('#langSeg button[data-lang="' + я + '"]').catch(() => {});
    await p.waitForTimeout(500);
    const сырые = await p.evaluate(() => {
      const п = [];
      document.querySelectorAll('body *').forEach(el => {
        if (el.children.length) return;
        const s = (el.textContent || '').trim();
        if (/^[a-z][a-z0-9]*_[a-z0-9_]+$/.test(s)) п.push(s);
      });
      return [...new Set(п)];
    });
    о.проверка('смена языка на ' + я, сырые.length === 0, сырые.join(', '));
  }
  о.проверка('ошибок страницы за прогон нет', p.ошибки.length === 0, p.ошибки[0] || '');

  await p.close();
  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
