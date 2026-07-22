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
  ['client', '/clients/cl_olena'],
  ['services', '/services'],
  ['booking', '/online-booking'],
  ['menu', '/menu'],
  ['settings', '/settings'],
];

mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });

for (const [name, route] of routes) {
  const url = `${base}/#${route}`;
  // Свіжий контекст на кожен маршрут — гарантує повне завантаження документа
  // (інакше зміна лише хеша/query не перезапускає main() і ?view= не діє).
  const ctx = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
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
  await ctx.close();
}

await browser.close();
