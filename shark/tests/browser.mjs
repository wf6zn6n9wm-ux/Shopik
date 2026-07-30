// Общая обвязка для браузерных тестов: находит Chromium, готовит снимок
// страницы и поднимает CDP-сессию.
//
// Почему снимок, а не сам index.html: страница пишет в localStorage и живёт
// своей жизнью, а гонять боевой файл под отладчиком — верный способ однажды
// оставить в нём мусор. Снимок делается на КАЖДОМ запуске: иначе тест
// проверяет вчерашний файл и тихо зеленеет после правок, которых не видел.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const appFile = (rel) => path.join(ROOT, rel);

// Порт задаётся вызывающим, чтобы два теста не подрались за один и тот же.
// Через CHROMIUM можно указать свой бинарник, если он лежит не там, где ждём.
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

export function chromiumPath() {
  for (const p of CHROMIUM_CANDIDATES) if (p && existsSync(p)) return p;
  throw new Error(
    'Chromium не найден. Укажите путь через CHROMIUM=/путь/к/chromium ' +
    'или пропустите браузерные тесты: node tests/run.mjs --node-only'
  );
}

// Снимок кладём в свою временную папку вместе с ассетами: спрайт аватарок
// подключён относительным путём, и без него страница рисует чёрные кружки —
// тест бы это увидел как «сломалась вёрстка», хотя сломан был снимок.
function snapshot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'shark-test-'));
  const page = path.join(dir, 'index.html');
  copyFileSync(appFile('index.html'), page);
  const assets = appFile('assets');
  if (existsSync(assets)) {
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    copyFileSync(path.join(assets, 'avatars.png'), path.join(dir, 'assets', 'avatars.png'));
  }
  return { dir, page };
}

/**
 * Поднимает headless-Chromium на снимке страницы и возвращает управление.
 *
 * @param {object} opts
 * @param {number} opts.port          порт отладчика (у каждого теста свой)
 * @param {boolean} [opts.collectErrors]  собирать ошибки времени выполнения
 * @param {number} [opts.settle]      сколько ждать инициализации, мс
 * @param {string[]} [opts.extraArgs] дополнительные флаги запуска
 * @returns {Promise<{run:Function, cmd:Function, errors:string[], close:Function}>}
 */
export async function openApp(opts) {
  const { port, collectErrors = false, settle = 1400, extraArgs = [] } = opts;
  const { dir, page } = snapshot();
  const chrome = spawn(chromiumPath(), [
    '--headless=new', '--remote-debugging-port=' + port, '--no-sandbox',
    '--hide-scrollbars', '--window-size=430,932', '--disable-gpu',
    ...extraArgs, 'file://' + page
  ], { stdio: 'ignore' });

  // Ждём, пока отладчик отдаст вкладку. Порт открывается раньше, чем страница
  // появляется в списке, поэтому проверяем именно наличие target'а type=page.
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      target = list.find((x) => x.type === 'page') || null;
    } catch (e) { /* отладчик ещё не поднялся */ }
    if (!target) await new Promise((r) => setTimeout(r, 150));
  }
  if (!target) { chrome.kill(); rmSync(dir, { recursive: true, force: true }); throw new Error('Chromium не поднялся на порту ' + port); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    if (!collectErrors) return;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(d.exception?.description || JSON.stringify(d));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description).join(' '));
    }
  });

  const cmd = (method, params) => new Promise((res) => {
    const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await new Promise((r) => setTimeout(r, settle));

  // Выражение оборачиваем в стрелку, чтобы внутри работал return.
  const run = async (expr) => {
    const r = await cmd('Runtime.evaluate', {
      expression: '(()=>{' + expr + '})()', awaitPromise: true, returnByValue: true
    });
    if (r.result && r.result.subtype === 'error') throw new Error(r.result.description);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };

  const close = () => {
    try { ws.close(); } catch (e) {}
    chrome.kill();
    rmSync(dir, { recursive: true, force: true });
  };

  return { run, cmd, errors, close, page, dir };
}

// Мелкая утилита: пауза между действиями, когда ждём перерисовку.
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
