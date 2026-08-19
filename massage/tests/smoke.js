/* Проверка PRO MASSAGE без браузера.
   JSX из index.html транспилируется (@babel/standalone или bun), код
   выполняется в песочнице с заглушкой React — и каждый экран реально
   рендерится. Ловит забытые переменные, битые экраны, ошибки в деньгах
   и в разборе заметок.

   node massage/tests/smoke.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {spawnSync} = require('child_process');

const ROOT = path.join(__dirname, '..');

/* ── 1. достаём и транспилируем скрипт ── */
function source(file){
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const mark = 'data-presets="react">';
  const open = html.indexOf(mark);
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < 0) throw new Error('не нашёл <script type="text/babel"> в ' + file);
  return html.slice(open + mark.length, close);
}
function transpile(src, name){
  try {
    const babel = require('@babel/standalone');
    return babel.transform(src, {presets: ['react']}).code;
  } catch (e){
    if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promassage-'));
  const jsx = path.join(dir, name + '.jsx'), out = path.join(dir, name + '.js');
  fs.writeFileSync(jsx, src);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {jsx: 'react', jsxFactory: 'React.createElement', jsxFragmentFactory: 'React.Fragment', target: 'es2020'},
  }));
  const r = spawnSync('bun', ['build', '--no-bundle', jsx, '--outfile', out], {encoding: 'utf8'});
  if (r.status !== 0 || !fs.existsSync(out))
    throw new Error('не удалось транспилировать JSX: поставьте bun или @babel/standalone\n' + (r.stderr || r.error || ''));
  return fs.readFileSync(out, 'utf8');
}

/* ── 2. песочница ── */
function sandbox(){
  const mem = new Map();
  const el = (type, props, ...children) => {
    const p = Object.assign({}, props);
    if (children.length) p.children = children.length === 1 ? children[0] : children;
    return {__el: true, type, props: p};
  };
  const React = {
    createElement: el, Fragment: 'Fragment',
    useState: v => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {}, useLayoutEffect: () => {},
    useRef: v => ({current: v}), useMemo: f => f(), useCallback: f => f,
    useContext: c => (c && c._d !== undefined ? c._d : {}),
  };
  const doc = {
    documentElement: {dataset: {}, lang: 'ru', setAttribute(){}, style: {setProperty(){}}},
    body: {style: {}},
    getElementById: () => null,
    createElement: () => ({click(){}, setAttribute(){}, style: {}}),
    addEventListener(){}, removeEventListener(){},
  };
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    Intl, Date, Math, JSON, URL, URLSearchParams, encodeURIComponent,
    React, ReactDOM: {createRoot: () => ({render(){}})},
    navigator: {vibrate: () => true},
    location: {protocol: 'https:', origin: 'https://promassage.test', href: 'https://promassage.test/massage/'},
    document: doc,
    localStorage: {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k),
    },
    matchMedia: () => ({matches: false, addEventListener(){}, removeEventListener(){}}),
    addEventListener(){}, removeEventListener(){}, scrollTo(){},
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  return {ctx, mem};
}

const EXPORTS = `;globalThis.__T = {
  emptyDB, seedDB, Store, Act, Disk, uid, iso, fromIso, addDays, startOfWeek, dowIdx, daysBetween,
  mins, hhmm, clock, money, durLabel, initials, firstName, phoneMask, isPhone, isEmail, plural,
  sessWord, dayWord, dateLabel, dateShort, monthTitle, relDay, clamp, sum, tap,
  ZONES, TENSION, INTENSITY, PAY_KINDS, SUB_PLANS, SERVICE_SEED, CLIENT_SEED, zoneName, tensionOf,
  serviceById, clientById, clientName, serviceName,
  dayAppts, rangeAppts, clientAppts, nextAppt, minutesUntil, whenLabel, runningAppt, clientStats,
  subOf, periodRange, income, growth, series, topServices, zoneLevels, zoneHistory, zoneTrend,
  freeStarts, overlaps, notifications, aiNote, speechOk, runSeconds, applyTheme,
  Icon, Mark, Avatar, Sheet, TopBar, BackBtn, Field, Input, Seg, Chips, Tabs, Empty, Skeleton, Row,
  BodyFigure, TensionLegend, Bars, BarLabels, MiniCalendar, WeekStrip, Switch, ToastHost, Toaster, say,
  Home, Schedule, Clients, ClientPage, BodyMap, SessionScreen, AiNoteBlock, NoteSheet,
  Income, Analytics, Subs, Settings, Booking, More, Notifs, ApptPage,
  ApptForm, ClientForm, ServiceForm, SubForm, PayForm, PlusSheet, TabBar, App, Boot,
  ZONE_SHAPES, TABS, ROOT,
};`;

const {ctx} = sandbox();
vm.createContext(ctx);
vm.runInContext(transpile(source('index.html'), 'app') + EXPORTS, ctx, {filename: 'promassage.jsx'});
const T = ctx.__T;

/* ── 3. отчёт ── */
let checks = 0, fails = 0;
const ok = (name, cond, extra) => {
  checks++;
  if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};
const part = title => console.log('\n── ' + title + ' ──');

function walk(node){
  if (node == null || node === false || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + walk(x), 0);
  if (!node.__el) return 0;
  const {type, props} = node;
  if (typeof type === 'function') return 1 + walk(type(props));
  return 1 + walk(props && props.children);
}
function textOf(node){
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return ' ' + node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node.__el) return '';
  const {type, props} = node;
  if (typeof type === 'function') return textOf(type(props));
  return textOf(props && props.children);
}
/* сколько на экране элементов с таким классом — чтобы проверять не
   только «отрисовалось», но и чем именно отрисовалось */
function countClass(node, cls){
  if (node == null || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n, x) => n + countClass(x, cls), 0);
  if (!node.__el) return 0;
  const {type, props} = node;
  if (typeof type === 'function') return countClass(type(props), cls);
  const own = String((props && props.className) || '').split(/\s+/).includes(cls) ? 1 : 0;
  return own + countClass(props && props.children, cls);
}

const screen = (name, make) => {
  try { const n = walk(make()); ok(name, n > 3, n + ' узлов'); }
  catch (e){ ok(name, false, e.message); }
};

const today = T.iso(new Date());
const db = T.seedDB();
T.Store.init(db);
const S = () => T.Store.state;
const noop = () => {};

part('демо-данные');
ok('клиентов шестнадцать', db.clients.length === 16, db.clients.length + ' шт.');
ok('услуг шесть', db.services.length === 6, db.services.length + ' шт.');
ok('записей больше сотни', db.appts.length > 100, db.appts.length + ' шт.');
ok('история тянется на месяцы',
   db.appts.filter(a => a.date < T.iso(T.addDays(new Date(), -90))).length > 20);
ok('сегодняшнее расписание из референса',
   T.dayAppts(db, today).length === 4 && T.dayAppts(db, today).map(a => a.time).join(' ') === '10:00 12:00 15:00 17:30',
   T.dayAppts(db, today).map(a => a.time).join(' '));
ok('в 15:00 — Мария Иванова, классический массаж', (() => {
  const a = T.dayAppts(db, today).find(x => x.time === '15:00');
  return a && T.clientName(db, a.clientId) === 'Мария Иванова' && T.serviceName(db, a.serviceId) === 'Классический массаж';
})());
ok('есть заявки с онлайн-записи', db.appts.filter(a => a.status === 'pending').length === 2);
ok('у каждой записи есть клиент, услуга, цена и длительность',
   db.appts.every(a => a.clientId && a.serviceId && a.price >= 0 && a.dur > 0));
ok('демо-база одинаковая при каждом создании',
   JSON.stringify(T.seedDB().appts) === JSON.stringify(T.seedDB().appts));
ok('абонемент Марии — 5 из 10', (() => {
  const s = T.subOf(db, 'cl_1');
  return s && s.used === 5 && s.total === 10;
})());

part('деньги');
ok('гривна впереди суммы', T.money(4800).replace(/ | /g, ' ') === '₴ 4 800', T.money(4800));
ok('ноль не ломает формат', T.money(0).includes('0'));
const [mf, mt] = T.periodRange('month');
const m = T.income(db, mf, mt);
ok('доход месяца = сумма проведённых',
   m.total === m.rows.reduce((n, a) => n + a.price, 0) && m.total > 0, T.money(m.total));
ok('запланированные в доход не попадают',
   T.income({...db, appts: db.appts.map(a => ({...a, status: 'planned'}))}, mf, mt).total === 0);
ok('отменённые в доход не попадают',
   T.income({...db, appts: db.appts.map(a => ({...a, status: 'canceled'}))}, mf, mt).total === 0);
ok('средний чек = доход / сеансы', m.avg === Math.round(m.total / m.count));
ok('рост считается от прошлого периода',
   T.growth(120, 100) === 20 && T.growth(100, 0) === 100 && T.growth(0, 0) === 0);
ok('график недели — семь столбиков', T.series(db, 'week').length === 7);
ok('график месяцев — шесть столбиков', T.series(db, 'month').length === 6);
ok('сумма недельного графика = доход недели', (() => {
  const [f, t] = T.periodRange('week');
  return T.series(db, 'week').reduce((n, d) => n + d.value, 0) === T.income(db, f, t).total;
})());

part('время и окна');
ok('минуты туда-обратно', T.mins('11:30') === 690 && T.hhmm(690) === '11:30');
ok('секундомер печатает мм:сс', T.clock(605) === '10:05', T.clock(605));
ok('свободные окна не пересекаются с записями', (() => {
  const day = T.iso(T.addDays(new Date(), 1));
  return T.freeStarts(db, day, 60).every(t => !T.overlaps(db, day, t, 60));
})());
ok('в выходной свободных окон нет', (() => {
  const d = T.addDays(new Date(), 1);
  const sunday = T.iso(T.addDays(d, (7 - T.dowIdx(d)) % 7 === 0 ? 6 : (6 - T.dowIdx(d))));
  return T.dowIdx(T.fromIso(sunday)) !== 6 || T.freeStarts(db, sunday, 60).length === 0;
})());
ok('занятое время видно как пересечение', (() => {
  const a = T.dayAppts(db, today)[0];
  return T.overlaps(db, today, a.time, a.dur) === true;
})());
ok('следующий сеанс — из будущего', (() => {
  const n = T.nextAppt(db, new Date());
  return !n || n.date >= today;
})());
ok('склонения сеансов', T.sessWord(1) === 'сеанс' && T.sessWord(2) === 'сеанса' && T.sessWord(5) === 'сеансов');
ok('сегодня и завтра называются словами',
   T.relDay(today) === 'Сегодня' && T.relDay(T.iso(T.addDays(new Date(), 1))) === 'Завтра');

part('клиент');
const st = T.clientStats(db, 'cl_1');
ok('у Марии есть история', st.total > 0, st.total + ' сеансов');
ok('сумма клиента = сумма его проведённых сеансов',
   st.spent === T.clientAppts(db, 'cl_1').filter(a => a.status === 'done').reduce((n, a) => n + a.price, 0));
ok('последний сеанс — самый свежий из проведённых',
   !st.last || T.clientAppts(db, 'cl_1').filter(a => a.status === 'done')[0].id === st.last.id);
ok('предпочтительная услуга определяется по истории', !!T.serviceName(db, st.top));

part('карта тела');
const lv = T.zoneLevels(db, 'cl_1');
ok('у Марии отмечены зоны', Object.keys(lv).length >= 3, Object.keys(lv).join(', '));
ok('последняя отметка перекрывает прежние', lv.lower === 1, 'поясница = ' + lv.lower);
ok('история поясницы идёт по возрастанию дат', (() => {
  const h = T.zoneHistory(db, 'cl_1', 'lower');
  return h.length === 3 && h.every((x, i) => i === 0 || h[i - 1].date <= x.date);
})());
ok('прогресс виден как снижение', T.zoneTrend(db, 'cl_1', 'lower') === -2, String(T.zoneTrend(db, 'cl_1', 'lower')));
ok('у всех девяти зон есть форма на фигуре',
   T.ZONES.every(z => Array.isArray(T.ZONE_SHAPES[z.k]) && T.ZONE_SHAPES[z.k].length));
ok('четыре уровня напряжения', T.TENSION.length === 4 && T.tensionOf(3).n === 'Сильное');

part('AI-заметка');
const n1 = T.aiNote('Сегодня работали с поясницей и правой трапецией. Напряжение уменьшилось. Клиент чувствует себя лучше.');
ok('зоны узнаются', n1.zones.includes('lower') && n1.zones.includes('traps'), n1.zones.join(', '));
ok('сторона попадает в текст зон', /трапеци/i.test(n1.zoneText) && /справа/.test(n1.zoneText), n1.zoneText);
ok('состояние берётся из фразы про напряжение', /уменьшилось/i.test(n1.state), n1.state);
ok('реакция положительная', n1.react === 'Положительная', n1.react);
ok('рекомендация — повторить через 7 дней', n1.next === 'Повторить сеанс через 7 дней', n1.next);
const n2 = T.aiNote('Шея сильно зажата, работали мягко, был дискомфорт. Прийти через 5 дней.');
ok('срок из речи важнее умолчания', n2.next === 'Повторить сеанс через 5 дней', n2.next);
ok('дискомфорт не превращается в «положительную»', n2.react !== 'Положительная', n2.react);
ok('мягкая работа = лёгкая интенсивность', n2.intensity === 'light', n2.intensity);
ok('глубокая работа = сильная интенсивность', T.aiNote('Работали глубоко по спине').intensity === 'hard');
ok('пустой текст не роняет разбор', T.aiNote('').zones.length === 0 && !!T.aiNote('').next);
const n3 = T.aiNote('Работали с поясницей и правой трапецией, напряжение уменьшилось, клиент чувствует себя лучше');
ok('без точек состояние не съедает весь рассказ',
   n3.state.length < 40 && /уменьшилось/i.test(n3.state), n3.state);
ok('зоны идут в том порядке, в каком их назвали',
   n3.zones.join(',') === 'lower,traps', n3.zones.join(','));
ok('сторона остаётся при зоне', /Трапеция справа/.test(n3.zoneText), n3.zoneText);

part('действия');
{
  T.Store.init(T.seedDB());
  const before = S().clients.length;
  T.Act.saveClient({name: 'Тест Тестовый', phone: '+380 50 111 22 33', pref: 'sv_classic'});
  ok('клиент добавляется', S().clients.length === before + 1);
  const c = S().clients[0];
  T.Act.saveClient({id: c.id, name: 'Тест Изменённый'});
  ok('клиент правится, а не дублируется',
     S().clients.length === before + 1 && S().clients.find(x => x.id === c.id).name === 'Тест Изменённый');

  T.Act.saveAppt({clientId: c.id, serviceId: 'sv_classic', date: today, time: '08:00', dur: 60, price: 1200});
  const ap = S().appts.find(a => a.time === '08:00' && a.clientId === c.id);
  ok('запись добавляется в расписание', !!ap);
  T.Act.setStatus(ap.id, 'canceled');
  ok('отменённая запись пропадает из дня', !T.dayAppts(S(), today).some(a => a.id === ap.id));
  T.Act.setStatus(ap.id, 'planned');

  const moneyBefore = T.income(S(), today, today).total;
  T.Act.finish(ap.id, {pay: 'cash', zones: ['lower'], levels: {lower: 2}, raw: 'проба', state: 'Напряжение', react: 'Нейтральная', next: 'Через 7 дней'});
  ok('после завершения сеанс проведён', S().appts.find(a => a.id === ap.id).status === 'done');
  ok('деньги за сеанс попали в доход', T.income(S(), today, today).total === moneyBefore + 1200);
  ok('заметка сохранилась', S().notes.some(n => n.apptId === ap.id));
  ok('отметка зоны сохранилась', T.zoneLevels(S(), c.id).lower === 2);

  T.Act.addSub({clientId: c.id, serviceId: 'sv_classic', total: 5, price: 5400, ends: today});
  const sub = T.subOf(S(), c.id);
  ok('абонемент создаётся', !!sub && sub.total === 5 && sub.used === 0);
  T.Act.saveAppt({id: 'ap_test2', clientId: c.id, serviceId: 'sv_classic', date: today, time: '07:00', dur: 60, price: 1200});
  const cash = T.income(S(), today, today).total;
  T.Act.finish('ap_test2', {pay: 'sub'});
  ok('оплата абонементом списывает сеанс', T.subOf(S(), c.id).used === 1);
  ok('оплата абонементом не добавляет денег второй раз', T.income(S(), today, today).total === cash);

  T.Act.delClient(c.id);
  ok('удаление клиента убирает его записи и абонементы',
     !S().appts.some(a => a.clientId === c.id) && !S().subs.some(s => s.clientId === c.id));
}

part('таймер сеанса');
{
  T.Store.init(T.seedDB());
  const a = T.dayAppts(S(), today)[0];
  T.Act.runStart(a.id);
  ok('сеанс запущен', !!S().run && S().run.apptId === a.id);
  const run = S().run;
  ok('через минуту прошло ~60 секунд',
     Math.abs(T.runSeconds(run, run.at + 60000) - 60) <= 1, String(T.runSeconds(run, run.at + 60000)));
  T.Act.runPause();
  const paused = S().run;
  ok('на паузе время стоит', T.runSeconds(paused, Date.now() + 10000) === T.runSeconds(paused, Date.now()));
  T.Act.runResume();
  ok('после паузы счётчик продолжается', S().run.paused === false);
  T.Act.runStop();
  ok('после остановки сеанс не идёт', S().run === null);
}

part('хранилище');
{
  T.Store.init(T.seedDB());
  const n = S().clients.length;
  T.Act.saveClient({name: 'Сохранённый Клиент', pref: 'sv_classic'});
  T.Store.state = null;
  T.Store.init();
  ok('данные переживают перезапуск', S().clients.length === n + 1);
  ok('база читается со своими настройками', S().settings && S().settings.theme === 'light');
  T.Act.reset();
  ok('сброс возвращает демо', S().clients.length === 16);
}

part('уведомления');
{
  T.Store.init(T.seedDB());
  const list = T.notifications(S(), new Date());
  ok('заявки попадают в уведомления', list.filter(n => n.kind === 'request').length === 2);
  ok('уведомление о кончающемся абонементе есть',
     list.some(n => n.kind === 'sub' && /Ирина/.test(n.text)), list.filter(n => n.kind === 'sub').map(n => n.text).join('; '));
  ok('у каждого уведомления есть заголовок и текст', list.every(n => n.title && n.text && n.id));
}

part('экраны');
{
  T.Store.init(T.seedDB());
  const d = S();
  const go = noop, back = noop;
  screen('Главная', () => T.Home({db: d, go, today}));
  screen('Расписание', () => T.Schedule({db: d, go, date: today, setDate: noop, openNew: noop}));
  screen('Расписание · пустой день', () => T.Schedule({db: d, go, date: T.iso(T.addDays(new Date(), 300)), setDate: noop, openNew: noop}));
  screen('Клиенты', () => T.Clients({db: d, go, openNewClient: noop}));
  screen('Клиент', () => T.ClientPage({db: d, id: 'cl_1', go, back, openEdit: noop, openAppt: noop, openNote: noop}));
  screen('Карта тела', () => T.BodyMap({db: d, id: 'cl_1', back, go}));
  screen('Сеанс', () => T.SessionScreen({db: d, id: T.dayAppts(d, today)[0].id, back, go}));
  screen('Запись', () => T.ApptPage({db: d, id: T.dayAppts(d, today)[0].id, back, go, openEdit: noop}));
  screen('Доход', () => T.Income({db: d, back}));
  screen('Аналитика', () => T.Analytics({db: d, back, go}));
  screen('Абонементы', () => T.Subs({db: d, back, go, openNew: noop}));
  screen('Настройки', () => T.Settings({db: d, back, go, openService: noop}));
  screen('Онлайн-запись', () => T.Booking({db: d, back, openAppt: noop}));
  screen('Ещё', () => T.More({db: d, go}));
  screen('Уведомления', () => T.Notifs({db: d, back, go}));
  screen('Форма записи', () => T.ApptForm({open: true, onClose: noop, db: d, init: {date: today}}));
  screen('Форма клиента', () => T.ClientForm({open: true, onClose: noop, db: d, init: null}));
  screen('Форма услуги', () => T.ServiceForm({open: true, onClose: noop, init: d.services[0]}));
  screen('Форма абонемента', () => T.SubForm({open: true, onClose: noop, db: d}));
  screen('Форма оплаты', () => T.PayForm({open: true, onClose: noop, db: d}));
  screen('Шторка «+»', () => T.PlusSheet({open: true, onClose: noop, db: d, onPick: noop}));
  screen('Заметка', () => T.NoteSheet({open: true, onClose: noop, db: d, clientId: 'cl_1'}));
  screen('Нижняя навигация', () => T.TabBar({tab: 'home', onTab: noop, onPlus: noop}));
  screen('Приложение целиком', () => T.App({}));
  screen('Загрузка', () => T.Boot({}));
}

part('пустой кабинет');
{
  const blank = {...T.emptyDB(), clients: [], appts: []};
  T.Store.init(blank);
  const d = S();
  screen('Главная без данных', () => T.Home({db: d, go: noop, today}));
  screen('Клиенты без данных', () => T.Clients({db: d, go: noop, openNewClient: noop}));
  screen('Доход без данных', () => T.Income({db: d, back: noop}));
  screen('Аналитика без данных', () => T.Analytics({db: d, back: noop, go: noop}));
  screen('Абонементы без данных', () => T.Subs({db: d, back: noop, go: noop, openNew: noop}));
  screen('Расписание без данных', () => T.Schedule({db: d, go: noop, date: today, setDate: noop, openNew: noop}));
  ok('доход пустого кабинета — ноль', T.income(d, ...T.periodRange('month')).total === 0);
  ok('следующего сеанса нет', T.nextAppt(d, new Date()) === null);
}

part('тексты экранов');
{
  T.Store.init(T.seedDB());
  const d = S();
  const home = textOf(T.Home({db: d, go: noop, today}));
  ok('на главной здороваются с массажистом', home.includes('Здравствуйте') && home.includes('Александр'));
  ok('на главной есть карточка следующего сеанса или пометка о свободном дне',
     /Следующий сеанс|Сеанс идёт|Ближайших сеансов нет/.test(home));
  ok('на главной четыре быстрых действия',
     ['Клиенты', 'Расписание', 'Доход', 'Аналитика'].every(t => home.includes(t)));
  ok('на главной есть календарь и «Сегодня»', home.includes('Календарь') && home.includes('Сегодня'));
  const cl = textOf(T.ClientPage({db: d, id: 'cl_1', go: noop, back: noop, openEdit: noop, openAppt: noop, openNote: noop}));
  ok('в карточке клиента три действия', ['Сообщение', 'Записать', 'Позвонить'].every(t => cl.includes(t)));
  ok('в карточке клиента три вкладки', ['Информация', 'История', 'Заметки'].every(t => cl.includes(t)));
  ok('в карточке клиента видно абонемент и карту тела',
     cl.includes('Абонемент') && cl.includes('Карта тела'));
  const sc = textOf(T.Schedule({db: d, go: noop, date: today, setDate: noop, openNew: noop}));
  ok('в расписании видны имена клиентов дня',
     T.dayAppts(d, today).every(a => sc.includes(T.clientName(d, a.clientId))));
  const inc = textOf(T.Income({db: d, back: noop}));
  ok('в доходе есть средний чек и сеансы', inc.includes('Средний чек') && inc.includes('Сеансов'));
  const more = T.More({db: d, go: noop});
  ok('сводка на «Ещё» разложена по плиткам', countClass(more, 'stat') === 3, countClass(more, 'stat') + ' шт.');
  ok('на плитках месяц, сеансы и клиенты',
     ['Месяц', 'Сеансов', 'Клиентов'].every(t => textOf(more).includes(t)));
  const sb = T.Subs({db: d, back: noop, go: noop, openNew: noop});
  ok('сводка абонементов такими же плитками', countClass(sb, 'stat') === 2, countClass(sb, 'stat') + ' шт.');
  const bk = textOf(T.Booking({db: d, back: noop, openAppt: noop}));
  ok('на странице записи есть услуги и кнопка', bk.includes('Услуги') && bk.includes('Записаться'));
}

part('дизайн-система');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const has = (s) => html.includes(s);
  ok('брендовый градиент на месте', has('#5B3FD3') && has('#7448E8'));
  ok('фон и карточки из спецификации', has('--bg:#FAFAFC') && has('--card:#FFFFFF'));
  ok('цвета текста из спецификации', has('--ink:#17171C') && has('--ink-2:#858592'));
  ok('граница из спецификации', has('--line:#EEEEF3'));
  ok('пастельные категории из спецификации',
     has('--pa-clients:#F4E8FF') && has('--pa-schedule:#FFF0E5') && has('--pa-income:#FFF3DF') && has('--pa-analytics:#EAF0FF'));
  ok('шрифт Inter подключён', has('family=Inter'));
  ok('тёмная тема — свой набор значений, а не инверсия', has('html[data-theme="dark"]') && has('--bg:#0F0E15'));
  ok('уважается «меньше движения»', has('prefers-reduced-motion'));
  ok('нижняя навигация из пяти мест', T.TABS.length === 5 && T.TABS[2].k === 'plus');
  ok('скелет и пустые состояния описаны', has('.sk') && has('.empty'));
  ok('иконка и манифест на месте',
     fs.existsSync(path.join(ROOT, 'icon.svg')) && fs.existsSync(path.join(ROOT, 'manifest.webmanifest')));
}

console.log('\n' + (fails ? '✗ ' + fails + ' из ' + checks : '✓ все ' + checks) + ' проверок');
process.exit(fails ? 1 : 0);
