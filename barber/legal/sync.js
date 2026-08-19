/* ──────────────────────────────────────────────────────────────────
   Юридические документы: вынести из кода и вернуть назад.

     node barber/legal/sync.js export
        legal/terms.md, legal/privacy.md   — редактируемый текст
        terms.html, privacy.html           — публичные страницы
        delete.html                        — удаление данных: отдельный
                                             адрес требуют магазины и
                                             спрашивает LiqPay

     node barber/legal/sync.js import
        читает исправленные .md и переписывает LEGAL_DOCS в index.html

   Единственный источник правды остаётся в index.html: документы должны
   быть внутри приложения, потому что оно работает без интернета. Скрипт
   лишь возит текст туда и обратно — правки юриста возвращаются командой,
   а не переписыванием кода руками.

   Реквизиты в тексте остаются подстановками — {{company}}, {{email}},
   {{updated}}, {{trialDays}}. Юрист видит, что это переменные, а в
   приложении и на страницах они подставляются из LEGAL.
   ────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'index.html');
const MARKS = {company: '{{company}}', email: '{{email}}', updated: '{{updated}}',
  id: '{{id}}', address: '{{address}}', phone: '{{phone}}'};

/* ─────────── чтение ─────────── */
function block(src, start){
  /* от `const X = {` до строки, закрывающей объект на нулевом уровне */
  const from = src.indexOf(start);
  if (from < 0) throw new Error('не нашёл ' + start);
  let i = src.indexOf('{', from), depth = 0;
  for (; i < src.length; i++){
    if (src[i] === '{') depth++;
    else if (src[i] === '}'){ depth--; if (!depth) return {from, to: i + 2, text: src.slice(from, i + 2)}; }
  }
  throw new Error('не нашёл конец ' + start);
}

function readDocs(){
  const src = fs.readFileSync(APP, 'utf8');
  const b = block(src, 'const LEGAL_DOCS = {');
  /* выполняем с метками вместо реквизитов — тогда подстановки сами
     превратятся в {{...}}, и никакого разбора шаблонных строк */
  const ctx = {LEGAL: MARKS, TRIAL_DAYS: '{{trialDays}}',
    legalVal: v => v, legalLine: () => '{{requisites}}', contactLine: () => '{{contacts}}'};
  vm.createContext(ctx);
  vm.runInContext(b.text + ';globalThis.__docs = LEGAL_DOCS;', ctx);
  return {src, b, docs: ctx.__docs};
}

function legalValues(src){
  const b = block(src, 'const LEGAL = {');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(b.text + ';globalThis.__legal = LEGAL;', ctx);
  const trial = (src.match(/const TRIAL_DAYS = (\d+)/) || [, '14'])[1];
  return Object.assign({}, ctx.__legal, {trialDays: trial});
}

/* ─────────── export ─────────── */
const mdOf = doc => '# ' + doc.title + '\n\n' +
  doc.blocks.map(([h, tx]) => '## ' + h + '\n\n' + tx + '\n').join('\n') +
  '\n---\n\n_Підстановки: {{company}}, {{email}}, {{updated}}, {{trialDays}} — ' +
  'застосунок підставляє їх сам, лишайте як є. {{requisites}} — рядок реквізитів, ' +
  '{{contacts}} — способи зв’язку._\n';

const line = v => [
  v.company || '(вкажіть назву ФОП)',
  v.id && 'РНОКПП ' + v.id,
  v.address,
  v.phone && 'тел. ' + v.phone,
  v.email,
].filter(Boolean).join(', ');
/* способы связи — те, что заполнены: почты у поддержки может не быть */
const ways = v => [
  v.email && 'на ' + v.email,
  v.telegram && 'у Telegram @' + String(v.telegram).replace(/^@/, ''),
  v.phone && 'за телефоном ' + v.phone,
].filter(Boolean).join(' або ') || '(вкажіть контакт для звернень)';
const fill = (tx, v) => String(tx).replace(/\{\{(\w+)\}\}/g, (_, k) =>
  k === 'requisites' ? line(v) :
  k === 'contacts' ? ways(v) :
  (v[k] ? v[k] : '(вкажіть ' + k + ')'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MARK = '<div class="mark"><svg viewBox="0 0 24 24"><path d="M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M8.6 8.1 20 19.5M20 4.5 8.6 15.9"/></svg></div>';

/* Пока реквизиты не заполнены, страница говорит об этом прямо: выложить
   документ с дырами хуже, чем не выложить вовсе. */
const todo = v => v.company && (v.email || v.phone || v.telegram) ? '' :
  '  <div class="err">Реквізити не заповнені: вкажіть LEGAL в index.html і виконайте ' +
  '<code>node barber/legal/sync.js export</code> ещё раз.</div>\n';

const foot = (v, links) => '  <p class="note">' + esc(line(v)) + '<br>\n  ' +
  links.map(([href, tx]) => '<a href="' + href + '">' + esc(tx) + '</a>').join(' · ') + '</p>\n';

const page = (title, body) => `<!doctype html>
<html lang="uk" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Про Барбер — ${esc(title)}</title>
<link rel="stylesheet" href="pay.css" />
</head>
<body>
<div class="wrap doc">
  <div class="brand">
    ${MARK}
    <b>Про Барбер</b>
  </div>
${body}</div>
</body>
</html>
`;

const htmlOf = (doc, v, other) => page(doc.title,
  todo(v) +
  '  <h1>' + esc(doc.title) + '</h1>\n' +
  '  <p class="sub">Оновлено: ' + esc(fill('{{updated}}', v)) + '</p>\n' +
  doc.blocks.map(([h, tx]) => '  <h2>' + esc(h) + '</h2>\n' +
    fill(tx, v).split('\n\n').map(par => '  <p>' + esc(par) + '</p>').join('\n')).join('\n') + '\n' +
  foot(v, [[other.file + '.html', other.title.toLowerCase()], ['support.html', 'підтримка'], ['delete.html', 'видалення даних']]));

/* Отдельный адрес, где видно, как удалить свои данные: магазины требуют
   его как ссылку, а LiqPay спрашивает при проверке. Страница короткая
   намеренно — почти всё барбер стирает сам, а у нас лежит только запись
   о доступе. */
const deleteHtml = v => page('видалення даних',
  todo(v) +
  `  <h1>Видалення даних</h1>

  <h2>Дані застосунку — у вас на пристрої</h2>
  <p>Клієнти, записи, послуги, витрати й листування зберігаються на вашому пристрої, а не в нас. Видалити їх можна самостійно і одразу: Налаштування → «Почати з чистого аркуша». Окремого клієнта разом з історією видаляє кнопка в його картці. Видалення застосунку теж стирає ці дані.</p>
  <p>Спершу має сенс зберегти резервну копію: Налаштування → Резервна копія → «Створити копію зараз».</p>

  <h2>Що зберігається в нас</h2>
  <p>Тільки якщо ви оплачували доступ: логін (пошта або номер телефону), знеособлений ідентифікатор пристрою, план, строк доступу, номер платежу та дата початку пробного періоду. Якщо ви вмикали приймання заявок — ще послуги, графік і зайняті інтервали без імен, а також самі заявки клієнтів (ім’я, телефон, коментар), які видаляються автоматично через 90 днів.</p>
  <p>Даних із вашої клієнтської бази в нас немає.</p>

  <h2>Як попросити видалити</h2>
  <p>Напишіть ${esc(ways(v))} і вкажіть логін — пошту або номер телефону, якими користуєтеся в застосунку. Видалимо запис протягом 30 днів.</p>
  <p>Разом із записом зникне й оплачений доступ: його доведеться оформлювати заново, а пробний період не поновиться. Дані про платежі ми зобов’язані зберігати стільки, скільки вимагає податкове законодавство.</p>
` + foot(v, [['privacy.html', 'політика конфіденційності'], ['terms.html', 'умови використання'], ['support.html', 'підтримка']]));

function doExport(){
  const {src, docs} = readDocs();
  const v = legalValues(src);
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
  if (!(v.company && (v.email || v.phone || v.telegram)))
    console.log('\n  ⚠️  LEGAL пуст: страницы вышли с пометкой «реквизиты не заполнены».');
  console.log('\nРедактировать — .md. Наружу — /terms, /privacy, /support и /delete.');
}

/* ─────────── import ─────────── */
function parseMd(text){
  const lines = text.replace(/\r/g, '').split('\n');
  let title = '';
  const blocks = [];
  let head = null, buf = [];
  const flush = () => {
    if (head === null) return;
    const tx = buf.join('\n').trim().replace(/\n{3,}/g, '\n\n');
    if (tx) blocks.push([head, tx]);
    buf = [];
  };
  for (const ln of lines){
    if (ln.startsWith('# ')){ title = ln.slice(2).trim(); continue; }
    if (ln.startsWith('## ')){ flush(); head = ln.slice(3).trim(); continue; }
    if (ln.startsWith('---') || /^_Подстановки/.test(ln)){ flush(); head = null; continue; }
    buf.push(ln);
  }
  flush();
  if (!title || !blocks.length) throw new Error('не похоже на документ: нет заголовка или разделов');
  return {title, blocks};
}

/* назад в JS: строка с подстановками становится шаблонной, остальные — обычными */
function jsString(s){
  /* экранируем до подстановки переменных, иначе испортили бы ${...},
     и обязательно переносы строк: раздел бывает из нескольких абзацев */
  const safe = String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n');
  const withVars = safe.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (k === 'trialDays') return '${TRIAL_DAYS}';
    if (k === 'requisites') return '${legalLine()}';
    if (k === 'contacts') return '${contactLine()}';
    if (k === 'company') return "${legalVal(LEGAL.company, 'название ФОП')}";
    if (k === 'email') return "${legalVal(LEGAL.email, 'почту для обращений')}";
    return '${LEGAL.' + k + '}';
  });
  if (withVars !== safe) return '`' + withVars.replace(/`/g, '\\`') + '`';
  return "'" + withVars.replace(/'/g, "\\'") + "'";
}

function doImport(){
  const {src, b, docs} = readDocs();
  const next = {};
  Object.keys(docs).forEach(k => {
    const file = path.join(__dirname, k + '.md');
    if (!fs.existsSync(file)) throw new Error('нет ' + path.relative(ROOT, file) + ' — сначала export');
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

  /* проверяем, что вышло читаемым для самого приложения */
  const check = readDocs().docs;
  Object.keys(next).forEach(k => {
    if (check[k].blocks.length !== next[k].blocks.length)
      throw new Error('после записи разделы не сошлись в ' + k);
  });
  Object.keys(check).forEach(k => console.log('  ✓ ' + k + ' — ' + check[k].blocks.length + ' разделов'));
  console.log('\nЗаписано в index.html. Дальше: node barber/legal/sync.js export — обновить публичные страницы.');
}

const cmd = process.argv[2];
if (cmd === 'export') doExport();
else if (cmd === 'import') doImport();
else {
  console.log('node barber/legal/sync.js export   — вынести документы (юристу + публичные страницы)');
  console.log('node barber/legal/sync.js import   — вернуть исправленные .md в приложение');
  process.exit(1);
}
