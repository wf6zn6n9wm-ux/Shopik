/* Общая часть проверок: запуск браузера, открытие приложения с нужным
   состоянием и отчёт. Держим здесь, чтобы каждая проверка занималась
   своим делом, а не повторяла обвязку. */
const path = require('path');
const fs = require('fs');

/* Playwright ищем в нескольких местах: на рабочей машине он ставится
   рядом, в песочнице лежит в системном каталоге модулей. */
function playwright() {
  const места = [
    'playwright',
    process.env.GROOT && path.join(process.env.GROOT, 'playwright'),
    '/opt/node22/lib/node_modules/playwright'
  ].filter(Boolean);
  for (const м of места) { try { return require(м); } catch (e) {} }
  throw new Error('не нашёл playwright. Поставьте: npm i -D playwright && npx playwright install chromium');
}

const ФАЙЛ = path.join(__dirname, '..', 'starshash', 'index.html');
if (!fs.existsSync(ФАЙЛ)) throw new Error('не нашёл ' + ФАЙЛ);
const АДРЕС = 'file://' + ФАЙЛ;

function исходник() { return fs.readFileSync(ФАЙЛ, 'utf8'); }

/* Сегодня в том же виде, в каком его пишет само приложение */
function день(назад) {
  const d = new Date();
  if (назад) d.setDate(d.getDate() - назад);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

async function браузер() {
  const { chromium } = playwright();
  return chromium.launch();
}

/* Открывает приложение. Состояние подкладываем только если его ещё нет:
   иначе перезагрузка внутри проверки затрёт результат предыдущего шага. */
async function открыть(b, о) {
  о = о || {};
  const p = await b.newPage({
    viewport: { width: о.ширина || 393, height: о.высота || 752 },
    deviceScaleFactor: о.масштаб || 1
  });
  const ошибки = [];
  p.on('pageerror', e => ошибки.push('JS: ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const s = m.text();
    /* песочница не пускает telegram.org; в самом Telegram скрипт грузится */
    if (/TUNNEL_CONNECTION_FAILED|telegram-web-app/.test(s)) return;
    ошибки.push('консоль: ' + s.slice(0, 100));
  });
  p.ошибки = ошибки;

  await p.addInitScript(([я, ст]) => {
    localStorage.setItem('starshash_prefs', JSON.stringify({ vibro: true, sound: !!window.__звук, lang: я }));
    if (ст && !localStorage.getItem('starshash_state')) localStorage.setItem('starshash_state', ст);
  }, [о.язык || 'ru', о.состояние ? JSON.stringify(о.состояние) : null]);
  if (о.звук) await p.addInitScript(() => { window.__звук = true; });

  await p.goto(АДРЕС);
  await p.waitForTimeout(о.пауза || 1700);
  if (о.шаги !== true) await закрытьШаги(p);
  return p;
}

/* Окно «С чего начать» всплывает на 900-й миллисекунде и перехватывает
   нажатия — в проверках, где оно не предмет, его надо убрать. */
async function закрытьШаги(p) {
  await p.evaluate(() => {
    const x = document.getElementById('stX');
    if (x && document.getElementById('stSheet').getAttribute('aria-hidden') === 'false') x.click();
  });
  await p.waitForTimeout(300);
}

async function жди(p, усл, мс) {
  const t0 = Date.now();
  while (Date.now() - t0 < (мс || 25000)) {
    if (await p.evaluate(усл)) return true;
    await p.waitForTimeout(150);
  }
  return false;
}

/* Баланс капает каждую секунду, поэтому суммы сверяем с допуском */
function близко(a, b, допуск) { return Math.abs(a - b) <= (допуск === undefined ? 0.05 : допуск); }

function состояние(p) {
  return p.evaluate(() => JSON.parse(localStorage.getItem('starshash_state') || '{}'));
}

class Отчёт {
  constructor(имя) { this.имя = имя; this.беды = []; console.log('\n■ ' + имя); }
  раздел(т) { console.log('  — ' + т + ' —'); }
  проверка(что, ок, пояснение) {
    console.log('    ' + (ок ? '✓' : '✗') + ' ' + что + (пояснение ? ' — ' + пояснение : ''));
    if (!ок) this.беды.push(что);
  }
  замечание(т) { console.log('      ' + т); }
  итог() {
    const плохо = this.беды.length;
    console.log('  ' + (плохо ? '✗ ' + this.имя + ': ' + плохо + ' — ' + this.беды.join('; ')
      : '✓ ' + this.имя + ': чисто'));
    return плохо === 0;
  }
}

module.exports = { playwright, АДРЕС, ФАЙЛ, исходник, день, браузер, открыть, закрытьШаги, жди, близко, состояние, Отчёт };
