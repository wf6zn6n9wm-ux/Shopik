/* ──────────────────────────────────────────────────────────────────
   Юридичні документи: винести з коду й повернути назад.

     node trainer/legal/sync.js export
        legal/terms.md, legal/privacy.md   — редагований текст
        terms.html, privacy.html           — публічні сторінки для магазинів
        delete.html                        — сторінка видалення даних:
                                             Google Play вимагає для неї URL

     node trainer/legal/sync.js import
        читає виправлені .md і переписує LEGAL_DOCS у index.html

   Єдине джерело правди лишається в index.html: документи мають бути
   всередині застосунку, бо він працює без інтернету. Скрипт лише
   возить текст туди й назад — правки юриста повертаються командою, а
   не переписуванням коду вручну.

   Реквізити в тексті лишаються підстановками — {{company}}, {{email}},
   {{updated}}, {{trialDays}}. Юрист бачить, що це змінні, а в застосунку
   й на сторінках вони підставляються з LEGAL.
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'index.html');
/* Мітки для підстановок будуємо з самого LEGAL, а не тримаємо списком.
   Список тут уже підводив: доданий реквізит у ньому не з'являвся, і в
   опублікованих документах замість адреси й телефону стояло
   «undefined» — рівно там, де їх перевіряє банк. */
const marksOf = legal =>
  Object.fromEntries(Object.keys(legal).map(k => [k, '{{' + k + '}}']));

/* ─────────── читання ─────────── */
function block(src, start){
  /* від `const X = {` до рядка, що закриває об'єкт на нульовому рівні */
  const from = src.indexOf(start);
  if (from < 0) throw new Error('не знайшов ' + start);
  let i = src.indexOf('{', from), depth = 0;
  for (; i < src.length; i++){
    if (src[i] === '{') depth++;
    else if (src[i] === '}'){ depth--; if (!depth) return {from, to: i + 2, text: src.slice(from, i + 2)}; }
  }
  throw new Error('не знайшов кінець ' + start);
}

function readDocs(){
  const src = fs.readFileSync(APP, 'utf8');
  const b = block(src, 'const LEGAL_DOCS = {');
  /* виконуємо з мітками замість реквізитів — тоді підстановки самі
     перетворяться на {{...}}, і жодного розбору шаблонних рядків */
  const ctx = {LEGAL: marksOf(legalValues(src)), TRIAL_DAYS: '{{trialDays}}'};
  vm.createContext(ctx);
  vm.runInContext(b.text + ';globalThis.__docs = LEGAL_DOCS;', ctx);
  return {src, b, docs: ctx.__docs};
}

/* ─────────── export ─────────── */
const mdOf = doc => '# ' + doc.title + '\n\n' +
  doc.blocks.map(([h, tx]) => '## ' + h + '\n\n' + tx + '\n').join('\n') +
  '\n---\n\n_Підстановки у фігурних дужках застосунок підставляє сам — ' +
  'лишайте їх як є._\n';

function legalValues(src){
  const b = block(src, 'const LEGAL = {');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(b.text + ';globalThis.__legal = LEGAL;', ctx);
  const trial = (src.match(/const TRIAL_DAYS = (\d+)/) || [, '14'])[1];
  return {...ctx.__legal, trialDays: trial};
}

const fill = (tx, v) => tx.replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] !== undefined ? v[k] : ''));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const htmlOf = (doc, v, other) => `<!doctype html>
<html lang="uk">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>PRO Trainer — ${esc(doc.title)}</title>
<link rel="stylesheet" href="/pay.css" />
</head>
<body>
<div class="wrap doc">
  <div class="brand">
    <div class="mark"><svg viewBox="0 0 24 24"><path d="M4 9v6M8 6.5v11M16 6.5v11M20 9v6M8 12h8"/></svg></div>
    <b>PRO Trainer</b>
  </div>
  <h1>${esc(doc.title)}</h1>
${doc.blocks.map(([h, tx]) => '  <h2>' + esc(h) + '</h2>\n' +
    fill(tx, v).split('\n\n').map(par => '  <p>' + esc(par) + '</p>').join('\n')).join('\n')}
  <p class="note">${esc(v.company)} · <a href="mailto:${esc(v.email)}">${esc(v.email)}</a><br>
  <a href="/${other.file}">${esc(other.title.toLowerCase())}</a> · <a href="/support">підтримка</a> · <a href="/delete">видалення даних</a></p>
</div>
</body>
</html>
`;

/* Google Play вимагає окрему адресу, де користувач бачить, як видалити
   свої дані. Сторінка коротка навмисно: більшість даних тренер стирає
   сам у застосунку, а на сервері лежить тільки запис про підписку. */
const deleteHtml = v => `<!doctype html>
<html lang="uk">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>PRO Trainer — видалення даних</title>
<link rel="stylesheet" href="/pay.css" />
</head>
<body>
<div class="wrap doc">
  <div class="brand">
    <div class="mark"><svg viewBox="0 0 24 24"><path d="M4 9v6M8 6.5v11M16 6.5v11M20 9v6M8 12h8"/></svg></div>
    <b>PRO Trainer</b>
  </div>
  <h1>Видалення даних</h1>

  <h2>Дані застосунку — у вас на пристрої</h2>
  <p>Клієнти, тренування, оплати, товари й нотатки зберігаються на вашому пристрої, а не в нас. Видалити їх можна самостійно й одразу: Профіль → Налаштування → «Видалити всі дані». Окремого клієнта разом з історією видаляє кнопка в його картці. Видалення застосунку теж стирає ці дані з пристрою.</p>
  <p>Радимо спершу зберегти резервну копію: Профіль → Резервна копія → «Створити копію зараз».</p>

  <h2>Що зберігається в нас</h2>
  <p>Лише якщо ви оформили підписку на сайті: логін (пошта або номер телефону), знеособлений ідентифікатор пристрою, тариф, строк підписки, номер платежу й дата початку пробного періоду. Даних ваших клієнтів у нас немає.</p>

  <h2>Як попросити видалити</h2>
  <p>Напишіть на <a href="mailto:${esc(v.email)}?subject=Видалення%20даних%20PRO%20Trainer">${esc(v.email)}</a> з тієї самої пошти, якою користуєтесь у застосунку (або вкажіть номер телефону). Ми видалимо запис протягом 30 днів.</p>
  <p>Разом із записом зникне й активна підписка: доступ доведеться оформлювати заново, а пробний період не поновиться. Дані про оплати ми зобов'язані зберігати стільки, скільки вимагає податкове законодавство.</p>

  <p class="note">${esc(v.company)} · <a href="mailto:${esc(v.email)}">${esc(v.email)}</a><br>
  <a href="/privacy">політика конфіденційності</a> · <a href="/terms">умови використання</a> · <a href="/support">підтримка</a></p>
</div>
</body>
</html>
`;

function doExport(){
  const {src, docs} = readDocs();
  const v = legalValues(src);
  fs.mkdirSync(__dirname, {recursive: true});
  const pair = {terms: {key: 'privacy', file: 'privacy'}, privacy: {key: 'terms', file: 'terms'}};
  Object.keys(docs).forEach(k => {
    fs.writeFileSync(path.join(__dirname, k + '.md'), mdOf(docs[k]));
    const o = pair[k];
    fs.writeFileSync(path.join(ROOT, k + '.html'),
      htmlOf(docs[k], v, {title: docs[o.key].title, file: o.file}));
    console.log('  ✓ legal/' + k + '.md  ·  ' + k + '.html');
  });
  fs.writeFileSync(path.join(ROOT, 'delete.html'), deleteHtml(v));
  console.log('  ✓ delete.html');
  console.log('\nРедагувати — .md. Магазинам — /terms, /privacy і /delete.');
}

/* ─────────── import ─────────── */
function parseMd(text){
  const lines = text.replace(/\r/g, '').split('\n');
  let title = '';
  const blocks = [];
  let head = null, buf = [];
  const flush = () => {
    if (head === null) return;
    const tx = buf.join('\n').trim().replace(/\n{2,}/g, '\n\n');
    if (tx) blocks.push([head, tx]);
    buf = [];
  };
  for (const ln of lines){
    if (ln.startsWith('# ')){ title = ln.slice(2).trim(); continue; }
    if (ln.startsWith('## ')){ flush(); head = ln.slice(3).trim(); continue; }
    if (ln.startsWith('---') || /^_Підстановки/.test(ln)) { flush(); head = null; continue; }
    buf.push(ln);
  }
  flush();
  if (!title || !blocks.length) throw new Error('не схоже на документ: немає заголовка або розділів');
  return {title, blocks};
}

/* назад у JS: рядок із підстановками стає шаблонним, решта — звичайним */
function jsString(s){
  /* екрануємо до підстановки змінних, інакше зіпсували б ${...},
     і обов'язково перенесення рядків: розділ буває з кількох абзаців */
  const safe = String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n');
  const withVars = safe.replace(/\{\{(\w+)\}\}/g,
    (_, k) => (k === 'trialDays' ? '${TRIAL_DAYS}' : '${LEGAL.' + k + '}'));
  if (withVars !== safe) return '`' + withVars.replace(/`/g, '\\`') + '`';
  return "'" + withVars.replace(/'/g, "\\'") + "'";
}

function doImport(){
  const {src, b, docs} = readDocs();
  const next = {};
  Object.keys(docs).forEach(k => {
    const file = path.join(__dirname, k + '.md');
    if (!fs.existsSync(file)) throw new Error('немає ' + path.relative(ROOT, file) + ' — спершу export');
    next[k] = parseMd(fs.readFileSync(file, 'utf8'));
  });

  const body = Object.keys(next).map(k => {
    const d = next[k];
    return '  ' + k + ': {\n    title: ' + jsString(d.title) + ',\n    blocks: [\n' +
      d.blocks.map(([h, tx]) => '      [' + jsString(h) + ', ' + jsString(tx) + '],').join('\n') +
      '\n    ],\n  },';
  }).join('\n');

  const text = 'const LEGAL_DOCS = {\n' + body + '\n};';
  fs.writeFileSync(APP, src.slice(0, b.from) + text + src.slice(b.to - 1));

  /* перевіряємо, що вийшло читабельним для самого застосунку */
  const check = readDocs().docs;
  Object.keys(next).forEach(k => {
    if (check[k].blocks.length !== next[k].blocks.length)
      throw new Error('після запису розділи не збіглись у ' + k);
  });
  Object.keys(check).forEach(k => console.log('  ✓ ' + k + ' — ' + check[k].blocks.length + ' розділів'));
  console.log('\nЗаписано в index.html. Далі: node trainer/legal/sync.js export — оновити публічні сторінки.');
}

const cmd = process.argv[2];
if (cmd === 'export') doExport();
else if (cmd === 'import') doImport();
else {
  console.log('node trainer/legal/sync.js export   — винести документи (юристу + публічні сторінки)');
  console.log('node trainer/legal/sync.js import   — повернути виправлені .md у застосунок');
  process.exit(1);
}
