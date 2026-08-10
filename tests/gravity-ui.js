/* Проверки Gravity Defied в браузере: меню, заезд, шторки, рекорды.
   Требует playwright + chromium.

   node tests/gravity-ui.js [--shots]   — с --shots кладёт снимки в /tmp */
const path = require('path');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require(path.join(process.env.NPM_GLOBAL || '/opt/node22/lib', 'node_modules/playwright'))); }
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
  ок((await стр.locator('#tabs button').count()) === 3, 'три вкладки туров');
  ок((await стр.locator('.lvl').count()) === 6, 'шесть трасс в туре');
  ок((await стр.locator('.lvl.lock').count()) === 5, 'открыта только первая трасса');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-menu.png') });

  await стр.locator('.tabs button').nth(2).click();
  ок((await стр.locator('.tabs button.sel').textContent()) === 'Профи', 'вкладки туров переключаются');
  await стр.locator('.tabs button').nth(0).click();

  /* ── Заезд ──────────────────────────────────────────────── */
  console.log('\nзаезд');
  await стр.locator('.lvl').first().click();
  await стр.waitForTimeout(300);
  ок(!(await стр.isVisible('#menu')), 'по клику на трассу меню уходит');
  ок((await стр.textContent('#hudName')).includes('Новичок'), 'в шапке имя тура');

  const где = () => стр.evaluate(() => window.ГД.игра.бк.з.x);
  const старт = await где();
  await стр.keyboard.down('ArrowUp');
  await стр.waitForTimeout(2500);
  const доехал = await где();
  await стр.keyboard.up('ArrowUp');
  ок(доехал > старт + 8, 'на стрелке вверх байк едет вперёд (' + (доехал - старт).toFixed(1) + ' м)');
  ок((await стр.textContent('#time')) !== '0:00.00', 'таймер тикает');
  const полоса = await стр.evaluate(() => document.getElementById('barFill').style.width);
  ок(parseFloat(полоса) > 0, 'полоса прогресса растёт (' + полоса + ')');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-ride.png') });

  /* Рельеф действительно нарисован зелёным. */
  const зелень = await стр.evaluate(() => {
    const c = document.getElementById('cv');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let з = 0, б = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      if (d[i + 1] > 120 && d[i] < 120 && d[i + 2] < 120) з++;
      if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) б++;
    }
    return { з, б };
  });
  ок(зелень.з > 20, 'зелёный рельеф на холсте (' + зелень.з + ' точек)');
  ок(зелень.б > 100, 'фон белый, как в оригинале');

  /* ── Падение ────────────────────────────────────────────── */
  console.log('\nпадение и финиш');
  await стр.evaluate(() => { const б = window.ГД.игра.бк; б.з.y -= 400; б.п.y -= 400; });
  await стр.waitForTimeout(1600);
  ок(await стр.isVisible('#over'), 'после падения показана шторка');
  ок((await стр.textContent('#ovTitle')) === 'Падение', 'шторка про падение');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-crash.png') });
  await стр.click('#ovMain');
  await стр.waitForTimeout(300);
  ок(!(await стр.isVisible('#over')) && (await где()) < старт + 1, '«Заново» ставит байк на старт');

  /* Финиш: подвозим байк к флагу и жмём газ. */
  await стр.evaluate(() => {
    const { игра, ФИЗ } = window.ГД;
    const б = игра.бк, тр = игра.тр;
    const y = (x) => { let i = 0; const p = тр.точки;
      while (i < p.length - 2 && p[i + 1].x < x) i++;
      const a = p[i], c = p[i + 1];
      return a.y + (c.y - a.y) * ((x - a.x) / (c.x - a.x || 1)); };
    б.з.x = тр.финиш - 1; б.з.y = y(б.з.x) + ФИЗ.R;
    б.п.x = б.з.x + ФИЗ.БАЗА; б.п.y = y(б.п.x) + ФИЗ.R;
    б.з.vx = б.п.vx = 4; б.з.vy = б.п.vy = 0;
  });
  await стр.keyboard.down('ArrowUp');
  await стр.waitForTimeout(1200);
  await стр.keyboard.up('ArrowUp');
  ок(await стр.isVisible('#over'), 'на финише показана шторка');
  ок((await стр.textContent('#ovTitle')) === 'Финиш', 'шторка про финиш');
  ок((await стр.textContent('#ovSub')).includes('рекорд'), 'записан рекорд');
  if (снимки) await стр.screenshot({ path: path.join(кудаСнимки, 'gd-finish.png') });

  const сейв = await стр.evaluate(() => localStorage.getItem('gd_v1'));
  ок(сейв && сейв.includes('0:0'), 'рекорд сохранён в localStorage');
  await стр.click('#ovMenu');
  await стр.waitForTimeout(200);
  ок((await стр.locator('.lvl.lock').count()) === 4, 'после финиша открылась следующая трасса');

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

  ок(ошибки.length === 0, 'в консоли пусто' + (ошибки.length ? ': ' + ошибки[0] : ''));

  /* ── Битое сохранение ───────────────────────────────────── */
  const стр2 = await браузер.newPage({ viewport: { width: 420, height: 780 } });
  await стр2.addInitScript(() => localStorage.setItem('gd_v1', '{сломано'));
  await стр2.goto(адрес);
  await стр2.waitForTimeout(300);
  ок(await стр2.isVisible('#menu'), 'битое сохранение не роняет игру');

  await браузер.close();
  console.log(плохо ? '\n' + плохо + ' замечаний' : '\nвсё чисто');
  process.exit(плохо ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
