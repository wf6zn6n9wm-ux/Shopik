/* Аватарка из Telegram. Фото приходит не всегда — часть точек запуска его
   не отдаёт, у закрытых профилей его нет, а ссылка со временем протухает.
   Поэтому проверяем обе стороны: и что фото подставляется, и что при его
   отсутствии остаётся буква, а не дырка в кружке. */
const { браузер, открыть, день, исходник, Отчёт } = require('./helpers');

/* однопиксельный png: настоящую ссылку из песочницы не загрузить, а нам
   важно, что картинка именно загрузилась — на onerror фото отбрасывается */
const ФОТО = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const СОСТ = { bal: 1000, fs: { d: день() }, dl: { streak: 1, last: день() } };

(async () => {
  const о = new Отчёт('avatar');
  const b = await браузер();

  о.раздел('фотография есть');
  let p = await открыть(b, {
    состояние: СОСТ,
    телеграм: { user: { id: 6029995640, first_name: 'Андрій', photo_url: ФОТО } }
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(600);
  const проф = await p.evaluate(() => {
    const e = document.getElementById('pAv');
    return { ph: e.classList.contains('ph'), фон: e.style.backgroundImage, текст: e.textContent.trim(),
             имя: document.getElementById('pNm').textContent };
  });
  о.проверка('в профиле фотография, а не буква',
    проф.ph && /^url\("data:image/.test(проф.фон) && проф.текст === '', проф.текст || проф.фон.slice(0, 30));
  о.проверка('имя взято из Telegram', проф.имя === 'Андрій', проф.имя);

  await p.click('.tab[data-p="top"]'); await p.waitForTimeout(700);
  const топ = await p.evaluate(() => {
    const e = document.querySelector('#tpMe .av');
    return e ? { ph: e.classList.contains('ph'), фон: e.style.backgroundImage } : null;
  });
  о.проверка('в таблице лидеров строка «Вы» с фотографией',
    !!топ && топ.ph && /^url\("data:image/.test(топ.фон), топ ? топ.фон.slice(0, 30) : 'строки нет');
  await p.close();

  о.раздел('фотографии нет');
  p = await открыть(b, {
    состояние: СОСТ,
    телеграм: { user: { id: 6029995640, first_name: 'Андрій' } }
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(600);
  const без = await p.evaluate(() => {
    const e = document.getElementById('pAv');
    return { ph: e.classList.contains('ph'), фон: e.style.backgroundImage, текст: e.textContent.trim() };
  });
  о.проверка('остаётся буква имени', !без.ph && !без.фон && без.текст === 'А',
    '«' + без.текст + '»' + (без.фон ? ' + фон ' + без.фон : ''));

  await p.click('.tab[data-p="top"]'); await p.waitForTimeout(700);
  const топБез = await p.evaluate(() => {
    const e = document.querySelector('#tpMe .av');
    return e ? { ph: e.classList.contains('ph'), текст: e.textContent.trim() } : null;
  });
  о.проверка('в таблице лидеров тоже буква', !!топБез && !топБез.ph && топБез.текст === 'В',
    топБез ? '«' + топБез.текст + '»' : 'строки нет');
  о.проверка('ошибок в консоли нет', p.ошибки.length === 0, p.ошибки.join(' | '));
  await p.close();

  о.раздел('битая ссылка на фото');
  p = await открыть(b, {
    состояние: СОСТ,
    телеграм: { user: { id: 6029995640, first_name: 'Андрій', photo_url: 'data:image/png;base64,нетакая' } }
  });
  await p.click('.tab[data-p="me"]'); await p.waitForTimeout(800);
  const битое = await p.evaluate(() => {
    const e = document.getElementById('pAv');
    return { ph: e.classList.contains('ph'), текст: e.textContent.trim() };
  });
  о.проверка('картинка не загрузилась — кружок не пустой',
    !битое.ph && битое.текст === 'А', '«' + битое.текст + '»');
  await p.close();

  о.раздел('в исходнике');
  const s = исходник();
  /* Кружок .av рисует один помощник. Ячейка рулетки .pxc живёт отдельно —
     у неё другой класс и своя рамка, её эта проверка не касается. */
  о.проверка('разметка кружка не размножена по спискам', !/class="av'\+\(p\.av/.test(s));
  о.проверка('фото не подставляется соперникам', /p\.me \? ФОТО\.есть\(\)/.test(s));

  await b.close();
  process.exit(о.итог() ? 0 : 1);
})();
