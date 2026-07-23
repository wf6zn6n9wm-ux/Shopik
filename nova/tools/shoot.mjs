// Знімки реального Flutter-web застосунку для звірки pixel-perfect із макетами.
// Запускається в CI (там є інтернет для CanvasKit/шрифтів), рендерить кожен
// маршрут у телефонному вьюпорті й зберігає PNG у screens/.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const base = 'http://localhost:8080';
const routes = [
  ['splash', '/splash?hold=1'],
  ['onboarding', '/onboarding'],
  ['home', '/?s=1'],
  ['rebook', '/rebook'],
  ['recap', '/recap'],
  ['calendar', '/calendar'],
  ['calendar-week', '/calendar?view=week'],
  ['calendar-month', '/calendar?view=month'],
  ['analytics', '/analytics'],
  ['clients', '/clients'],
  ['client', '/clients/cl_olena'],
  ['services', '/services'],
  ['subscription', '/subscription'],
  ['booking', '/online-booking'],
  ['book', '/book'],
  ['book-time', '/book?step=time'],
  ['book-confirm', '/book?step=confirm'],
  ['book-done', '/book?step=done'],
  ['smart-gaps', '/smart-gaps'],
  ['menu', '/menu'],
  ['settings', '/settings'],
  // Локалізація EN/RU — перевірка ключових екранів.
  ['home-en', '/?s=1&lang=en'],
  ['menu-en', '/menu?lang=en'],
  ['analytics-en', '/analytics?lang=en'],
  ['calendar-en', '/calendar?lang=en'],
  ['settings-en', '/settings?lang=en'],
  ['home-ru', '/?s=1&lang=ru'],
  ['menu-ru', '/menu?lang=ru'],
  ['analytics-ru', '/analytics?lang=ru'],
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
