/* Проверки Gravity Defied в браузере: меню на 50 уровней, гараж, звёзды,
   заезд, шторки, рекорды. Требует playwright + chromium.

   node tests/gravity-ui.js [--shots]   — с --shots кладёт снимки в /tmp */
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
  catch (e2) { console.log('playwright не найден — пропускаю браузерные проверки'); process.exit(0); }
}

const адрес = 'file://' + path.join(__dirname, '..', 'gravity', 'index.html');
const снимки = process.argv.includes('--shots');
const кудаСнимки = process.env.SHOT_DIR || '/tmp';

let плохо = 0;
function ок(условие, что) {
  if (условие) console.log('  ✓ ' + что);
  else { console.log('  ✗ ' + что); плохо++; }
}

/* Довозит байк до флага и жмёт газ — так заезд закрывается за секунду. */
async function кФинишу(стр) {
  await стр.evaluate(() => {
    const { игра } = window.ГД, б = игра.бк, тр = игра.тр;
    const y = (x) => { const p = тр.точки; let i = 0;
      while (i < p.length - 2 && p[i + 1].x < x) i++;
      const a = p[i], c = p[i + 1];
      return a.y + (c.y - a.y) * ((x - a.x) / (c.x - a.x || 1)); };
    б.з.x = тр.финиш - 1; б.з.y = y(б.з.x) + б.т.r;
    б.п.x = б.з.x + б.т.база; б.п.y = y(б.п.x) + б.т.r;
    б.з.vx = б.п.vx = 4; б.з.vy = б.п.vy = 0;
  });
  await стр.keyboard.down('ArrowUp');
  await стр.waitForTimeout(900);
  await стр.keyboard.up('ArrowUp');
}

(async () => {
  const браузер = await chromium.launch();

  /* ── Меню ───────────────────────────────────────────────── */
  console.log('меню');
  const стр = await браузер.newPage({ viewport: { width: 420, height: 780 } });
  const ошибки = [];
  стр.on('pageerror', (e) => ошибки.push(String(e)));
  стр.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text()); });
  await стр.goto(адрес);
  await стр.waitForTimeout(400);

  ок(await стр.isVisible('#menu'), 'меню открыто при запуске');
  ок(await стр.isVisible('#экран-главный'), 'сразу виден главный экран, а не сетка уровней');
  ок(!(await стр.isVisible('#экран-уровни')), 'уровни спрятаны за кнопкой');
  ок((await стр.locator('#экран-главный .меню button').count()) === 5,
    'пять кнопок: играть, уровни, гараж, настройки, как играть');
  ок((await стр.textContent('#btnPlay')).includes('уровень 1'), '«Играть» ведёт на текущий уровень');
  ок((await стр.textContent('#уровниПодпись')).includes('0 / 50'), 'у «Уровней» счётчик пройденных');
  ок((await стр.textContent('#звёзды')) === '0', 'звёзд поначалу нет');
  ок((await стр.locator('.баланс svg').count()) === 1, 'в шапке телеграм-звезда картинкой');
  ок(!(await стр.isVisible('#назад')), 'на главном экране кнопки «назад» нет');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-menu.png'), fullPage: true });

  /* ── Разделы ────────────────────────────────────────────── */
  console.log('\nразделы');
  await стр.click('[data-экран="уровни"]');
  await стр.waitForTimeout(200);
  ок(await стр.isVisible('#назад'), 'в разделе появляется «назад»');
  ок((await стр.textContent('#заголовок')) === 'Уровни', 'заголовок меняется на название раздела');
  ок((await стр.locator('#сетка .кл').count()) === 50, 'в сетке 50 уровней');
  ок((await стр.locator('#сетка .кл.закр').count()) === 49, 'открыт только первый уровень');
  ок((await стр.locator('#сетка .кл').first().textContent()).includes('10'),
    'на первом уровне обещано 10 звёзд');
  ок((await стр.locator('#сетка .кл').nth(1).textContent()).includes('🔒'),
    'второй пока закрыт — награда не показана');
  ок((await стр.locator('#сетка .кл').nth(49).textContent()).includes('🔒'), 'пятидесятый закрыт');
  await стр.click('#назад');
  ок(await стр.isVisible('#экран-главный'), '«назад» возвращает на главный экран');

  await стр.click('[data-экран="правила"]');
  await стр.waitForTimeout(200);
  const правила = await стр.textContent('#правила');
  ок(правила.includes('10') && правила.includes('по 5'), 'в правилах написано про 10 и по 5 звёзд');
  ок(правила.includes('100') && правила.includes('500'), 'и про цены транспорта');
  ок(правила.includes('шею'), 'и про то, чем заканчивается касание головой');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-rules.png'), fullPage: true });
  await стр.click('#назад');

  await стр.click('[data-экран="настройки"]');
  await стр.waitForTimeout(200);
  ок((await стр.locator('#экран-настройки button').count()) === 4,
    'в настройках четыре пункта: звук, вид, транспорт, сброс');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-settings.png'), fullPage: true });
  await стр.click('#назад');

  /* ── Гараж ──────────────────────────────────────────────── */
  console.log('\nгараж');
  await стр.click('[data-экран="гараж"]');
  await стр.waitForTimeout(200);
  ок((await стр.locator('#гараж .тр').count()) === 5, 'пять видов транспорта');
  ок((await стр.locator('#гараж .тр.выбран').count()) === 1, 'один выбран — велосипед');
  /* По умолчанию открыт весь транспорт — чтобы можно было просто покататься. */
  ок((await стр.locator('#гараж .тр button:not([disabled])').count()) === 4,
    'при «всё открыто» любой транспорт можно выбрать');
  ок((await стр.locator('#гараж .тр button').allTextContents()).join(' ').indexOf('Купить') < 0,
    'кнопок покупки в этом режиме нет');

  /* Переключаем на честные правила: транспорт по уровням и за звёзды. */
  await стр.click('#назад');
  await стр.click('[data-экран="настройки"]');
  await стр.click('#btnAll');
  ок((await стр.textContent('#btnAll')).includes('по уровням'), 'кнопка переключает на правила');
  await стр.click('#назад');
  await стр.click('[data-экран="гараж"]');
  await стр.waitForTimeout(200);
  const ценники = await стр.locator('#гараж .тр button').allTextContents();
  ок(ценники.join(' ').includes('100') && ценники.join(' ').includes('500'),
    'цены видны на кнопках покупки');
  const активных = await стр.locator('#гараж .тр button:not([disabled])').count();
  ок(активных === 0, 'без звёзд ничего не купить');
  const холсты = await стр.locator('#гараж canvas').count();
  ок(холсты === 5, 'у каждого транспорта своя картинка');
  const нарисовано = await стр.evaluate(() => {
    const c = document.querySelector('#гараж canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 17) if (d[i] > 30) n++;
    return n;
  });
  ок(нарисовано > 20, 'картинка транспорта не пустая (' + нарисовано + ' точек)');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-garage.png'), fullPage: true });
  await стр.click('#назад');

  /* ── Заезд ──────────────────────────────────────────────── */
  console.log('\nзаезд');
  await стр.click('[data-экран="уровни"]');
  await стр.locator('#сетка .кл').first().click();
  await стр.waitForTimeout(300);
  ок(!(await стр.isVisible('#menu')), 'по клику на уровень меню уходит');
  ок((await стр.textContent('#hudName')).includes('Уровень 1'), 'в шапке номер уровня');
  ок((await стр.textContent('#hudName')).includes('Велосипед'), 'и название транспорта');

  const где = () => стр.evaluate(() => window.ГД.игра.бк.з.x);
  const старт = await где();
  await стр.keyboard.down('ArrowUp');
  await стр.waitForTimeout(2500);
  const доехал = await где();
  await стр.keyboard.up('ArrowUp');
  ок(доехал > старт + 8, 'на стрелке вверх байк едет вперёд (' + (доехал - старт).toFixed(1) + ' м)');
  ок((await стр.textContent('#time')) !== '0:00.00', 'таймер тикает');
  ок(parseFloat(await стр.evaluate(() => document.getElementById('barFill').style.width)) > 0,
    'полоса прогресса растёт');
  const зелень = await стр.evaluate(() => {
    const c = document.getElementById('cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let з = 0, б = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      if (d[i + 1] > 120 && d[i] < 120 && d[i + 2] < 120) з++;
      if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) б++;
    }
    return { з, б };
  });
  ок(зелень.з > 20, 'зелёный рельеф на холсте (' + зелень.з + ' точек)');
  ок(зелень.б > 100, 'фон белый, как в оригинале');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-ride.png') });

  /* ── Падение ────────────────────────────────────────────── */
  console.log('\nпадение и финиш');
  await стр.evaluate(() => { const б = window.ГД.игра.бк; б.з.y -= 400; б.п.y -= 400; });
  await стр.waitForTimeout(1600);
  ок(await стр.isVisible('#over'), 'после падения показана шторка');
  ок((await стр.textContent('#ovTitle')) === 'Падение', 'шторка про падение');
  ок((await стр.textContent('#ovПриз')).trim() === '', 'за падение звёзд не дают');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-crash.png') });
  await стр.click('#ovMain');
  await стр.waitForTimeout(300);
  ок(!(await стр.isVisible('#over')) && (await где()) < старт + 1, '«Заново» ставит байк на старт');

  /* ── Финиш и звёзды ─────────────────────────────────────── */
  await кФинишу(стр);
  ок(await стр.isVisible('#over'), 'на финише показана шторка');
  ок((await стр.textContent('#ovTitle')) === 'Финиш', 'шторка про финиш');
  ок((await стр.textContent('#ovПриз')).includes('+10'), 'начислено 10 звёзд за первый уровень');
  ок((await стр.textContent('#ovMain')) === 'Уровень 2', 'кнопка ведёт на следующий уровень');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-finish.png') });

  const сейв = await стр.evaluate(() => JSON.parse(localStorage.getItem('gd_v2')));
  ок(сейв && сейв.звёзды === 10, 'звёзды записаны в localStorage');
  ок(сейв && сейв.пройдено.indexOf(1) >= 0, 'уровень отмечен пройденным');

  /* Второй заезд по тому же уровню звёзд больше не приносит. */
  await стр.click('#ovMenu');
  await стр.waitForTimeout(200);
  ок((await стр.textContent('#звёзды')) === '10', 'баланс в шапке обновился');
  ок((await стр.textContent('#btnPlay')).includes('уровень 2'), '«Играть» ведёт уже на второй уровень');
  await стр.click('[data-экран="уровни"]');
  await стр.waitForTimeout(150);
  ок((await стр.locator('#сетка .кл.закр').count()) === 48, 'открылся второй уровень');
  ок((await стр.locator('#сетка .кл').nth(1).textContent()).includes('5'),
    'и обещает 5 звёзд, а не 10');
  await стр.locator('#сетка .кл').first().click();
  await стр.waitForTimeout(200);
  await кФинишу(стр);
  ок((await стр.textContent('#ovПриз')).trim() === '', 'за повторное прохождение звёзд нет');
  ок((await стр.textContent('#ovSub')).includes('уже получены'), 'и об этом сказано');
  await стр.click('#ovMenu');

  /* ── Покупка транспорта ─────────────────────────────────── */
  console.log('\nпокупка');
  await стр.evaluate(() => {
    window.ГД.получитьСейв().звёзды = 350; window.ГД.сохранить(); window.ГД.рисоватьМеню();
  });
  await стр.click('[data-экран="гараж"]');
  await стр.waitForTimeout(200);
  const можно = await стр.locator('#гараж .тр button:not([disabled])').count();
  ок(можно === 3, 'на 350 звёзд доступны велосипед, электро за 100 и мотоцикл за 200');
  await стр.locator('#гараж .тр').nth(1).locator('button').click();
  await стр.waitForTimeout(250);
  ок((await стр.textContent('#звёзды')) === '250', 'после покупки за 100 осталось 250');
  ок((await стр.locator('#гараж .тр').nth(1).getAttribute('class')).includes('выбран'),
    'купленный транспорт сразу выбран');
  await стр.click('#назад');
  await стр.click('#btnPlay');
  await стр.waitForTimeout(300);
  ок((await стр.textContent('#hudName')).includes('Электровелосипед'), 'в заезд едем на купленном');
  await стр.evaluate(() => window.ГД.вменю());

  /* ── Раскладка на разных экранах ────────────────────────── */
  console.log('\nразмеры');
  for (const [w, h] of [[320, 480], [390, 844], [768, 1024], [1280, 800]]) {
    await стр.setViewportSize({ width: w, height: h });
    await стр.waitForTimeout(250);
    const влез = await стр.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1 &&
      document.getElementById('cv').width > 0);
    ок(влез, w + '×' + h + ' — ничего не вылезает за экран');
  }
  /* ── Стиль отрисовки ────────────────────────────────────── */
  console.log('\nвид');
  await стр.setViewportSize({ width: 420, height: 780 });
  await стр.waitForTimeout(150);
  const цвета = async () => стр.evaluate(() => {
    const c = document.querySelector('#гараж canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const набор = new Set();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) набор.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return набор.size;
  });
  await стр.click('[data-экран="гараж"]');
  await стр.waitForTimeout(200);
  const цветных = await цвета();
  await стр.click('#назад');
  await стр.click('[data-экран="настройки"]');
  await стр.click('#btnStyle');
  ок((await стр.textContent('#btnStyle')).includes('силуэт'), 'кнопка переключает вид на силуэт');
  await стр.click('#назад');
  await стр.click('[data-экран="гараж"]');
  await стр.waitForTimeout(200);
  const силуэтных = await цвета();
  ок(силуэтных < цветных, 'в силуэте оттенков меньше, чем в цветном (' + силуэтных + ' < ' + цветных + ')');
  await стр.click('#назад');
  await стр.click('[data-экран="настройки"]');
  await стр.click('#btnStyle');
  ок((await стр.textContent('#btnStyle')).includes('ретро'), 'дальше — ретро');
  await стр.click('#btnStyle');
  ок((await стр.textContent('#btnStyle')).includes('цветной'), 'и по кругу обратно к цветному');
  await стр.click('#назад');

  /* ── Звук ───────────────────────────────────────────────── */
  console.log('\nзвук');
  await стр.evaluate(() => { window.ГД.получитьСейв().выбран = 'velo'; window.ГД.сохранить(); });
  await стр.click('#btnPlay');
  await стр.waitForTimeout(200);
  await стр.keyboard.down('ArrowUp');
  await стр.waitForTimeout(400);
  await стр.keyboard.up('ArrowUp');
  const звукВело = await стр.evaluate(() => window.ГД.звук.вид);
  ок(звукВело === 'вело' || звукВело === null,
    'на велосипеде собрана велосипедная цепочка' + (звукВело ? '' : ' (звук в этой сборке недоступен)'));
  if (звукВело) {
    const узлы = await стр.evaluate(() => Object.keys(window.ГД.звук.у));
    ок(узлы.indexOf('тик') >= 0 && узлы.indexOf('ветер') >= 0,
      'у велосипеда трещотка и шелест покрышек, а не мотор');
    await стр.evaluate(() => window.ГД.вменю());
    await стр.evaluate(() => { window.ГД.получитьСейв().выбран = 'cross'; window.ГД.сохранить(); });
    await стр.click('#btnPlay');
    await стр.waitForTimeout(250);
    const свед = await стр.evaluate(() => ({ вид: window.ГД.звук.вид, узлы: Object.keys(window.ГД.звук.у) }));
    ок(свед.вид === 'кросс', 'на кроссовом цепочка пересобралась');
    ок(свед.узлы.indexOf('выхлоп') >= 0 && свед.узлы.indexOf('тик') < 0,
      'у мотоцикла выхлоп и мотор вместо трещотки');
    await стр.evaluate(() => window.ГД.вменю());
    ок((await стр.evaluate(() => window.ГД.звук.у)) === null, 'в меню звук глушится полностью');
  }

  /* Громкость меряем объективно: рендерим две секунды каждого транспорта
     в OfflineAudioContext. Раньше звук резал уши — теперь за этим следит
     проверка, а не ухо. */
  const уровни = await стр.evaluate(async () => {
    const { звук, ТРАНСПОРТ } = window.ГД;
    const итог = [];
    for (const т of ТРАНСПОРТ) {
      const off = new OfflineAudioContext(1, 44100 * 2, 44100);
      const з = Object.assign(Object.create(Object.getPrototypeOf(звук)), звук);
      з.ac = off; з.у = null;
      const мягко = off.createBiquadFilter(); мягко.type = 'lowpass'; мягко.frequency.value = 3200;
      const жим = off.createDynamicsCompressor(); жим.threshold.value = -18; жим.ratio.value = 6;
      з.мастер = off.createGain(); з.мастер.gain.value = 1;
      з.мастер.connect(мягко); мягко.connect(жим); жим.connect(off.destination);
      з.буфер = off.createBuffer(1, 44100 * 2, 44100);
      const d = з.буфер.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      з.собрать(т);
      з.кадр({ т, упал: false, з: { vx: т.макс * 0.7, vy: 0, на: true }, п: { на: true } },
             { gas: 1, brake: 0, lean: 0 });
      const ch = (await off.startRendering()).getChannelData(0);
      let пик = 0, сум = 0;
      for (let i = 22050; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > пик) пик = a; сум += ch[i] * ch[i]; }
      итог.push({ имя: т.имя, пик, rms: Math.sqrt(сум / (ch.length - 22050)) });
    }
    return итог;
  });
  const тихий = уровни.every((у) => у.пик < 0.5 && у.rms > 0.008 && у.rms < 0.12);
  ок(тихий, 'звук у всех в безопасной громкости: ' +
    уровни.map((у) => у.имя.slice(0, 5) + ' ' + у.rms.toFixed(3)).join(', '));
  const разброс = Math.max(...уровни.map((у) => у.rms)) / Math.min(...уровни.map((у) => у.rms));
  ок(разброс < 2.5, 'ни один транспорт не громче остальных в разы (разброс ×' + разброс.toFixed(1) + ')');

  ок(ошибки.length === 0, 'в консоли пусто' + (ошибки.length ? ': ' + ошибки[0] : ''));

  /* ── Битое сохранение ───────────────────────────────────── */
  const стр2 = await браузер.newPage({ viewport: { width: 420, height: 780 } });
  await стр2.addInitScript(() => localStorage.setItem('gd_v2', '{сломано'));
  await стр2.goto(адрес);
  await стр2.waitForTimeout(300);
  ок(await стр2.isVisible('#menu'), 'битое сохранение не роняет игру');
  const стр3 = await браузер.newPage({ viewport: { width: 420, height: 780 } });
  await стр3.addInitScript(() =>
    localStorage.setItem('gd_v2', JSON.stringify({ звёзды: 'много', куплено: null, пройдено: 7 })));
  await стр3.goto(адрес);
  await стр3.waitForTimeout(300);
  ок(await стр3.isVisible('#menu'), 'подложенное состояние тоже переживается');
  ок((await стр3.textContent('#звёзды')) === '0', 'мусор в балансе сбрасывается в ноль');

  await браузер.close();
  console.log(плохо ? '\n' + плохо + ' замечаний' : '\nвсё чисто');
  process.exit(плохо ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
