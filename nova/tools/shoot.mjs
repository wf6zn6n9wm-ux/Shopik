// Знімки реального Flutter-web застосунку для звірки pixel-perfect із макетами.
// Запускається в CI (там є інтернет для CanvasKit/шрифтів), рендерить кожен
// маршрут у телефонному вьюпорті й зберігає PNG у screens/.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const base = 'http://localhost:8080';
const routes = [
  ['home', '/'],
  ['calendar', '/calendar'],
  ['calendar-week', '/calendar?view=week'],
  ['calendar-month', '/calendar?view=month'],
  ['analytics', '/analytics'],
  ['menu', '/menu'],
];

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
});
const page = await ctx.newPage();

for (const [name, route] of routes) {
  const url = `${base}/#${route}`;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    // Чекаємо, поки Flutter змонтує сцену.
    await page
      .waitForFunction(
        () =>
          document.querySelector('flutter-view') ||
          document.querySelector('flt-glass-pane') ||
          document.querySelector('flt-scene-host'),
        { timeout: 45000 }
      )
      .catch(() => {});
    // Даємо час на шрифти (google_fonts) і stagger-анімації.
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `shots/${name}.png` });
    console.log('shot', name, 'ok');
  } catch (e) {
    console.log('shot', name, 'FAILED', e.message);
  }
}

await browser.close();
