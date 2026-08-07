/* Ежедневный бонус: лесенка на шестьдесят дней, самолистающаяся полоса
   и обратный отсчёт до следующего. */
const { браузер, открыть, день, Отчёт } = require('./helpers');

const снимок = p => p.evaluate(() => {
  const кл = [...document.getElementById('bnDays').children];
  const now = document.querySelector('#bnDays .dday.now');
  const d = document.getElementById('bnDays');
  return {
    дней: кл.length,
    суммы: кл.map(c => +c.querySelector('.v').textContent),
    сейчас: now ? кл.indexOf(now) + 1 : 0,
    вцентре: now ? Math.abs((now.getBoundingClientRect().left + now.getBoundingClientRect().right) / 2 -
      (d.getBoundingClientRect().left + d.getBoundingClientRect().right) / 2) : null,
    взято: d.querySelectorAll('.dday.got').length,
    прокрутка: Math.round(d.scrollLeft),
    кнопка: document.getElementById('bnGo').textContent.trim(),
    кольцо: document.getElementById('bnVal').textContent,
    подпись: document.getElementById('bnCap').textContent
  };
});
const открытьБонус = async (b, ст, ш) => {
  const p = await открыть(b, { состояние: ст, ширина: ш || 393 });
  await p.click('#btnBonus'); await p.waitForTimeout(700);
  return p;
};

(async () => {
  const о = new Отчёт('bonus');
  const b = await браузер();

  о.раздел('лесенка');
  let p = await открытьБонус(b, { bal: 100, fs: { d: день() }, dl: { streak: 0, last: '' } });
  let v = await снимок(p);
  о.проверка('шестьдесят дней', v.дней === 60, v.дней + ' плиток');
  о.проверка('первый день 10 ★', v.суммы[0] === 10, v.кнопка);
  о.проверка('дальше по одной звезде', v.суммы.slice(1).every(x => x === 1),
    v.суммы.slice(0, 5).join(', ') + ' … ' + v.суммы.slice(-2).join(', '));
  о.проверка('за всю серию 69 ★', v.суммы.reduce((a, c) => a + c, 0) === 69);
  await p.close();

  о.раздел('полоса доезжает сама');
  p = await открытьБонус(b, { bal: 100, fs: { d: день() }, dl: { streak: 33, last: день(1) } });
  v = await снимок(p);
  о.проверка('предстоит день 34', v.сейчас === 34, 'кольцо ' + v.кольцо);
  о.проверка('полоса пролистана без человека', v.прокрутка > 200, 'сдвиг ' + v.прокрутка + ' px');
  о.проверка('свой день по центру', v.вцентре < 3, 'отклонение ' + v.вцентре.toFixed(1) + ' px');
  о.проверка('прошлые дни отмечены', v.взято === 33, v.взято + ' закрыто');
  const до = v.прокрутка;
  await p.click('#bnGo'); await p.waitForTimeout(1400);
  const после = await снимок(p);
  о.проверка('после «Забрать» переезд короткий', после.прокрутка > до && после.прокрутка - до < 160,
    до + ' → ' + после.прокрутка + ' px');
  await p.close();

  о.раздел('края лесенки');
  p = await открытьБонус(b, { bal: 100, fs: { d: день() }, dl: { streak: 60, last: день(1) } });
  v = await снимок(p);
  о.проверка('после шестидесятого серия с начала', v.сейчас === 1 && v.суммы[0] === 10, v.кнопка);
  await p.close();
  p = await открытьБонус(b, { bal: 100, fs: { d: день() }, dl: { streak: 20, last: день(3) } });
  v = await снимок(p);
  о.проверка('пропуск дня обнуляет', v.сейчас === 1 && v.взято === 0);
  await p.close();

  о.раздел('обратный отсчёт');
  p = await открытьБонус(b, { bal: 100, fs: { d: день() }, dl: { streak: 1, last: день() } });
  v = await снимок(p);
  о.проверка('формат «часы:минуты:секунды»', /^\d{2}:\d{2}:\d{2}$/.test(v.кольцо), '«' + v.кольцо + '»');
  о.проверка('подписан как остаток', /следующего|next|наступного/i.test(v.подпись), v.подпись);
  const всек = x => { const [h, m, s] = x.split(':').map(Number); return h * 3600 + m * 60 + s; };
  const a = всек((await снимок(p)).кольцо);
  await p.waitForTimeout(2300);
  const c = всек((await снимок(p)).кольцо);
  о.проверка('отсчёт идёт назад посекундно', a - c >= 2 && a - c <= 3, (a - c) + ' с за 2.3 с');
  const влез = await p.evaluate(() => {
    const v = document.getElementById('bnVal');
    return v.getBoundingClientRect().width < document.querySelector('.bnring').getBoundingClientRect().width - 30;
  });
  о.проверка('строка влезает в кольцо', влез);
  await p.close();

  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
