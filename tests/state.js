/* Битое и подложенное состояние. Приложение не должно падать и не должно
   верить кошельку на слово: localStorage игрок правит за десять секунд. */
const { браузер, открыть, Отчёт } = require('./helpers');

const СЛУЧАИ = [
  ['пусто', null],
  ['мусор', '{{{не json'],
  ['не объект', '"строка"'],
  ['пустой объект', '{}'],
  ['отрицательный баланс', '{"bal":-9999}'],
  ['баланс не число', '{"bal":"много"}'],
  ['бесконечность', '{"bal":1e309,"inv":1e309}'],
  ['серия за гранью', '{"dl":{"streak":9999,"last":"2020-01-01"}}'],
  ['журнал не массив', '{"gm":{"l":"нет","n":-5,"bx":"x"}}'],
  ['мусор в журнале', '{"gm":{"l":[{"g":1},null,{"g":"crash","b":"a","w":{},"t":0}],"n":3}}'],
  ['чужие поля', '{"bal":100,"__proto__":{"x":1},"tk":{"sub":{"a":1}}}'],
  ['день из будущего', '{"dl":{"streak":3,"last":"2099-01-01"},"dt":{"d":"2099-01-01","p":{"d_play":99},"g":{}}}']
];

(async () => {
  const о = new Отчёт('state');
  const b = await браузер();
  for (const [имя, ст] of СЛУЧАИ) {
    const p = await b.newPage({ viewport: { width: 393, height: 752 } });
    const ош = [];
    p.on('pageerror', e => ош.push(e.message));
    p.on('console', m => {
      if (m.type() === 'error' && !/TUNNEL|telegram-web-app/.test(m.text())) ош.push(m.text().slice(0, 80));
    });
    await p.addInitScript(с => {
      localStorage.setItem('starshash_prefs', JSON.stringify({ vibro: true, sound: false, lang: 'ru' }));
      if (с !== null) localStorage.setItem('starshash_state', с);
    }, ст);
    await p.goto(require('./helpers').АДРЕС);
    await p.waitForTimeout(1500);
    await require('./helpers').закрытьШаги(p);
    for (const в of ['games', 'tasks', 'top', 'me', 'earn']) {
      await p.click('.tab[data-p="' + в + '"]').catch(() => {});
      await p.waitForTimeout(250);
    }
    const итог = await p.evaluate(() => {
      const б = document.getElementById('pillBal').textContent;
      return { баланс: б, число: +б.replace(/[^\d.,-]/g, '').replace(/\s/g, '').replace(',', '.'),
               живой: !!document.querySelector('.page.on') };
    });
    const плохо = ош.length || !итог.живой || !isFinite(итог.число) || итог.число < 0 ||
                  /NaN|Infinity|undefined/.test(итог.баланс);
    о.проверка(имя, !плохо, 'баланс «' + итог.баланс + '»' + (ош.length ? ', ошибка: ' + ош[0] : ''));
    await p.close();
  }
  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
