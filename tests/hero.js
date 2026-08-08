/* Баланс на первом экране: оформление и подгонка кегля под длинные суммы. */
const { браузер, открыть, день, Отчёт } = require('./helpers');

const мера = p => p.evaluate(() => {
  const big = document.querySelector('.hero .big');
  const зазор = parseFloat(getComputedStyle(big).gap) || 0;
  let надо = 0;
  for (const c of big.children) надо += c.getBoundingClientRect().width;
  надо += зазор * (big.children.length - 1);
  const s = getComputedStyle(big);
  return { кегль: Math.round(parseFloat(s.fontSize)), цвет: s.color, вес: s.fontWeight,
           цифры: s.fontVariantNumeric, ширина: s.fontStretch,
           занято: Math.round(надо), есть: Math.round(big.clientWidth),
           текст: big.querySelector('.num').textContent };
});
const открытьС = (b, w, бал) => открыть(b, {
  ширина: w, состояние: { bal: бал, inv: 0, fs: { d: день() }, dl: { streak: 2, last: день() } }
});

(async () => {
  const о = new Отчёт('hero');
  const b = await браузер();

  о.раздел('оформление');
  let p = await открытьС(b, 393, 12480.42);
  let v = await мера(p);
  о.проверка('цвет золотой', v.цвет === 'rgb(228, 192, 120)', v.цвет);
  о.проверка('вес плотный', +v.вес >= 600, 'вес ' + v.вес);
  о.проверка('цифры табличные', /tabular-nums/.test(v.цифры), v.цифры);
  о.проверка('начертание узкое', /condensed|87\.5%|75%/.test(v.ширина), v.ширина);
  о.проверка('кегль около 50', v.кегль >= 48 && v.кегль <= 52, v.кегль + ' px');
  await p.close();

  о.раздел('подгонка под длинные суммы');
  let всёВлезло = true;
  for (const w of [360, 393, 430]) {
    for (const бал of [0, 12480.42, 1234567.89, 98765432.10]) {
      const pg = await открытьС(b, w, бал);
      const q = await мера(pg);
      const влез = q.занято <= q.есть + 1;
      if (!влез) всёВлезло = false;
      о.замечание(String(w).padStart(3) + ' px  «' + q.текст.padEnd(13) + '» кегль ' +
        String(q.кегль).padStart(2) + '  занято ' + String(q.занято).padStart(3) + ' из ' + q.есть +
        (влез ? '' : '  ВЫЛЕЗЛО'));
      await pg.close();
    }
  }
  о.проверка('любая сумма помещается на любом экране', всёВлезло);

  о.раздел('устойчивость');
  p = await открытьС(b, 393, 12480.42);
  const к1 = (await мера(p)).кегль;
  await p.waitForTimeout(2500);
  const к2 = (await мера(p)).кегль;
  о.проверка('кегль не скачет при начислении', к1 === к2, к1 + ' → ' + к2);
  await p.close();

  p = await открытьС(b, 393, 1234567.89);
  const до = (await мера(p)).кегль;
  await p.setViewportSize({ width: 752, height: 393 }); await p.waitForTimeout(700);
  const после = await мера(p);
  о.проверка('после поворота экрана строка влезает', после.занято <= после.есть + 1,
    'кегль ' + до + '→' + после.кегль);
  await p.close();

  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
