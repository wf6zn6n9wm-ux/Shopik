/* Обход всего приложения: три языка × три размера. Ищем ошибки страницы,
   сырые ключи вместо перевода и обрезанный текст.

   Важно: надписи, вшитые в картинки баннеров, эта проверка не видит —
   там нет текста. Их сверяют глазами. */
const { браузер, открыть, день, Отчёт } = require('./helpers');

(async () => {
  const о = new Отчёт('smoke');
  const b = await браузер();
  for (const я of ['ru', 'en', 'uk']) {
    for (const [w, h] of [[360, 640], [393, 752], [430, 932]]) {
      const p = await открыть(b, {
        язык: я, ширина: w, высота: h,
        состояние: { bal: 5000, inv: 2000, fs: { d: день() }, dl: { streak: 2, last: день() }, tk: { sub: 'got' } }
      });

      const шаги = [['earn', null], ['games', null], ['games', '#goCrash'], ['games', '#goPvp'],
                    ['games', '#goCases'], ['tasks', null], ['top', null], ['me', null]];
      for (const [вкл, вн] of шаги) {
        await p.click('.tab[data-p="' + вкл + '"]').catch(() => {});
        await p.waitForTimeout(350);
        if (вн) { await p.click(вн).catch(() => {}); await p.waitForTimeout(600); }
      }
      await p.click('.tab[data-p="me"]').catch(() => {}); await p.waitForTimeout(300);
      for (const [откр, закр] of [['#btnBonus', '#bnX'], ['#btnBell', '#ntX'], ['#btnAdd', '#dpX'],
                                  ['#pRef', '#rfX'], ['#pHist', '#ghX'], ['#setRules', '#rlX']]) {
        await p.click(откр, { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(500);
        await p.click(закр, { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(350);
      }
      await p.click('.tab[data-p="earn"]').catch(() => {}); await p.waitForTimeout(300);
      for (const [откр, закр] of [['[data-i18n="withdraw"]', '#wdX'], ['[data-i18n="boost"]', '#bsX'],
                                  ['[data-i18n="calc"]', '#cxX']]) {
        await p.click(откр, { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(500);
        await p.click(закр, { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(350);
      }

      const сырые = await p.evaluate(() => {
        const п = [];
        document.querySelectorAll('body *').forEach(el => {
          if (el.children.length) return;
          const s = (el.textContent || '').trim();
          if (/^[a-z][a-z0-9]*_[a-z0-9_]+$/.test(s)) п.push(s);
        });
        return [...new Set(п)];
      });
      const обрез = await p.evaluate(() => {
        const п = [];
        document.querySelectorAll('.nm,.gt,.k,.v,.t,.tl,.cap,.bp').forEach(el => {
          if (el.children.length || !el.offsetParent) return;
          const s = getComputedStyle(el);
          if (s.whiteSpace !== 'nowrap' || s.textOverflow !== 'ellipsis') return;
          if (el.scrollWidth > el.clientWidth + 1) п.push((el.textContent || '').trim().slice(0, 28));
        });
        return [...new Set(п)];
      });

      const метка = я + ' ' + w + '×' + h;
      о.проверка(метка, p.ошибки.length === 0 && сырые.length === 0 && обрез.length === 0,
        'ошибок ' + p.ошибки.length + ', сырых ключей ' + сырые.length + ', обрезано ' + обрез.length);
      p.ошибки.slice(0, 2).forEach(e => о.замечание(e));
      if (сырые.length) о.замечание('ключи: ' + сырые.join(', '));
      if (обрез.length) о.замечание('обрезано: ' + обрез.join(' | '));
      await p.close();
    }
  }
  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
