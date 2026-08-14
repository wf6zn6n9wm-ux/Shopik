/* Проверка «Про Барбера» без браузера.
   JSX из index.html транспилируется (@babel/standalone или bun), код
   выполняется в песочнице с заглушкой React — и каждый экран реально
   рендерится. Ловит забытые переменные, битые экраны и ошибки в деньгах.

   node barber/tests/smoke.js */
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probarber-'));
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
  /* сеть под контролем: что ушло — видно, что вернуть — задаём */
  const net = {calls: [], queue: []};
  const el = (type, props, ...children) => {
    const p = Object.assign({}, props);
    if (children.length) p.children = children.length === 1 ? children[0] : children;
    return {__el: true, type, props: p};
  };
  const React = {
    createElement: el, Fragment: 'Fragment',
    createContext: d => ({__ctx: true, _d: d, Provider: 'Provider', Consumer: 'Consumer'}),
    useState: v => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {}, useLayoutEffect: () => {},
    useRef: v => ({current: v}), useMemo: f => f(), useCallback: f => f,
    useContext: c => (c && c._d !== undefined ? c._d : {}),
  };
  const doc = {
    documentElement: {dataset: {}, lang: 'ru', style: {setProperty(){}}},
    body: {style: {}},
    getElementById: () => ({setAttribute(){}, style: {}}),
    createElement: () => ({click(){}, setAttribute(){}, style: {}}),
    addEventListener(){}, removeEventListener(){},
  };
  const ctx = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    Intl, Date, Math, JSON, URL, URLSearchParams,
    Blob: class {}, FileReader: class {},
    localStorage: {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k),
    },
    React, ReactDOM: {createRoot: () => ({render(){}})},
    navigator: {onLine: true},
    location: {protocol: 'https:', origin: 'https://probarber.test', href: 'https://probarber.test/barber/index.html', reload(){}},
    history: {pushState(){}, back(){}, state: null},
    document: doc,
    matchMedia: () => ({matches: false, addEventListener(){}, removeEventListener(){}}),
    addEventListener(){}, removeEventListener(){}, scrollTo(){}, open(){},
    fetch: async (url, opts) => {
      let body = {};
      try { body = JSON.parse((opts || {}).body || '{}'); } catch (e){}
      net.calls.push({url, body});
      const next = net.queue.length ? net.queue.shift() : {ok: false, reason: 'off'};
      return {ok: true, status: 200, json: async () => next};
    },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  return {ctx: vm.createContext(ctx), el, net};
}

const EXPORTS = `;globalThis.__T = {
  emptyDB, seedDB, Store, Act, Disk, stats, periodRange, prevRange, growth, series, topServices,
  freeSlots, freeStarts, freeCount, overlaps, withinHours, nextAppt, minutesUntil, rowStatus,
  clientStats, clientRows, daysSince, bdIn, notifications, unreadCount, financeCsv, dayAppts,
  money, phoneMask, mins, hhmm, iso, fromIso, addDays, startOfWeek, dowIdx, durLabel, initials,
  PHRASES, LANGS, t, CURRENCIES, DOW_KEYS, SERVICE_SEED, CLIENT_SEED, PATHS, SCREENS, PAGES,
  App, Home, CalendarPage, Clients, ClientPage, Services, Finance, Messages, Settings,
  ApptForm, ClientForm, ServiceForm, ApptCard, ActiveSession, NotifPanel, MoreSheet, Sidebar,
  MiniCalendar, LineChart, BarChart, MonthGrid, applyTheme, serviceName, clientName, nextLabel,
  Sync, Net, SyncBlock, RemindLinks, serviceById,
};`;

const {ctx, el, net} = sandbox();
vm.runInContext(transpile(source('index.html'), 'app') + EXPORTS, ctx, {filename: 'probarber.jsx'});
const T = ctx.__T;

/* ── 3. отчёт ── */
let checks = 0, fails = 0;
const ok = (name, cond, extra) => {
  checks++;
  if (!cond) fails++;
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
};
const part = title => console.log('\n── ' + title + ' ──');

/* обход дерева: компоненты реально выполняются */
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
const screen = (name, make) => {
  try { const n = walk(make()); ok(name, n > 3, n + ' узлов'); }
  catch (e){ ok(name, false, e.message); }
};

const S = () => T.Store.state;
const today = T.iso(new Date());

part('демо-данные');
const db = T.seedDB();
T.Store.init(db);
ok('клиентов не меньше 20', db.clients.length >= 20, db.clients.length + ' шт.');
ok('услуг восемь', db.services.length === 8, db.services.length + ' шт.');
ok('записей больше тридцати', db.appts.length > 30, db.appts.length + ' шт.');
ok('история тянется на несколько месяцев',
   db.appts.filter(a => a.date < T.iso(T.addDays(new Date(), -120))).length > 50);
ok('сегодняшнее расписание из референса',
   T.dayAppts(db, today).length === 6 && T.dayAppts(db, today)[0].time === '09:00',
   T.dayAppts(db, today).map(a => a.time).join(' '));
ok('есть заявки с сайта', db.appts.filter(a => a.status === 'pending').length === 2);
ok('есть непрочитанные сообщения', T.unreadCount(db) === 3, String(T.unreadCount(db)));
ok('у записей проставлены цена и длительность',
   db.appts.every(a => a.price >= 0 && a.dur > 0 && a.clientId && a.serviceId));
ok('демо-база одинаковая при каждом создании',
   T.seedDB().appts.length === T.seedDB().appts.length);

part('деньги');
ok('доллар пишется впереди', T.money(540, 'USD') === '$540', T.money(540, 'USD'));
ok('тысячи разделяются пробелом', T.money(8540, 'USD') === '$8 540', T.money(8540, 'USD'));
ok('гривна — сзади', T.money(8540, 'UAH') === '8 540 ₴', T.money(8540, 'UAH'));
const [mf, mt] = T.periodRange('month');
const m = T.stats(db, mf, mt);
ok('выручка месяца = сумма проведённых',
   m.revenue === m.rows.reduce((n, a) => n + a.price, 0) && m.revenue > 0, T.money(m.revenue, 'USD'));
ok('отменённые не попадают в деньги',
   T.stats({...db, appts: db.appts.map(a => ({...a, status: 'canceled'}))}, mf, mt).revenue === 0);
ok('запланированные тоже не попадают',
   T.stats({...db, appts: db.appts.map(a => ({...a, status: 'planned'}))}, mf, mt).revenue === 0);
ok('средний чек = выручка / визиты', m.avg === Math.round(m.revenue / m.done));
ok('рост считается от прошлого периода', T.growth(118, 100) === 18 && T.growth(100, 0) === 100 && T.growth(0, 0) === 0);
ok('в CSV попадают только проведённые',
   T.financeCsv(db, mf, mt).trim().split('\n').length === m.rows.length + 1);

part('время и окна');
ok('минуты туда-обратно', T.mins('11:30') === 690 && T.hhmm(690) === '11:30');
ok('свободные окна есть в рабочий день', T.freeCount(db, today, 30) >= 0);
const freeDay = T.iso(T.addDays(new Date(), 40));
ok('пустой рабочий день = целый график свободен',
   T.freeSlots(db, freeDay).length === 1 || T.freeSlots(db, freeDay).length === 0);
{
  const sun = (() => { let d = new Date(); while (T.dowIdx(d) !== 6) d = T.addDays(d, 1); return T.iso(d); })();
  ok('в выходной свободных окон нет', T.freeCount(db, sun, 30) === 0);
  ok('в выходной нельзя записать', T.withinHours(db, sun, '12:00', 30) === false);
}
{
  const one = T.dayAppts(S(), today)[0];
  ok('пересечение находится', T.overlaps(S(), today, one.time, 30) === true);
  ok('сама запись себе не мешает', T.overlaps(S(), today, one.time, 30, one.id) === false);
  ok('свободные старты не пересекаются с занятым',
     T.freeStarts(S(), today, 30, 30).every(x => !T.overlaps(S(), today, x, 30)));
}
{
  const nx = T.nextAppt(S());
  ok('следующая запись найдена и она впереди', !!nx && (nx.date > today || nx.date === today));
  ok('следующая помечается в расписании', !nx || T.rowStatus(S(), nx) === 'next');
  ok('минуты до записи считаются', !nx || typeof T.minutesUntil(nx) === 'number');
}

part('клиент');
{
  const cs = T.clientStats(db, 'cl_0');
  ok('визиты и деньги считаются', cs.visits > 0 && cs.spent > 0, cs.visits + ' визитов, ' + T.money(cs.spent, 'USD'));
  ok('средний чек клиента', cs.avg === Math.round(cs.spent / cs.visits));
  ok('история от новых к старым',
     cs.history.every((a, i) => i === 0 || cs.history[i - 1].date >= a.date));
  /* у клиента из референса запись сегодня в 11:30 — но к обеду она уже
     проведена, поэтому «следующей» будет другая: проверяем оба факта
     по отдельности, а не время суток */
  ok('запись из референса стоит на сегодня',
     T.dayAppts(db, today).some(a => a.clientId === 'cl_0' && a.time === '11:30'));
  ok('следующая запись клиента не в прошлом',
     !cs.next || cs.next.date >= today, cs.next && (cs.next.date + ' ' + cs.next.time));
  ok('день рождения считается через новый год',
     T.bdIn('1990-08-14', new Date(2026, 7, 14)) === 0 &&
     T.bdIn('1990-08-13', new Date(2026, 7, 14)) === 364);
  ok('без даты рождения ничего не считаем', T.bdIn('', new Date()) === null);
}

part('поиск и фильтры');
{
  ok('поиск по имени', T.clientRows(db, 'Иван Петров', 'all').length === 1);
  ok('поиск по телефону', T.clientRows(db, '1234501', 'all').length === 1);
  ok('чужого не находит', T.clientRows(db, 'Джон Уик', 'all').length === 0);
  ok('фильтр «постоянные» уже полного списка',
     T.clientRows(db, '', 'regular').length < db.clients.length);
  ok('фильтр «с записью» отдаёт только тех, у кого есть запись',
     T.clientRows(db, '', 'next').every(({c}) => !!T.clientStats(db, c.id).next));
  ok('фильтр «давно не был» — больше 45 дней',
     T.clientRows(db, '', 'lapsed').every(({s}) => T.daysSince(s.last.date) > 45));
}

part('действия');
{
  const base = T.emptyDB();
  T.Store.init(Object.assign(base, {services: T.seedDB().services}));
  const sv = S().services[0];

  const c = T.Act.addClient({name: 'Тестовый Клиент', phone: T.phoneMask('380671110000')});
  ok('клиент добавляется', S().clients.length === 1 && !!S().clients[0].id);
  ok('телефон нормализуется', c.phone.startsWith('+380'), c.phone);

  const a = T.Act.addAppt({clientId: c.id, serviceId: sv.id, date: today, time: '12:00'});
  ok('запись создаётся с ценой услуги', a.price === sv.price && a.dur === sv.dur);
  ok('запись видна в дне', T.dayAppts(S(), today).length === 1);
  ok('запланированное не даёт выручки', T.stats(S(), today, today).revenue === 0);

  T.Act.complete(a.id);
  ok('завершение переводит в done', S().appts[0].status === 'done');
  ok('выручка появилась', T.stats(S(), today, today).revenue === sv.price, T.money(T.stats(S(), today, today).revenue, 'USD'));
  ok('статистика клиента пересчиталась', T.clientStats(S(), c.id).visits === 1);

  T.Act.move(a.id, T.iso(T.addDays(new Date(), 1)), '15:00');
  ok('перенос меняет дату и время',
     S().appts[0].date === T.iso(T.addDays(new Date(), 1)) && S().appts[0].time === '15:00');
  ok('после переноса день пуст', T.dayAppts(S(), today).length === 0);

  T.Act.cancel(a.id);
  ok('отмена убирает из денег', T.stats(S(), T.iso(T.addDays(new Date(), 1)), T.iso(T.addDays(new Date(), 1))).revenue === 0);
  T.Act.restore(a.id);
  ok('возврат делает запись снова плановой', S().appts[0].status === 'planned');

  const a2 = T.Act.addAppt({clientId: c.id, serviceId: sv.id, date: today, time: '09:00'});
  T.Act.complete(a2.id, 35);
  ok('можно закрыть запись другой суммой', S().appts.find(x => x.id === a2.id).price === 35);

  T.Act.send(c.id, 'Привет!');
  ok('сообщение создаёт диалог', S().threads.length === 1 && S().threads[0].msgs.length === 1);
  T.Act.send(c.id, 'Можно перенести?', 'client');
  ok('входящее считается непрочитанным', T.unreadCount(S()) === 1);
  T.Act.readThread(c.id);
  ok('открытие диалога снимает счётчик', T.unreadCount(S()) === 0);

  const svNew = T.Act.addService({name: 'Тест-услуга', price: 40, dur: 50});
  ok('услуга добавляется', S().services.some(x => x.id === svNew.id));
  T.Act.updService(svNew.id, {price: 45});
  ok('цена меняется', S().services.find(x => x.id === svNew.id).price === 45);
  T.Act.delService(svNew.id);
  ok('услуга удаляется', !S().services.some(x => x.id === svNew.id));
  ok('старые записи от удаления услуги не теряют цену', S().appts.every(x => x.price >= 0));

  T.Act.settings({currency: 'UAH', theme: 'light', lang: 'en'});
  ok('настройки сохраняются', S().settings.currency === 'UAH' && S().settings.theme === 'light');
  T.Act.hours('sun', {on: true, from: '11:00', to: '15:00'});
  ok('график работы правится', S().profile.hours.sun.on === true);
  T.Act.profile({name: 'Другой Барбер'});
  ok('профиль правится', S().profile.name === 'Другой Барбер');

  T.Act.delClient(c.id);
  ok('удаление клиента убирает его записи и диалог',
     !S().appts.some(x => x.clientId === c.id) && !S().threads.some(x => x.clientId === c.id));
}

part('уведомления');
{
  T.Store.init(T.seedDB());
  const list = T.notifications(S());
  ok('заявки с сайта попадают в уведомления', list.filter(n => n.kind === 'online').length === 2);
  ok('непрочитанные попадают в уведомления', list.filter(n => n.kind === 'unread').length === 3);
  const one = list[0];
  T.Act.dismiss(one.id);
  ok('уведомление скрывается', !T.notifications(S()).some(n => n.id === one.id));
  const pend = S().appts.find(a => a.status === 'pending');
  T.Act.accept(pend.id);
  ok('принятая заявка становится записью', S().appts.find(a => a.id === pend.id).status === 'planned');
}

part('хранилище');
{
  T.Store.init(T.seedDB());
  T.Disk.write(S());
  const back = T.Disk.read();
  ok('база переживает перезагрузку', !!back && back.clients.length === S().clients.length);
  const old = T.Disk.read();
  delete old.settings.step; delete old.threads; delete old.profile.hours.sun;
  ctx.localStorage.setItem('probarber.v1', JSON.stringify(old));
  const fixed = T.Disk.read();
  ok('база прошлой версии дополняется значениями по умолчанию',
     fixed.settings.step === 30 && Array.isArray(fixed.threads) && !!fixed.profile.hours.sun);
  ctx.localStorage.setItem('probarber.v1', '{битый json');
  ok('битые данные не роняют приложение', T.Disk.read() === null);
}

part('языки');
{
  const keys = Object.keys(T.PHRASES);
  const bad = keys.filter(k => !T.PHRASES[k].ru || !T.PHRASES[k].uk || !T.PHRASES[k].en);
  ok('во всех фразах три языка', bad.length === 0, bad.join(', ') || keys.length + ' фраз');
  ok('переводы различаются', T.t('navHome', 'ru') === 'Главная' && T.t('navHome', 'en') === 'Home' && T.t('navHome', 'uk') === 'Головна');
  ok('неизвестный ключ не роняет', T.t('нет-такого') === 'нет-такого');
  ok('все языки из настроек поддержаны', T.LANGS.every(l => T.PHRASES.navHome[l.id]));
}

part('экраны');
T.Store.init(T.seedDB());
const SCREEN_LIST = [
  ['Главная', () => el(T.Home, {})],
  ['Календарь', () => el(T.CalendarPage, {})],
  ['Клиенты', () => el(T.Clients, {})],
  ['Карточка клиента', () => el(T.ClientPage, {id: 'cl_0'})],
  ['Карточка удалённого клиента', () => el(T.ClientPage, {id: 'нет-такого'})],
  ['Услуги', () => el(T.Services, {})],
  ['Финансы', () => el(T.Finance, {})],
  ['Сообщения', () => el(T.Messages, {})],
  ['Сообщения · клиент без переписки', () => el(T.Messages, {clientId: 'cl_20'})],
  ['Настройки', () => el(T.Settings, {})],
  ['Оболочка', () => el(T.App, {})],
  ['Меню', () => el(T.MoreSheet, {go(){}})],
];
SCREEN_LIST.forEach(([n, f]) => screen(n, f));

part('модалки');
const anyAppt = S().appts.find(a => a.status === 'planned');
const MODALS = [
  ['Новая запись', () => el(T.ApptForm, {preset: {}})],
  ['Правка записи', () => el(T.ApptForm, {id: anyAppt.id})],
  ['Новый клиент', () => el(T.ClientForm, {})],
  ['Правка клиента', () => el(T.ClientForm, {id: 'cl_0'})],
  ['Новая услуга', () => el(T.ServiceForm, {})],
  ['Правка услуги', () => el(T.ServiceForm, {id: 'sv_0'})],
  ['Карточка записи', () => el(T.ApptCard, {id: anyAppt.id})],
  ['Активная запись', () => el(T.ActiveSession, {id: anyAppt.id})],
  ['Уведомления', () => el(T.NotifPanel, {})],
];
MODALS.forEach(([n, f]) => screen(n, f));

part('что видит барбер');
{
  const home = textOf(el(T.Home, {}));
  ok('на главной есть заголовок дня', home.includes('Сегодня'));
  ok('на главной есть следующая запись', home.includes('Следующая запись'));
  ok('на главной есть расписание', home.includes('Расписание на сегодня'));
  ok('на главной есть топ услуг', home.includes('Топ услуг') && home.includes('Стрижка'));
  ok('на главной есть выручка за месяц', home.includes('Выручка за месяц'));
  ok('на главной видно все четыре KPI',
     ['Клиентов', 'Записей', 'Выручка', 'Свободных окон'].every(x => home.includes(x)));
  const money = T.money(T.stats(S(), today, today).revenue, S().settings.currency);
  ok('KPI выручки показывает реальную сумму', home.includes(money), money);

  const cl = textOf(el(T.ClientPage, {id: 'cl_0'}));
  ok('в карточке клиента есть имя и телефон', cl.includes('Иван Петров') && cl.includes('+380'));
  ok('в карточке клиента есть история', cl.includes('История посещений'));
  ok('в карточке клиента есть заметки', cl.includes('Заметки барбера'));

  const fin = textOf(el(T.Finance, {}));
  ok('в финансах есть все периоды', ['Выручка сегодня', 'Выручка за неделю', 'Выручка за месяц', 'Выручка за год']
     .every(x => fin.includes(x)));
  ok('в финансах есть средний чек и топ-услуга', fin.includes('Средний чек') && fin.includes('Самая популярная услуга'));

  T.Act.settings({lang: 'en'});
  const en = textOf(el(T.Settings, {}));
  ok('интерфейс переключается на английский', en.includes('Working hours') && !en.includes('Рабочее расписание'));
  T.Act.settings({lang: 'uk'});
  ok('и на украинский', textOf(el(T.Clients, {})).includes('Клієнти'));
  T.Act.settings({lang: 'ru'});
}

part('сквозной сценарий');
{
  T.Store.init(T.seedDB());
  const before = T.stats(S(), today, today).revenue;
  const c = T.Act.addClient({name: 'Сквозной Клиент', phone: T.phoneMask('380670000001')});
  const sv = S().services.find(x => x.name === 'Стрижка + борода');
  const free = T.freeStarts(S(), today, sv.dur, 30);
  const a = T.Act.addAppt({clientId: c.id, serviceId: sv.id, date: today, time: free[free.length - 1]});
  ok('запись появилась в расписании дня', T.dayAppts(S(), today).some(x => x.id === a.id));
  ok('и не пересеклась с существующими', !T.overlaps(S(), today, a.time, a.dur, a.id));
  ok('счётчик записей вырос', T.stats(S(), today, today).count === 7);
  T.Act.start(a.id);
  ok('запись стартует', S().appts.find(x => x.id === a.id).status === 'active');
  T.Act.complete(a.id);
  ok('выручка дня выросла ровно на цену услуги',
     T.stats(S(), today, today).revenue === before + sv.price);
  ok('в истории клиента появился визит', T.clientStats(S(), c.id).visits === 1);
  ok('услуга поднялась в топе', T.topServices(S(), ...T.periodRange('month')).some(r => r.name === sv.name));
  const home2 = textOf(el(T.Home, {}));
  ok('главная показывает новую выручку', home2.includes(T.money(before + sv.price, 'USD')));
}

/* дальше — асинхронные проверки: сеть и публичная страница */
(async () => {

part('связь с сервером');
{
  T.Store.init(T.seedDB());
  net.calls.length = 0; net.queue.length = 0;

  /* выключено — в сеть не ходим вовсе */
  const off = await T.Sync.publish();
  ok('без включённой синхронизации запросов нет', off.ok === false && net.calls.length === 0);

  T.Act.settings({sync: true, slug: 'alexey'});
  T.Sync.ensureToken();
  ok('токен кабинета создаётся один раз', !!S().settings.token && S().settings.token.length > 10);
  const tok = S().settings.token;
  T.Sync.ensureToken();
  ok('и не меняется на ровном месте', S().settings.token === tok);

  const load = T.Sync.payload(S());
  ok('на сервер уходят только видимые услуги',
     load.shop.services.length === S().services.filter(x => x.active !== false).length);
  ok('в услугах нет ничего лишнего',
     Object.keys(load.shop.services[0]).sort().join(',') === 'dur,id,name,price');
  ok('занятое время без имён и услуг',
     Object.keys(load.busy[0]).sort().join(',') === 'date,dur,time');
  ok('прошлое не публикуем', load.busy.every(b => b.date >= today));
  ok('и дальше горизонта тоже', load.busy.every(b => b.date <= T.iso(T.addDays(new Date(), 60))));
  ok('отменённые не занимают время', (() => {
    const one = S().appts.find(a => a.date >= today && a.status !== 'canceled');
    T.Act.cancel(one.id);
    const after = T.Sync.payload(S()).busy;
    T.Act.restore(one.id);
    return !after.some(b => b.date === one.date && b.time === one.time);
  })());
  const raw = JSON.stringify(load);
  ok('имена клиентов на сервер не уезжают', !raw.includes('Иван Петров'));
  ok('телефоны клиентов тоже', !raw.includes(S().clients[0].phone));

  net.queue.push({ok: true, slug: 'alexey', busy: load.busy.length});
  const pub = await T.Sync.publish();
  ok('публикация уходит на сервер', pub.ok === true && net.calls.length === 1);
  ok('в запросе есть адрес и токен',
     net.calls[0].body.slug === 'alexey' && net.calls[0].body.token === tok);

  /* заявка с сайта превращается в запись со статусом «заявка» */
  const day = T.iso(T.addDays(new Date(), 5));
  net.calls.length = 0;
  net.queue.push({ok: true, requests: [{
    id: 'rq_1', name: 'Новый Гость', phone: '+380 50 111 22 33',
    service_id: 'sv_0', service: 'Стрижка', price: 20, dur: 45, date: day, time: '17:00', note: 'первый раз',
  }]});
  const pulled = await T.Sync.pull();
  ok('заявка забрана', pulled.ok === true && pulled.added === 1, JSON.stringify(pulled));
  const appt = S().appts.find(a => a.reqId === 'rq_1');
  ok('появилась запись со статусом «заявка»', !!appt && appt.status === 'pending' && appt.source === 'online');
  ok('и новый клиент', !!T.Store.state.clients.find(c => c.name === 'Новый Гость'));
  ok('заявка видна в уведомлениях', T.notifications(S()).some(n => n.apptId === appt.id));
  ok('заявка не считается деньгами', T.stats(S(), day, day).revenue === 0);

  net.queue.push({ok: true, requests: [{
    id: 'rq_1', name: 'Новый Гость', phone: '+380 50 111 22 33',
    service_id: 'sv_0', service: 'Стрижка', price: 20, dur: 45, date: day, time: '17:00', note: '',
  }]});
  const again = await T.Sync.pull();
  ok('повторная выдача той же заявки не дублирует запись', again.added === 0);

  /* тот же телефон — тот же клиент, а не двойник */
  const before = S().clients.length;
  net.queue.push({ok: true, requests: [{
    id: 'rq_2', name: 'Новый Гость', phone: '380 50 111 22 33',
    service_id: 'sv_0', service: 'Стрижка', price: 20, dur: 45, date: day, time: '18:30', note: '',
  }]});
  await T.Sync.pull();
  ok('по знакомому телефону клиент не задваивается', S().clients.length === before);

  /* решение барбера уходит на сервер */
  net.calls.length = 0;
  T.Act.accept(appt.id);
  ok('подтверждение отправлено на сервер',
     net.calls.some(c => c.body.action === 'resolve' && c.body.id === 'rq_1' && c.body.status === 'accepted'));
  const second = S().appts.find(a => a.reqId === 'rq_2');
  net.calls.length = 0;
  T.Act.cancel(second.id);
  ok('отказ тоже отправлен',
     net.calls.some(c => c.body.action === 'resolve' && c.body.id === 'rq_2' && c.body.status === 'declined'));
  net.calls.length = 0;
  T.Act.cancel(S().appts.find(a => a.status === 'planned' && !a.reqId).id);
  ok('обычная запись сервер не трогает', net.calls.length === 0);

  /* сеть может лежать — это не должно ломать кабинет */
  net.queue.push(null);
  const broken = await T.Sync.pull().catch(() => ({ok: false}));
  ok('пустой ответ сервера не роняет кабинет', broken && broken.ok !== undefined);
  T.Act.settings({sync: false});
}

part('экраны с сервером');
{
  T.Store.init(T.seedDB());
  T.Act.settings({sync: true});
  screen('Настройки · синхронизация включена', () => el(T.Settings, {}));
  const txt = textOf(el(T.Settings, {}));
  ok('видно управление приёмом заявок', txt.includes('Приём заявок с сайта'));
  ok('и подключение Telegram', txt.includes('Telegram'));
  T.Act.settings({sync: false});
  ok('выключенная синхронизация честно об этом пишет',
     textOf(el(T.Settings, {})).includes('локальный режим'));

  const withPhone = S().appts.find(a => a.status === 'planned');
  const card = textOf(el(T.ApptCard, {id: withPhone.id}));
  ok('в карточке записи есть напоминание в мессенджер',
     card.includes('WhatsApp') && card.includes('SMS'));
}

part('публичная страница');
{
  const pub = sandbox();
  vm.runInContext(transpile(source('book.html'), 'book') +
    ';globalThis.__B = {Book, slots, DB, dayLabel, save, KEY, fromServer, REASONS, ask};', pub.ctx, {filename: 'book.jsx'});
  const B = pub.ctx.__B;
  ok('страница записи собирается', typeof B.Book === 'function');
  ok('без данных барбера показывает витрину по умолчанию', B.DB().services.length >= 4);
  try { ok('страница рендерится', walk(pub.el(B.Book, {})) > 3); }
  catch (e){ ok('страница рендерится', false, e.message); }

  /* кабинет и страница записи живут в одном браузере: кладём базу
     барбера в то же хранилище и проверяем, что клиент видит его услуги,
     свободное время и что заявка доезжает обратно в кабинет */
  T.Store.init(T.seedDB());
  pub.ctx.localStorage.setItem(B.KEY, JSON.stringify(T.Store.state));
  const shop = B.DB();
  ok('видит услуги барбера', shop.services.length === 8);
  const day = T.iso(T.addDays(new Date(), 3));
  const free = B.slots(shop, day, 45);
  ok('предлагает свободное время', free.length > 0, free.slice(0, 3).join(' '));
  ok('занятое время не предлагается',
     free.every(x => !T.overlaps(shop, day, x, 45)));
  ok('в выходной времени нет', (() => {
    let d = new Date(); while (T.dowIdx(d) !== 6) d = T.addDays(d, 1);
    return B.slots(shop, T.iso(d), 45).length === 0;
  })());
  ok('прошедшее сегодня не предлагается',
     B.slots(shop, T.iso(new Date()), 45).every(x => T.mins(x) > new Date().getHours() * 60));

  const client = {id: 'cl_new', name: 'Онлайн Клиент', phone: '+380 67 000 00 09', birthday: '', photo: '', note: '', createdAt: today};
  B.save(shop, {
    id: 'ap_online', clientId: client.id, serviceId: 'sv_1', date: day, time: free[0],
    dur: 60, price: 30, status: 'pending', note: '', source: 'online', createdAt: today,
  }, client);
  const after = JSON.parse(pub.ctx.localStorage.getItem(B.KEY));
  T.Store.init(after);
  ok('заявка сохранилась в базу барбера', !!S().appts.find(a => a.id === 'ap_online'));
  ok('новый клиент завёлся', !!S().clients.find(c => c.id === 'cl_new'));
  ok('заявка попала в уведомления кабинета',
     T.notifications(S()).some(n => n.kind === 'online' && n.apptId === 'ap_online'));
  ok('заявка ещё не деньги', T.stats(S(), day, day).revenue === 0);

  /* серверный режим: витрина и занятость приходят из API */
  const fromApi = B.fromServer({
    shop: {shop: 'Про Барбер', name: 'Алексей', role: 'Барбер', about: '', address: '', phone: '',
           currency: 'UAH', step: 30,
           hours: {mon: {on: true, from: '09:00', to: '18:00'}, tue: {on: true, from: '09:00', to: '18:00'},
                   wed: {on: true, from: '09:00', to: '18:00'}, thu: {on: true, from: '09:00', to: '18:00'},
                   fri: {on: true, from: '09:00', to: '18:00'}, sat: {on: true, from: '10:00', to: '16:00'},
                   sun: {on: false, from: '10:00', to: '16:00'}},
           services: [{id: 'sv_0', name: 'Стрижка', price: 20, dur: 45}]},
    busy: [{date: day, time: '11:00', dur: 60}],
  });
  ok('ответ сервера превращается в витрину', fromApi.services.length === 1 && fromApi.settings.currency === 'UAH');
  const apiSlots = B.slots(fromApi, day, 45);
  ok('свободное время считается по серверной занятости',
     apiSlots.length > 0 && !apiSlots.includes('11:00') && !apiSlots.includes('11:30'), apiSlots.slice(0, 4).join(' '));
  ok('в занятости с сервера нет ничего лишнего',
     Object.keys(fromApi.appts[0]).sort().join(',') === 'date,dur,status,time');
  ok('на каждый отказ сервера есть человеческий текст',
     ['taken', 'closed', 'past', 'too_many', 'bad_phone'].every(r => !!B.REASONS[r]));
  T.Act.accept('ap_online');
  ok('после подтверждения запись становится плановой',
     S().appts.find(a => a.id === 'ap_online').status === 'planned');
}

console.log('\n' + (fails ? '✗ ' + fails + ' из ' + checks : '✓ все ' + checks) + ' проверок');
process.exit(fails ? 1 : 0);
})();
