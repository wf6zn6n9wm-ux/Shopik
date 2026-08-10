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
  ок((await стр.locator('#сетка .кл').count()) === 50, 'в сетке 50 уровней');
  ок((await стр.locator('#сетка .кл.закр').count()) === 49, 'открыт только первый уровень');
  ок((await стр.textContent('#звёзды')) === '0', 'звёзд поначалу нет');
  ок((await стр.locator('#сетка .кл').first().textContent()).includes('10'),
    'на первом уровне обещано 10 звёзд');
  ок((await стр.locator('#сетка .кл').nth(49).textContent()).includes('🔒'),
    'пятидесятый закрыт');
  ок((await стр.locator('.баланс svg').count()) === 1, 'в шапке телеграм-звезда картинкой');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-menu.png'), fullPage: true });

  /* ── Гараж ──────────────────────────────────────────────── */
  console.log('\nгараж');
  await стр.locator('#tabs button').nth(1).click();
  await стр.waitForTimeout(200);
  ок((await стр.locator('#гараж .тр').count()) === 5, 'пять видов транспорта');
  ок((await стр.locator('#гараж .тр.выбран').count()) === 1, 'один выбран — велосипед');
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
  await стр.locator('#tabs button').nth(0).click();

  /* ── Заезд ──────────────────────────────────────────────── */
  console.log('\nзаезд');
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
  ок((await стр.locator('#сетка .кл.закр').count()) === 48, 'открылся второй уровень');
  ок((await стр.textContent('#звёзды')) === '10', 'баланс в шапке обновился');
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
  await стр.locator('#tabs button').nth(1).click();
  await стр.waitForTimeout(200);
  const можно = await стр.locator('#гараж .тр button:not([disabled])').count();
  ок(можно === 3, 'на 350 звёзд доступны велосипед, электро за 100 и мотоцикл за 200');
  await стр.locator('#гараж .тр').nth(1).locator('button').click();
  await стр.waitForTimeout(250);
  ок((await стр.textContent('#звёзды')) === '250', 'после покупки за 100 осталось 250');
  ок((await стр.locator('#гараж .тр').nth(1).getAttribute('class')).includes('выбран'),
    'купленный транспорт сразу выбран');
  await стр.locator('#tabs button').nth(0).click();
  await стр.locator('#сетка .кл').first().click();
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
  await стр.locator('#tabs button').nth(1).click();
  await стр.waitForTimeout(200);
  const цветных = await цвета();
  await стр.locator('#tabs button').nth(0).click();
  await стр.click('#btnStyle');
  ок((await стр.textContent('#btnStyle')).includes('силуэт'), 'кнопка переключает вид на силуэт');
  await стр.locator('#tabs button').nth(1).click();
  await стр.waitForTimeout(200);
  const силуэтных = await цвета();
  ок(силуэтных < цветных, 'в силуэте оттенков меньше, чем в цветном (' + силуэтных + ' < ' + цветных + ')');
  await стр.locator('#tabs button').nth(0).click();
  await стр.click('#btnStyle');
  ок((await стр.textContent('#btnStyle')).includes('ретро'), 'дальше — ретро');
  await стр.click('#btnStyle');
  ок((await стр.textContent('#btnStyle')).includes('цветной'), 'и по кругу обратно к цветному');

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
