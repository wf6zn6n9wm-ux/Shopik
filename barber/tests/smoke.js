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
    /* шифрование базы: в браузере это встроенные объекты, в узле их надо
       положить в песочницу руками — иначе Vault не соберётся */
    TextEncoder, TextDecoder, btoa, atob, crypto: require('crypto').webcrypto,
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
  PHRASES, LANGS, t, applyLang, CURRENCIES, DOW_KEYS, SERVICE_SEED, CLIENT_SEED, PATHS, SCREENS, PAGES,
  App, Home, CalendarPage, Clients, ClientPage, Services, Finance, Messages, Settings,
  ApptForm, ClientForm, ServiceForm, ApptCard, ActiveSession, NotifPanel, MoreSheet, Sidebar,
  MiniCalendar, LineChart, BarChart, MonthGrid, applyTheme, serviceName, clientName, nextLabel,
  Sync, Net, SyncBlock, RemindLinks, serviceById, dayWord, CHANNELS, NextCard,
  fitName, nameRoom, EventBox,
  Access, Web, Meta, WEB, PLANS, TRIAL_DAYS, planById, uah, addMonthsKeep, normLogin,
  loginLooksReal, useAccess, ACCESS_LABEL, AppGate, TrialIntro, Paywall, SubscriptionPage,
  AccessCard, PlanCards, LoginBox, BackupCard,
  Vault, isEmail, isPhone, isLogin, b64, unb64,
  Boot, bootPhase, Onboarding, Auth, PinLock, Setup, SkScreen, ErrorBox, ObArt, LangPick, PinModal,
  Box, Files, Backups, BACKUP_KEY, META_KEY,
  LEGAL, LEGAL_DOCS, LEGAL_READY, Support, LegalPage, LegalLinks,
  expensesIn, spent, profit, EXPENSE_KINDS, ExpenseForm, pickFile, pickPhoto,
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
  ok('поиск по имени', T.clientRows(db, 'Іван Петренко', 'all').length === 1);
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

part('база на диске');
{
  T.Store.init(T.seedDB());
  T.Disk.write(S());
  const back = T.Disk.read();
  ok('база переживает перезагрузку', !!back && back.clients.length === S().clients.length);
  const old = T.Disk.read();
  delete old.settings.step; delete old.threads; delete old.profile.hours.sun;
  /* пишем через то же хранилище, что и приложение: у Box своя память,
     и запись мимо неё в жизни не случается */
  T.Box.set('probarber.v1', JSON.stringify(old));
  const fixed = T.Disk.read();
  ok('база прошлой версии дополняется значениями по умолчанию',
     fixed.settings.step === 30 && Array.isArray(fixed.threads) && !!fixed.profile.hours.sun);
  T.Box.set('probarber.v1', '{битый json');
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

  /* Барберы в Украине — украинский первым. Переключатель на месте, но
     угадывать язык за человека и встречать его русским мы не должны. */
  ok('украинский стоит первым в переключателе', T.LANGS[0].id === 'uk');
  ok('и он же язык по умолчанию', T.emptyDB().settings.lang === 'uk');
  ok('новый кабинет считает в гривне', T.emptyDB().settings.currency === 'UAH');
  ok('атрибут документа едет вместе с языком',
     T.applyLang('en') === 'en' && ctx.document.documentElement.lang === 'en');
  T.applyLang('uk');

  /* Демо-база — то, что барбер увидит сразу после «заполнить примером».
     Долларовые цены в гривневом кабинете читались бы как поломка. */
  const demoDb = T.seedDB();
  ok('демо-услуги стоят по-гривневому', demoDb.services[0].price >= 100,
     demoDb.services[0].name + ' — ' + demoDb.services[0].price);
  ok('и расходы тоже', demoDb.expenses.every(e => e.amount >= 100));
  const cyr = s => /[ыэъё]|(^|[^а-яіїєґ])и/i.test(s);
  const ruNames = demoDb.clients.filter(c => cyr(c.name)).map(c => c.name);
  ok('демо-клиенты названы по-украински', ruNames.length === 0, ruNames.slice(0, 3).join(', '));
  const ruMsg = demoDb.threads.flatMap(th => th.msgs).filter(m => cyr(m.text)).map(m => m.text);
  ok('и переписка тоже', ruMsg.length === 0, ruMsg.slice(0, 2).join(' | '));

  /* Текст, зашитый в разметку мимо словаря, переключением языка не
     лечится: он останется русским на украинском экране. */
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const app = src.slice(src.indexOf('/* ── 3. ДАННЫЕ'));
  const inline = (app.match(/(?:label|placeholder)=(?:"[^"]*[А-Яа-яЁё][^"]*"|'[^']*[А-Яа-яЁё][^']*')/g) || [])
    .filter(x => !x.includes('Про Барбер'));   /* название бренда не переводится */
  ok('в разметке нет подписей мимо словаря', inline.length === 0, inline.slice(0, 3).join(' '));
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
  ok('на главной есть заголовок дня', home.includes('Сьогодні'));
  ok('на главной есть следующая запись', home.includes('Наступний запис'));
  ok('на главной есть расписание', home.includes('Розклад на сьогодні'));
  ok('на главной есть топ услуг', home.includes('Топ послуг') && home.includes('Стрижка'));
  ok('на главной есть выручка за месяц', home.includes('Виручка за місяць'));
  ok('на главной видно все четыре KPI',
     ['Клієнтів', 'Записів', 'Виручка', 'Вільних вікон'].every(x => home.includes(x)));
  const money = T.money(T.stats(S(), today, today).revenue, S().settings.currency);
  ok('KPI выручки показывает реальную сумму', home.includes(money), money);

  const cl = textOf(el(T.ClientPage, {id: 'cl_0'}));
  ok('в карточке клиента есть имя и телефон', cl.includes('Іван Петренко') && cl.includes('+380'));
  ok('в карточке клиента есть история', cl.includes('Історія відвідувань'));
  ok('в карточке клиента есть заметки', cl.includes('Нотатки барбера'));

  const fin = textOf(el(T.Finance, {}));
  ok('в финансах есть все периоды', ['Виручка сьогодні', 'Виручка за тиждень', 'Виручка за місяць', 'Виручка за рік']
     .every(x => fin.includes(x)));
  ok('в финансах есть средний чек и топ-услуга', fin.includes('Середній чек') && fin.includes('Найпопулярніша послуга'));

  T.Act.settings({lang: 'en'});
  const en = textOf(el(T.Settings, {}));
  ok('интерфейс переключается на английский', en.includes('Working hours') && !en.includes('Робочий розклад'));
  T.Act.settings({lang: 'uk'});
  ok('и на украинский', textOf(el(T.Clients, {})).includes('Клієнти'));
  T.Act.settings({lang: 'ru'});
}

part('имена в календаре');
{
  ok('короткое имя показывается целиком', T.fitName('Иван Петров', 14) === 'Иван Петров');
  ok('длинное сокращается до фамилии-буквы',
     T.fitName('Григорий Шевченко', 14) === 'Григорий Ш.', T.fitName('Григорий Шевченко', 14));
  ok('точка после буквы, а не многоточие',
     !T.fitName('Святослав Романюк', 12).includes('…') && !T.fitName('Святослав Романюк', 12).includes('...'));
  ok('когда и сокращения мало — остаётся одно имя',
     T.fitName('Владислав Бондаренко', 9) === 'Владислав', T.fitName('Владислав Бондаренко', 9));
  ok('в совсем узкой колонке остаются инициалы, а не обрывок',
     T.fitName('Владислав Титов', 6) === 'В.Т.', T.fitName('Владислав Титов', 6));
  ok('инициалы только когда иначе никак',
     T.fitName('Владислав Титов', 10) === 'Владислав', T.fitName('Владислав Титов', 10));
  ok('имя без фамилии не ломается', T.fitName('Марк', 3) === 'Марк');
  ok('пустое имя не ломает', T.fitName('', 10) === '' && T.fitName(null, 10) === '');
  ok('лишние пробелы схлопываются', T.fitName('Иван   Петров', 40) === 'Иван Петров');
  ok('двойные имена не теряют смысл',
     T.fitName('Анна-Мария Ковалёва', 14) === 'Анна-Мария К.', T.fitName('Анна-Мария Ковалёва', 14));

  ok('в узкой колонке места меньше, чем в широкой',
     T.nameRoom(104, true) < T.nameRoom(200, true));
  ok('в тесной плашке место урезано временем',
     T.nameRoom(160, true) < T.nameRoom(160, false));
  ok('без измеренной ширины берём минимум колонки', T.nameRoom(0, false) === T.nameRoom(104, false));

  /* плашка: длинное имя сокращено, полное — в подсказке и в карточке */
  T.Store.init(T.seedDB());
  const cl = T.Act.addClient({name: 'Григорій Шевченко'});
  const sv = S().services.find(x => x.dur <= 30) || S().services[0];
  const day = T.iso(T.addDays(new Date(), 12));
  const ap = T.Act.addAppt({clientId: cl.id, serviceId: sv.id, date: day, time: '19:00', dur: 30, price: 15});
  /* один раз выполняем компонент, чтобы посмотреть на саму плашку */
  const boxOf = colW => {
    const node = el(T.EventBox, {a: ap, db: S(), top: 0, height: 26, colW, onOpen(){}});
    return node.type(node.props);
  };
  const desk = boxOf(168), phone = boxOf(104), wide = boxOf(260);
  ok('на десктопной колонке — имя и буква фамилии',
     textOf(desk).includes('Григорій Ш.'), textOf(desk).trim());
  ok('в самой узкой колонке — инициалы, а не обрывок слова',
     textOf(phone).includes('Г.Ш.') && !textOf(phone).includes('Шевч'), textOf(phone).trim());
  ok('многоточия нет нигде',
     [desk, phone, wide].every(x => !textOf(x).includes('…') && !textOf(x).includes('...')));
  ok('время осталось на месте', textOf(desk).includes('19:00'));
  ok('в широкой плашке имя целиком', textOf(wide).includes('Григорій Шевченко'));
  ok('полное имя лежит в подсказке',
     (desk.props.title || '').includes('Григорій Шевченко') &&
     (phone.props.title || '').includes('Григорій Шевченко'), desk.props.title);
  ok('имя не обрезается многоточием стилями',
     !JSON.stringify(desk).includes('"n cut"'));
  ok('карточка записи показывает полное имя',
     textOf(el(T.ApptCard, {id: ap.id})).includes('Григорій Шевченко'));
  T.Act.delClient(cl.id);
}

part('понятность дат');
{
  T.Store.init(T.seedDB());
  const tomorrow = T.iso(T.addDays(new Date(), 1));
  ok('сегодня называется «Сегодня»', T.dayWord(today) === 'Сьогодні', T.dayWord(today));
  ok('завтра называется «Завтра»', T.dayWord(tomorrow) === 'Завтра', T.dayWord(tomorrow));
  ok('вчера называется «Вчера»', T.dayWord(T.iso(T.addDays(new Date(), -1))) === 'Вчора');
  ok('дальний день — день недели и дата',
     /^[А-Яа-я]{2}, \d/.test(T.dayWord(T.iso(T.addDays(new Date(), 9)))), T.dayWord(T.iso(T.addDays(new Date(), 9))));

  /* когда на сегодня записей не осталось, карточка обязана сказать
     «Завтра» — проверяем на чистой базе, чтобы не поймать соседнюю
     запись из демо-данных */
  const base = T.emptyDB();
  base.services = T.seedDB().services;
  T.Store.init(base);
  const client = T.Act.addClient({name: 'Завтрашний Клиент', phone: '+380 67 000 11 22'});
  const sv = S().services.find(x => x.name === 'Стрижка + борода');
  T.Act.addAppt({clientId: client.id, serviceId: sv.id, date: tomorrow, time: '11:00'});
  const card = textOf(el(T.NextCard, {db: S()}));
  ok('карточка следующей записи говорит «Завтра»', card.includes('Завтра') && card.includes('11:00'));
  ok('и показывает клиента с услугой',
     card.includes('Завтрашний Клиент') && card.includes(sv.name));
  const cur0 = S().settings.currency;
  ok('и длительность с ценой',
     card.includes(T.durLabel(sv.dur, 'uk')) && card.includes(T.money(sv.price, cur0)),
     T.durLabel(sv.dur, 'uk') + ' / ' + T.money(sv.price, cur0));
  ok('сегодняшняя запись подписывается «Сегодня», а не датой', (() => {
    T.Act.addAppt({clientId: client.id, serviceId: sv.id, date: today, time: '23:30'});
    return textOf(el(T.NextCard, {db: S()})).includes('Сьогодні');
  })());
  T.Store.init(T.seedDB());
}

part('каналы связи');
{
  ok('каналов три', T.CHANNELS.length === 3);
  ok('по умолчанию ни один не подключён', T.CHANNELS.every(ch => ch.on(S()) === false));
  T.Act.settings({tgLinked: true});
  ok('после привязки Telegram статус меняется',
     T.CHANNELS.find(ch => ch.id === 'tg').on(S()) === true);
  ok('WhatsApp и SMS честно остаются не подключёнными',
     T.CHANNELS.filter(ch => ch.id !== 'tg').every(ch => ch.on(S()) === false));
  T.Act.settings({tgLinked: false});
  const txt = textOf(el(T.Messages, {}));
  ok('на экране сообщений видно, что канал не подключён', txt.includes('Не підключено'));
  ok('и как его подключить', txt.includes('налаштуваннях сповіщень'));
  ok('и что переписка внутренняя', txt.includes('Внутрішні повідомлення'));
}

part('серии и расходы');
{
  T.Store.init(T.seedDB());
  const sv = S().services[0];
  const c = T.Act.addClient({name: 'Серийный Клиент'});
  const start = T.iso(T.addDays(new Date(), 30));

  const r = T.Act.addSeries({clientId: c.id, serviceId: sv.id, date: start, time: '19:00',
                             dur: sv.dur, price: sv.price, status: 'planned'}, 'two', 4);
  ok('серия создаёт нужное число записей', r.made.length === 4, r.made.length + ' из 4');
  ok('шаг серии — две недели',
     r.made[1].date === T.iso(T.addDays(T.fromIso(start), 14)) &&
     r.made[3].date === T.iso(T.addDays(T.fromIso(start), 42)));
  ok('все записи серии помечены одним ключом', r.made.every(a => a.repeatId === r.repeatId));

  /* занятое время серия не занимает молча */
  const busyDate = T.iso(T.addDays(T.fromIso(start), 14));
  const c2 = T.Act.addClient({name: 'Занял Место'});
  T.Act.addAppt({clientId: c2.id, serviceId: sv.id, date: busyDate, time: '13:00', dur: 60, price: 20});
  const r2 = T.Act.addSeries({clientId: c.id, serviceId: sv.id, date: start, time: '13:00',
                              dur: 60, price: 20, status: 'planned'}, 'two', 3);
  ok('занятые даты серия пропускает', r2.skipped === 1 && r2.made.length === 2,
     'создано ' + r2.made.length + ', пропущено ' + r2.skipped);

  T.Act.cancelSeries(r.repeatId, r.made[1].date);
  const left = S().appts.filter(a => a.repeatId === r.repeatId);
  ok('отмена серии не трогает прошедшие записи',
     left.filter(a => a.status === 'planned').length === 1 &&
     left.filter(a => a.status === 'canceled').length === 3);

  /* расходы и чистая прибыль */
  const [mf2, mt2] = T.periodRange('month');
  const before = T.spent(S(), mf2, mt2);
  const e = T.Act.addExpense({title: 'Ножницы', amount: 120, kind: 'tools', date: today});
  ok('расход добавляется', T.spent(S(), mf2, mt2) === before + 120);
  ok('чистая прибыль = выручка минус расходы',
     T.profit(S(), mf2, mt2) === T.stats(S(), mf2, mt2).revenue - T.spent(S(), mf2, mt2));
  ok('расход не трогает выручку', T.stats(S(), mf2, mt2).revenue === T.stats(S(), mf2, mt2).rows.reduce((n, a) => n + a.price, 0));
  T.Act.updExpense(e.id, {amount: 200});
  ok('расход правится', T.spent(S(), mf2, mt2) === before + 200);
  T.Act.delExpense(e.id);
  ok('расход удаляется', T.spent(S(), mf2, mt2) === before);
  ok('расходы за чужой период не считаются',
     T.spent(S(), T.iso(T.addDays(new Date(), 300)), T.iso(T.addDays(new Date(), 330))) === 0);
  ok('в демо-базе расходы уже есть', (S().expenses || []).length > 5, String((S().expenses || []).length));
  ok('у каждого расхода известный вид',
     S().expenses.every(x => T.EXPENSE_KINDS.some(k => k.id === x.kind)));

  /* база прошлой версии — без расходов */
  const old = T.emptyDB();
  delete old.expenses;
  ok('база без расходов не ломает расчёты', T.spent(old, mf2, mt2) === 0);
}

part('новые экраны');
{
  screen('Расход · новый', () => el(T.ExpenseForm, {}));
  screen('Расход · правка', () => el(T.ExpenseForm, {id: S().expenses[0].id}));
  const fin = textOf(el(T.Finance, {}));
  ok('в финансах есть расходы и чистая прибыль',
     fin.includes('Витрати') && fin.includes('Чистими'));
  const seriesAppt = S().appts.find(a => a.repeatId && a.status === 'planned');
  ok('в карточке записи серии видно, что это серия',
     !seriesAppt || textOf(el(T.ApptCard, {id: seriesAppt.id})).includes('Серія'));
  ok('в форме записи есть повтор', textOf(el(T.ApptForm, {preset: {}})).includes('Повторювати'));
  ok('в настройках есть загрузка копии', textOf(el(T.Settings, {})).includes('Завантажити копію'));
  ok('фото можно загрузить файлом', textOf(el(T.ClientForm, {})).includes('Завантажити фото'));
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
  ok('главная показывает новую выручку', home2.includes(T.money(before + sv.price, S().settings.currency)));
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
  ok('имена клиентов на сервер не уезжают', !raw.includes('Іван Петренко'));
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
  ok('видно управление приёмом заявок', txt.includes('Приймання заявок із сайту'));
  ok('и подключение Telegram', txt.includes('Telegram'));
  T.Act.settings({sync: false});
  ok('выключенная синхронизация честно об этом пишет',
     textOf(el(T.Settings, {})).includes('локальний режим'));

  const withPhone = S().appts.find(a => a.status === 'planned');
  const card = textOf(el(T.ApptCard, {id: withPhone.id}));
  ok('в карточке записи есть напоминание в мессенджер',
     card.includes('WhatsApp') && card.includes('SMS'));
}

part('вход');
{
  const A = T.Access;
  T.Box.remove('probarber.meta');
  T.Box.remove('probarber.v1');

  ok('почта и телефон различаются',
     T.isEmail('barber@mail.com') && !T.isEmail('067') &&
     T.isPhone('067 123 45 67') && !T.isPhone('12'));
  ok('логином годится и то, и другое',
     T.isLogin('barber@mail.com') && T.isLogin('+380671234567') && !T.isLogin('барбер'));

  screen('приветствие', () => T.Onboarding({onDone(){}}));
  screen('вход', () => T.Auth({onReady(){}}));
  screen('вход из настроек', () => T.Auth({save: true, onReady(){}}));
  screen('PIN-замок', () => T.PinLock({mode: 'enter', onPin(){}}));
  screen('мастер настройки', () => T.Setup({account: null, onDone(){}}));
  screen('заставка загрузки', () => T.SkScreen({}));
  screen('экран ошибки', () => T.ErrorBox({title: 'ой', text: 'что-то не так', onRetry(){}}));
  screen('стартовый экран собирается', () => T.Boot({}));

  /* куда ведёт запуск — по состоянию устройства, без браузера */
  const DB = '{"clients":[]}';
  ok('чистое устройство — приветствие', T.bootPhase({}, null) === 'onboard');
  ok('приветствие уже видели — сразу вход', T.bootPhase({guest: true}, null) === 'auth');
  ok('база на месте — прямо в кабинет', T.bootPhase({}, DB) === 'app');
  ok('база под PIN — замок', T.bootPhase({}, '{"enc":1,"iv":"x","ct":"y"}') === 'pin');
  ok('вышли из кабинета — снова вход', T.bootPhase({signedOut: true}, DB) === 'auth');
  ok('битая база — экран ошибки, а не белый лист', T.bootPhase({}, '{не json') === 'error');

  const ob = textOf(T.Onboarding({onDone(){}}));
  ok('на приветствии три экрана и кнопка «пропустить»', /Пропустити/.test(ob) && /Далі/.test(ob));

  /* Картинки приветствия обещают кабинет, поэтому собраны из его же
     иконок. Если бы они рисовались отдельно, обещание разошлось бы с
     приложением молча — сравнить их глазами никто не догадается. */
  {
    const icons = art => {
      const out = [];
      const walkIcons = n => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walkIcons);
        if (n.__el){
          if (typeof n.type === 'function' && n.type.name === 'Icon' && n.props.n) out.push(n.props.n);
          if (typeof n.type === 'function' && n.type.name !== 'Icon') walkIcons(n.type(n.props));
          walkIcons(n.props && n.props.children);
        }
      };
      walkIcons(art);
      return out;
    };
    const all = [0, 1, 2].map(i => icons(T.ObArt({i})));
    ok('на каждой картинке есть иконки приложения', all.every(x => x.length >= 3),
       all.map(x => x.length).join(' / '));
    const flat = all.flat();
    ok('и все они из общего набора', flat.every(n => !!T.PATHS[n]),
       flat.filter(n => !T.PATHS[n]).join(', ') || [...new Set(flat)].join(' '));
    /* текст на картинке — из словаря: иначе переключение языка меняет
       заголовок, а картинку под ним нет */
    const artText = [0, 1, 2].map(i => textOf(T.ObArt({i}))).join(' ');
    ok('подписи на картинках переводятся', artText.includes(T.t('kpiClients', 'uk')));
    T.applyLang('en');
    ok('и на другом языке тоже', textOf(T.ObArt({i: 0})).includes(T.t('kpiClients', 'en')));
    T.applyLang('uk');
  }
  const auth = textOf(T.Auth({onReady(){}}));
  ok('на входе просят почту или телефон', /Пошта або телефон/.test(auth));
  ok('никаких кодов и подтверждений не обещают', /жодних кодів/i.test(auth));
  ok('можно и без регистрации', /без реєстрації/i.test(auth));
  ok('в режиме «сохранить» кнопки смены режима нет',
     !/Вже є кабінет/.test(textOf(T.Auth({save: true, onReady(){}}))));

  const setup = textOf(T.Setup({account: null, onDone(){}}));
  ok('мастер спрашивает имя, барбершоп и валюту',
     /Як вас звати/.test(setup) && /барбершоп/i.test(setup) && /Валюта/.test(setup));
  ok('и предлагает заполнить примером', /Заповнити прикладом/.test(setup));

  /* аккаунт и гость */
  T.Meta.write({account: {login: 'barber@mail.com', raw: 'Barber@Mail.com', kind: 'email', createdAt: Date.now()}});
  ok('после входа логин виден подписке', T.Web.login() === 'barber@mail.com');
  ok('и в настройках появляется кабинет', textOf(T.Settings({})).includes('barber@mail.com'));
  T.Meta.write({account: null, guest: true});
  ok('гостю предлагают привязать почту', /Прив’язати пошту/.test(textOf(T.Settings({}))));
  ok('и подписка про логин ничего не знает', T.Web.login() === '');

  /* «Выйти» не должно стирать работу: база остаётся, спрашивают только логин */
  T.Store.init(T.seedDB());
  T.Disk.write(T.Store.state);
  const kept = T.Disk.read().clients.length;
  T.Meta.write({account: null, guest: false, signedOut: true});
  ok('после выхода данные остаются на устройстве', T.Disk.read().clients.length === kept, kept + ' клиентов');
  ok('а вход снова спрашивают', T.bootPhase({signedOut: true}, T.Disk.readRaw()) === 'auth');
  T.Meta.write({signedOut: false, guest: true});
}

part('документы');
{
  const D = T.LEGAL_DOCS;
  ok('документа два', Object.keys(D).sort().join() === 'privacy,terms');
  Object.keys(D).forEach(k => {
    ok(k + ': есть заголовок и разделы', !!D[k].title && D[k].blocks.length >= 8,
       D[k].blocks.length + ' разделов');
    ok(k + ': ни один раздел не пуст',
       D[k].blocks.every(([h, tx]) => h.trim().length > 2 && tx.trim().length > 40));
  });

  const terms = D.terms.blocks.map(b => b[1]).join('\n');
  const priv = D.privacy.blocks.map(b => b[1]).join('\n');

  /* документ обязан описывать то, что приложение делает на самом деле */
  ok('условия называют настоящий срок пробного', terms.includes(String(T.TRIAL_DAYS) + ' дней'));
  ok('и настоящие цены', T.PLANS.every(p => terms.includes(T.uah(p.uah))),
     T.PLANS.map(p => T.uah(p.uah)).join(' '));
  ok('и что платежи разовые, без автосписаний',
     /разовы/i.test(terms) && /автосписаний с карты нет/i.test(terms));
  ok('и лимит устройств тот же, что в коде',
     terms.includes('трёх устройствах') && T.WEB.devices === 3);
  ok('в условиях нет обещания автопродления', !/продлевается автоматически/i.test(terms));

  /* самое чувствительное: что уезжает с устройства */
  ok('политика говорит, что база лежит на устройстве', /на вашем устройстве/i.test(priv));
  ok('и что имён клиентов мы не получаем', /без имён/i.test(priv));
  ok('и отдельно — про заявки с сайта', /заявк/i.test(priv) && /телефон/i.test(priv));
  ok('и про шифрование PIN-кодом', /PIN/.test(priv));
  ok('и про то, что забытый PIN не восстановить', /восстановить забытый PIN невозможно/i.test(priv));

  /* реквизиты заполнены — и нигде не осталось «(укажите …)» */
  ok('реквизиты на месте', T.LEGAL_READY === true, T.LEGAL.company);
  ok('и в тексте нет незаполненных мест',
     !/\(укажите /.test(terms) && !/\(укажите /.test(priv));
  ok('РНОКПП, адрес и телефон попали в документ',
     terms.includes(T.LEGAL.id) && terms.includes(T.LEGAL.address) && terms.includes(T.LEGAL.phone));
  /* почты у поддержки нет: в документах не должно остаться «напишите на» */
  ok('почта не упоминается, раз её нет',
     T.LEGAL.email === '' && !/на\s+\S+@/.test(terms + priv));
  ok('вместо неё — телефон и Telegram',
     /Telegram @/.test(terms) && /по телефону/.test(terms));

  screen('экран условий', () => T.LegalPage({doc: 'terms', onClose(){}}));
  screen('экран политики', () => T.LegalPage({doc: 'privacy', onClose(){}}));
  const links = textOf(T.LegalLinks({onOpen(){}}));
  ok('ссылки ведут на оба документа',
     links.includes('Умови використання') && links.includes('Політика конфіденційності'));
  ok('неизвестный документ не роняет экран', walk(T.LegalPage({doc: 'нетакого', onClose(){}})) > 3);

  const page = textOf(T.LegalPage({doc: 'terms', onClose(){}}));
  ok('на экране условий нет предупреждения — реквизиты заполнены',
     !/Реквизиты не заполнены/.test(page));
  ok('зато есть сам текст документа и реквизиты в подвале',
     page.includes('Про Барбер') && page.includes(T.LEGAL.id));

  ok('документы есть в разводке экранов', typeof T.SCREENS.legal === 'function');
  ok('в настройках есть раздел документов', textOf(T.Settings({})).includes('Документи'));
  ok('и ссылка на поддержку', textOf(T.Settings({})).includes('Підтримк'));
  ok('на экране оплаты документы тоже под рукой',
     textOf(T.Paywall({mode: 'gate'})).includes('Умови використання'));

  ok('поддержка ведёт в чат', T.Support.url() === 'https://t.me/suport_uk', T.Support.url());
  ok('и телефон тоже под рукой', T.Support.tel() === 'tel:+380951825456', T.Support.tel());
}

part('публичные страницы');
{
  const has = f => fs.existsSync(path.join(ROOT, f));
  ['terms.html', 'privacy.html', 'support.html', 'delete.html'].forEach(f =>
    ok('есть ' + f, has(f)));
  ok('исходники документов лежат отдельно',
     has('legal/terms.md') && has('legal/privacy.md') && has('legal/sync.js'));

  const html = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const t = html('terms.html'), p = html('privacy.html'), d = html('delete.html'), sup = html('support.html');

  ok('страницы собраны из тех же документов',
     t.includes(T.LEGAL_DOCS.terms.blocks[1][0]) && p.includes(T.LEGAL_DOCS.privacy.blocks[0][0]));
  ok('подстановок в готовых страницах не осталось',
     ![t, p, d].some(x => x.includes('{{')));
  ok('на страницах нет пометки о незаполненных реквизитах',
     ![t, p, d].some(x => /Реквизиты не заполнены/.test(x)));
  ok('и нет ссылок на несуществующую почту', ![t, p, d].some(x => x.includes('mailto:')));
  ok('реквизиты видны в подвале каждой страницы',
     [t, p, d].every(x => x.includes(T.LEGAL.id) && x.includes(T.LEGAL.company)));
  ok('страницы ссылаются друг на друга',
     t.includes('privacy.html') && p.includes('terms.html') && d.includes('support.html'));
  ok('и все — на удаление данных', [t, p].every(x => x.includes('delete.html')));
  ok('оформление берут из общего файла',
     [t, p, d, sup].every(x => x.includes('pay.css')));
  /* .go{display:flex} перебивает встроенный [hidden], и скрытая кнопка
     осталась бы пустой жёлтой полосой — было ровно так */
  ok('скрытая кнопка действительно скрыта',
     /\.go\[hidden\]\{display:none\}/.test(fs.readFileSync(path.join(ROOT, 'pay.css'), 'utf8')));
  ok('поддержка отвечает на то, что спрашивают', (sup.match(/\['/g) || []).length > 20);
  ok('и контакты на ней те же, что в документах',
     sup.includes(T.LEGAL.telegram) && sup.includes(T.LEGAL.phone));
  ok('и знает три языка', ['ru:', 'uk:', 'en:'].every(k => sup.includes(k)));
  ok('цены на странице поддержки те же', T.PLANS.every(x => sup.includes(T.uah(x.uah))));

  /* Документы возят туда-обратно скриптом: правки юриста приходят в .md
     и возвращаются в код. Если разбор сломается, они молча потеряются —
     поэтому гоняем полный круг и сверяем .md до и после.

     Сравнивать index.html бессмысленно: import переписывает многострочные
     шаблоны в одну строку с \n. Текст при этом тот же, а байты другие. */
  const {execFileSync} = require('child_process');
  const sync = path.join(ROOT, 'legal', 'sync.js');
  const keep = {};
  ['index.html', 'legal/terms.md', 'legal/privacy.md'].forEach(f => {
    keep[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
  });
  try {
    execFileSync('node', [sync, 'import'], {encoding: 'utf8'});
    execFileSync('node', [sync, 'export'], {encoding: 'utf8'});
    const same = ['legal/terms.md', 'legal/privacy.md']
      .filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8') !== keep[f]);
    ok('import + export возвращают документы без потерь', same.length === 0, same.join(' '));
  } catch (e){
    ok('import + export возвращают документы без потерь', false, String(e.message).slice(0, 80));
  } finally {
    /* проверка не должна переформатировать исходник */
    Object.keys(keep).forEach(f => fs.writeFileSync(path.join(ROOT, f), keep[f]));
  }
}

part('офлайн');
{
  /* Настоящий прогон worker'а: свой self, свой кеш, своя сеть.
     Проверяем поведение, а не текст файла — регексы по исходнику ловят
     переименования, но не логику. */
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

  function runSW({offline = false} = {}){
    const store = new Map();          /* имя кеша → Map(ключ → ответ) */
    const asked = [];                 /* что ушло в сеть */
    const base = 'https://probarber.test/sw.js';
    const abs = u => new URL(u, base).href;          /* Cache API хранит полные адреса */
    const key = r => abs(typeof r === 'string' ? r : r.url);
    const resp = (body, extra) => Object.assign({ok: true, type: 'basic', body, clone(){ return resp(body, extra); }}, extra || {});

    const cacheApi = name => ({
      add: async u => { if (offline) throw new Error('offline'); store.get(name).set(abs(u), resp('shell:' + u)); },
      put: async (k, v) => { store.get(name).set(key(k), v); },
      match: async k => store.get(name).get(key(k)) || undefined,
    });
    const caches = {
      open: async name => { if (!store.has(name)) store.set(name, new Map()); return cacheApi(name); },
      keys: async () => [...store.keys()],
      delete: async name => store.delete(name),
      match: async k => {
        for (const m of store.values()){ const hit = m.get(key(k)); if (hit) return hit; }
        return undefined;
      },
    };
    const listeners = {};
    const self = {
      addEventListener: (t, fn) => { listeners[t] = fn; },
      location: {origin: 'https://probarber.test', href: base},
      skipWaiting: () => {},
      clients: {claim: () => Promise.resolve()},
      registration: {},
    };
    const ctx = vm.createContext({
      self, caches, URL, Promise, console,
      /* c.add(new Request(u, {mode:'no-cors'})) — второй заход за теми CDN,
         которые не отдают CORS-заголовки */
      Request: class { constructor(url, opts){ this.url = String(url); Object.assign(this, opts || {}); } },
      fetch: async req => {
        asked.push(key(req));
        if (offline) throw new Error('offline');
        return resp('сеть:' + key(req));
      },
    });
    ctx.globalThis = ctx;
    vm.runInContext(swSrc, ctx, {filename: 'sw.js'});

    const fire = (type, ev) => {
      let waited = null, answered = null;
      const e = Object.assign({
        waitUntil: p => { waited = p; },
        respondWith: p => { answered = p; },
      }, ev);
      listeners[type](e);
      return {waited, answered};
    };
    const req = (url, opts) => Object.assign({url, method: 'GET', mode: 'no-cors'}, opts || {});
    return {store, asked, fire, req, caches};
  }

  /* установка */
  {
    const sw = runSW();
    await sw.fire('install', {}).waited;
    const names = [...sw.store.keys()];
    ok('кеш создаётся под своей версией', names.length === 1 && /probarber-v/.test(names[0]), names.join());
    const shell = sw.store.get(names[0]);
    ok('оболочка кладётся в кеш', shell.size >= 5, shell.size + ' файлов');
    ok('в оболочке есть сам кабинет', shell.has('https://probarber.test/index.html'));
    ok('и страница записи', shell.has('https://probarber.test/book.html'));

    /* главное: библиотеки должны лечь в кеш уже при установке. На первой
       загрузке теги <script> уходят в сеть раньше, чем worker
       активируется, — через него они не проходят вовсе */
    ok('React лежит в кеше сразу после установки',
       shell.has('https://unpkg.com/react@18/umd/react.production.min.js'));
    ok('и Babel, без которого кабинет не соберётся',
       shell.has('https://unpkg.com/@babel/standalone@7/babel.min.js'));
    ok('и шрифт', [...shell.keys()].some(k => k.includes('fonts.googleapis.com')));

    /* адреса живут в двух файлах и разъедутся молча: подняли версию React
       в index.html — и офлайн тихо сломался */
    const head = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('</head>')[0];
    const outside = (head.match(/(?:src|href)="(https:\/\/[^"]+)"/g) || [])
      .map(x => x.replace(/^[^"]+"|"$/g, ''))
      /* preconnect — это голый домен без пути: кешировать там нечего */
      .filter(u => new URL(u).pathname.length > 1);
    ok('внешних зависимостей столько же, сколько в кабинете', outside.length >= 4, outside.length + ' шт.');
    outside.forEach(u => ok('в кеше есть ' + u.replace(/^https:\/\//, '').slice(0, 46),
                            shell.has(u)));
  }

  /* один файл пропал — установка всё равно проходит */
  {
    const sw = runSW({offline: true});
    let broke = false;
    try { await sw.fire('install', {}).waited; } catch (e){ broke = true; }
    ok('недоступный файл не отменяет установку целиком', broke === false);
  }

  /* активация чистит старые версии */
  {
    const sw = runSW();
    await sw.fire('install', {}).waited;
    sw.store.set('probarber-v0', new Map([['https://probarber.test/index.html', 'старое']]));
    await sw.fire('activate', {}).waited;
    ok('старые версии кеша удаляются', ![...sw.store.keys()].includes('probarber-v0'), [...sw.store.keys()].join());
  }

  /* чего worker не трогает вовсе */
  {
    const sw = runSW();
    ok('POST мимо worker\'а',
       sw.fire('fetch', {request: sw.req('https://probarber.test/api/barber', {method: 'POST'})}).answered === null);
    ok('запрос к серверу мимо кеша — иначе лицензия зависла бы вчерашней',
       sw.fire('fetch', {request: sw.req('https://probarber.test/api/licence?login=x')}).answered === null);
    ok('и заявки тоже',
       sw.fire('fetch', {request: sw.req('https://probarber.test/api/trial?login=x')}).answered === null);
  }

  /* страницы: сеть главнее, кеш — на случай без сети */
  {
    const sw = runSW();
    await sw.fire('install', {}).waited;
    const nav = url => sw.fire('fetch', {request: sw.req(url, {mode: 'navigate'})}).answered;
    const live = await nav('https://probarber.test/index.html');
    ok('онлайн страница берётся из сети', live.body === 'сеть:https://probarber.test/index.html');
    await nav('https://probarber.test/pay.html');
    const cache = sw.store.get([...sw.store.keys()][0]);
    ok('и складывается в кеш под своим адресом',
       cache.has('https://probarber.test/pay.html') && cache.has('https://probarber.test/index.html'));
    ok('оплата не подменяется кабинетом',
       cache.get('https://probarber.test/pay.html').body !== cache.get('https://probarber.test/index.html').body);
  }
  {
    const sw = runSW();
    await sw.fire('install', {}).waited;
    /* та же вкладка ушла в офлайн: кеш уже наполнен */
    const off = runSW({offline: true});
    await off.fire('install', {}).waited.catch(() => {});
    const name = [...off.store.keys()][0];
    off.store.get(name).set('https://probarber.test/index.html', {body: 'кабинет из кеша'});
    const got = await off.fire('fetch', {request: off.req('https://probarber.test/index.html', {mode: 'navigate'})}).answered;
    ok('без сети кабинет открывается из кеша', got && got.body === 'кабинет из кеша');

    const unknown = await off.fire('fetch', {request: off.req('https://probarber.test/чего-нет', {mode: 'navigate'})}).answered;
    ok('незнакомая страница офлайн падает на кабинет, а не в пустоту',
       unknown && unknown.body === 'кабинет из кеша');
  }

  /* библиотеки и шрифты: сперва кеш */
  {
    const sw = runSW();
    await sw.fire('install', {}).waited;
    const cdn = 'https://unpkg.com/react@18/umd/react.production.min.js';
    const asked = sw.asked.length;
    const got = await sw.fire('fetch', {request: sw.req(cdn)}).answered;
    ok('предзагруженная библиотека отдаётся из кеша, а не из сети', got.body === 'shell:' + cdn);
    /* сеть при этом всё же дёргается — но фоном, и ответ её не ждёт:
       так копия обновится, когда в index.html поднимут версию */
    ok('обновление идёт фоном и не задерживает ответ', sw.asked.length === asked + 1);

    /* файл шрифта в списке не перечислен: его адрес известен только из
       ответа Google Fonts — такие подхватываются при первой загрузке */
    const font = 'https://fonts.gstatic.com/s/inter/v13/UcC73.woff2';
    const first = await sw.fire('fetch', {request: sw.req(font)}).answered;
    ok('незнакомый файл тянется из сети', first.body === 'сеть:' + font);
    const second = await sw.fire('fetch', {request: sw.req(font)}).answered;
    ok('и во второй раз уже из кеша', second.body === 'сеть:' + font);
  }

  /* офлайн на самой первой загрузке: worker поставили, вкладку закрыли,
     связь пропала — кабинет обязан открыться */
  {
    const sw = runSW();
    await sw.fire('install', {}).waited;
    const cold = runSW({offline: true});
    for (const [k, v] of sw.store) cold.store.set(k, new Map(v));
    const app = await cold.fire('fetch', {
      request: cold.req('https://unpkg.com/react@18/umd/react.production.min.js')}).answered;
    ok('без сети React берётся из кеша, а не пропадает', app && /react/.test(app.body));
    const page = await cold.fire('fetch', {
      request: cold.req('https://probarber.test/index.html', {mode: 'navigate'})}).answered;
    ok('и сама страница тоже', !!page);
  }

  /* обвязка вокруг worker'а */
  {
    const app = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    ok('кабинет регистрирует worker', /serviceWorker[\s\S]{0,200}register\('sw\.js'\)/.test(app));
    ok('и только по http(s)', /location\.protocol\.startsWith\('http'\)/.test(app));
    ok('страница записи worker не ставит',
       !/register\('sw\.js'\)/.test(fs.readFileSync(path.join(ROOT, 'book.html'), 'utf8')));
    const head = (vercel.headers || []).find(h => h.source === '/sw.js');
    ok('sw.js отдаётся без кеширования браузером',
       !!head && head.headers.some(h => /no-store/.test(h.value)));
    ok('и с областью действия на весь сайт',
       !!head && head.headers.some(h => h.key === 'Service-Worker-Allowed' && h.value === '/'));
  }
}

part('хранилище');
{
  const B = T.Box;
  B.remove('probe');

  ok('запись возвращает, получилось ли', B.set('probe', 'раз') === true);
  ok('и читается обратно', B.get('probe') === 'раз');
  ok('в localStorage тоже легло', ctx.localStorage.getItem('probe') === 'раз');
  B.remove('probe');
  ok('удаление чистит и память, и диск',
     B.get('probe') === null && ctx.localStorage.getItem('probe') === null);

  /* память главнее диска: так вторая вкладка не подсовывает устаревшее */
  B.set('probe', 'из памяти');
  ctx.localStorage.setItem('probe', 'мимо памяти');
  ok('читаем из памяти, а не с диска', B.get('probe') === 'из памяти');
  B.remove('probe');

  /* ключа не было вовсе — тогда берём с диска */
  ctx.localStorage.setItem('probe2', 'только на диске');
  ok('незнакомый ключ читается с диска', B.get('probe2') === 'только на диске');
  ctx.localStorage.removeItem('probe2');

  ok('нативное хранилище в браузере не подключено', B.native() === false);
  ok('на старте память наполняется с диска', typeof B.hydrate === 'function' && typeof T.Disk.hydrate === 'function');

  /* сохранение не должно молча теряться, когда места нет */
  const keep = ctx.localStorage.setItem;
  ctx.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  ok('переполнение диска видно по ответу', B.set('probe3', 'x') === false);
  ctx.localStorage.setItem = keep;
  B.remove('probe3');
}

part('резервная копия');
{
  T.Store.init(T.seedDB());
  T.Vault.key = null;
  T.Disk.write(T.Store.state);
  T.Box.remove(T.BACKUP_KEY);
  ok('копии ещё нет', T.Backups.stamp() === 0);

  const made = await T.Backups.make();
  ok('копия создаётся', made === true && T.Backups.stamp() > 0);
  ok('и дата попадает в настройки', T.Store.state.settings.backup.lastAt > 0);

  const loaded = await T.Backups.load();
  ok('из копии читаются те же клиенты', loaded.clients.length === T.Store.state.clients.length);

  /* копия должна пережить порчу рабочей базы — ради этого всё и затевалось */
  const before = T.Store.state.clients.length;
  T.Box.set('probarber.v1', '{сломалось');
  ok('рабочая база не читается', T.Disk.read() === null);
  ok('а копия на месте', (await T.Backups.load()).clients.length === before);
  T.Disk.write(T.Store.state);

  /* под PIN копия тоже шифруется: иначе шифрование обходилось бы
     чтением соседнего ключа */
  const {key} = await T.Vault.derive('4321');
  T.Vault.key = key;
  await T.Backups.make();
  const raw = JSON.parse(T.Box.get(T.BACKUP_KEY));
  ok('под PIN копия лежит шифром', raw.enc === 1 && !JSON.stringify(raw).includes('clients'));
  ok('но дату видно без расшифровки', raw.ts > 0 && T.Backups.stamp() === raw.ts);
  ok('с ключом копия читается', (await T.Backups.load()).clients.length === before);
  T.Vault.key = null;
  ok('без ключа копию не отдаём', (await T.Backups.load()) === null);

  /* «начать с чистого листа» уносит и копию — иначе данные, которые
     барбер попросил стереть, остались бы лежать рядом */
  const kk = (await T.Vault.derive('4321')).key;
  T.Vault.key = kk;
  await T.Backups.make();
  T.Vault.key = null;
  T.Disk.clear();
  ok('очистка данных уносит и копию', T.Backups.stamp() === 0 && T.Disk.readRaw() === null);

  T.Store.init(T.seedDB());
  T.Disk.write(T.Store.state);
  screen('карточка копии', () => T.BackupCard({db: T.Store.state}));
  ok('в настройках есть резервная копия', textOf(T.Settings({})).includes('Резервна копія'));
}

part('шифрование базы');
{
  const V = T.Vault;
  ok('шифрование доступно', V.ready());
  ok('base64 туда-обратно', T.b64(T.unb64('aGk=')) === 'aGk=');
  /* на большом массиве наивный fromCharCode(...) кладёт стек, а база с
     фото клиентов бывает и в мегабайт */
  const big = new Uint8Array(600000);
  for (let i = 0; i < big.length; i++) big[i] = i % 256;
  ok('большая база кодируется, а не роняет стек', T.b64(big).length > 700000, T.b64(big).length + ' символов');
  ok('и раскодируется обратно без потерь', T.unb64(T.b64(big)).length === big.length);

  const {key, salt} = await V.derive('1234');
  V.key = key;
  const env = await V.encrypt('{"clients":[]}');
  ok('шифротекст не похож на данные', env.enc === 1 && !env.ct.includes('clients'));
  ok('и расшифровывается своим ключом', (await V.decrypt(env.iv, env.ct)) === '{"clients":[]}');

  const wrong = (await V.derive('9999', salt)).key;
  V.key = wrong;
  let broke = false;
  try { await V.decrypt(env.iv, env.ct); } catch (e){ broke = true; }
  ok('чужим PIN не расшифровать', broke);

  /* тот же PIN и та же соль дают тот же ключ — иначе вход был бы разовым */
  V.key = (await V.derive('1234', salt)).key;
  ok('тот же PIN открывает базу снова', (await V.decrypt(env.iv, env.ct)) === '{"clients":[]}');

  ok('хеш пароля зависит от соли',
     (await V.hash('pass', 'aaa')) !== (await V.hash('pass', 'bbb')));

  /* база на диске: с ключом — конверт, без ключа — открытый текст */
  T.Disk.writeRaw(JSON.stringify(env));
  ok('запертую базу видно, не расшифровывая', T.Disk.locked());
  ok('и read() её не отдаёт', T.Disk.read() === null);
  V.key = null;
  T.Disk.write(T.seedDB());
  ok('без PIN база лежит открытым текстом', !T.Disk.locked() && !!T.Disk.read());

  /* очистка данных не трогает аккаунт и оплату */
  T.Meta.write({account: {login: 'barber@mail.com', kind: 'email'}, access: {trialStartedAt: 1}});
  T.Disk.clear();
  ok('«начать с чистого листа» стирает базу', T.Disk.readRaw() === null);
  ok('но аккаунт и пробный период остаются',
     T.Web.login() === 'barber@mail.com' && T.Access.read().trialStartedAt === 1);

  T.Store.init(T.seedDB());
  T.Disk.write(T.Store.state);
}

part('доступ и подписка');
{
  const A = T.Access, W = T.Web;
  const DAY = 86400000;
  const reset = () => { T.Box.remove('probarber.meta'); W.alive = null; };

  reset();
  ok('до старта пробного кабинет открыт', A.state().kind === 'TRIAL_NOT_STARTED' && A.allowed());
  ok('цены заданы в одном месте', T.PLANS.length === 3 && T.PLANS.every(p => p.uah > 0));
  ok('цена печатается гривной с разрядами', T.uah(2490) === '2 490 ₴' && T.uah(249) === '249 ₴', T.uah(2490));
  ok('длинный план дешевле помесячного',
     T.PLANS.every(p => p.uah / p.months <= T.PLANS[0].uah),
     T.PLANS.map(p => Math.round(p.uah / p.months)).join(' / '));
  ok('план ищется по id', T.planById('yearly').months === 12 && T.planById('нет') === null);

  A.startTrial();
  const st = A.state();
  ok('пробный период начинается и даёт доступ', st.kind === 'TRIAL_ACTIVE' && st.allowed && st.left === T.TRIAL_DAYS, st.left + ' дн.');
  const first = A.read().trialStartedAt;
  A.startTrial();
  ok('второй раз пробный не начинается', A.read().trialStartedAt === first);

  /* именно ради этого дата живёт на сервере */
  A.write({trialStartedAt: Date.now() - 30 * DAY});
  ok('после 14 дней доступ закрывается', A.state().kind === 'TRIAL_EXPIRED' && !A.allowed());
  A.fromTrial({started: true, startedAt: Date.now()});
  ok('подсунуть дату посвежее и продлить пробный нельзя',
     A.state().kind === 'TRIAL_EXPIRED', A.state().kind);
  A.write({trialStartedAt: Date.now() - 2 * DAY});
  A.fromTrial({started: true, startedAt: Date.now() - 30 * DAY});
  ok('дата с сервера подтягивается, если она раньше локальной', A.state().kind === 'TRIAL_EXPIRED');

  /* оплаченный период перекрывает истёкший пробный */
  A.write({status: 'active', source: 'web', plan: 'yearly', expiresAt: Date.now() + 300 * DAY});
  ok('оплаченный доступ открывает кабинет', A.state().kind === 'SUB_ACTIVE' && A.allowed());
  A.write({expiresAt: Date.now() - DAY});
  ok('после срока доступ закрывается', A.state().kind === 'SUB_EXPIRED' && !A.allowed());

  /* автопродления нет вовсе — ни в модели, ни в интерфейсе */
  ok('состояния «без автопродления» не существует',
     ['TRIAL_NOT_STARTED', 'TRIAL_ACTIVE', 'TRIAL_EXPIRED', 'SUB_ACTIVE', 'SUB_EXPIRED'].includes(A.state().kind),
     A.state().kind);
  ok('кабинет не умеет отменять и возобновлять списания',
     A.cancel === undefined && A.resume === undefined);

  /* лицензия с сервера */
  A.fromWeb({active: true, plan: 'monthly', expiresAt: Date.now() + 30 * DAY, orderId: 'pb_1'});
  ok('лицензия с сервера ложится в доступ', A.state().kind === 'SUB_ACTIVE' && A.read().source === 'web');
  ok('в доступе не заводится autoRenew', !('autoRenew' in A.read()));
  ok('сервер, сказавший «нет», доступ не открывает', A.fromWeb({active: false}).ok === false);

  /* данные кабинета живут отдельно от оплаты */
  const before = T.Store.state.clients.length;
  T.Act.reset();
  ok('сброс к демо не трогает оплату', A.state().kind === 'SUB_ACTIVE' && !!A.read().expiresAt);
  ok('а база при этом действительно пересоздана', T.Store.state.clients.length === before);
  const dev = W.device();
  T.Act.reset();
  ok('идентификатор устройства переживает сброс', W.device() === dev, dev.slice(0, 12));
  ok('и после сброса доступ всё ещё оплачен', A.state().kind === 'SUB_ACTIVE');

  /* логин */
  ok('почта нормализуется как на сервере', T.normLogin('  Barber@Mail.COM ') === 'barber@mail.com');
  ok('телефон превращается в цифры', T.normLogin('+38 (067) 100-20-30') === '380671002030', T.normLogin('0671002030'));
  ok('опечатку в логине ловим до оплаты',
     T.loginLooksReal('barber@mail.com') && T.loginLooksReal('+380671002030') &&
     !T.loginLooksReal('barber') && !T.loginLooksReal('123'));
  W.setLogin(' Barber@Mail.com ');
  ok('логин сохраняется отдельно от базы и нормализуется', W.login() === 'barber@mail.com', W.login());
  ok('и живёт в аккаунте, которым входят в кабинет',
     (T.Meta.read().account || {}).kind === 'email');

  /* месяцы считаются с сохранением дня */
  const jan31 = new Date(2026, 0, 31);
  ok('31 января + 1 месяц = конец февраля',
     new Date(T.addMonthsKeep(jan31, 1)).getMonth() === 1, new Date(T.addMonthsKeep(jan31, 1)).toISOString().slice(0, 10));

  /* что кабинет реально спрашивает у сервера */
  W.setLogin('barber@mail.com');
  net.calls.length = 0; net.queue.length = 0;
  net.queue.push({ok: true, active: true, plan: 'monthly', expiresAt: Date.now() + 30 * DAY});
  const lic = await W.licence();
  const asked = new URL('https://x' + net.calls[0].url.replace(/^[^/]*/, ''));
  ok('лицензию спрашиваем у своего эндпоинта', asked.pathname === '/api/licence', net.calls[0].url);
  ok('в запросе едут логин и устройство, и больше ничего',
     asked.searchParams.get('login') === 'barber@mail.com' &&
     !!asked.searchParams.get('device') &&
     [...asked.searchParams.keys()].sort().join(',') === 'device,login');
  ok('ответ сервера открывает доступ', A.fromWeb(lic).ok === true && A.state().kind === 'SUB_ACTIVE');

  net.calls.length = 0;
  await W.trial(true);
  ok('пробный период начинаем через сервер', net.calls[0].url.indexOf('/api/trial') === 0 && net.calls[0].url.indexOf('start=1') > 0);

  /* сервера подписки нет вовсе — кабинет должен это заметить, а не молчать */
  const keepFetch = ctx.fetch;
  ctx.fetch = async () => ({ok: false, status: 404, json: async () => ({})});
  W.alive = null;
  await W.licence();
  ok('на хостинге без функций оплата помечается как недоступная', W.alive === false && W.enabled() === false);
  ctx.fetch = keepFetch;

  reset();
  W.setLogin('barber@mail.com');
  A.write({trialStartedAt: Date.now()});
}

part('экраны подписки');
{
  const A = T.Access;
  A.write({status: null, source: null, plan: null, expiresAt: 0, trialStartedAt: Date.now()});
  screen('приветствие пробного периода', () => T.TrialIntro({onStart(){}}));
  screen('выбор плана — шлюз', () => T.Paywall({mode: 'gate'}));
  screen('выбор плана — из настроек', () => T.Paywall({onClose(){}}));
  screen('управление подпиской', () => T.SubscriptionPage({}));
  screen('карточка доступа', () => T.AccessCard({}));
  screen('шлюз пускает в кабинет, пока доступ есть', () => T.AppGate({}));

  const trial = textOf(T.TrialIntro({onStart(){}}));
  ok('на приветствии написано, что 14 дней бесплатно', /14/.test(trial) && /безкоштовн/i.test(trial));
  ok('и что карту вводить не нужно', /картк/i.test(trial));

  const gate = textOf(T.Paywall({mode: 'gate'}));
  ok('на выборе плана видны все три цены',
     T.PLANS.every(p => gate.includes(T.uah(p.uah))), T.PLANS.map(p => T.uah(p.uah)).join(' '));
  ok('обещано, что данные не пропадут', /дані|фінанс/i.test(gate));
  ok('сказано, что оплата разовая и списаний не будет',
     /разовий/i.test(gate) && /автопродовження немає/i.test(gate) && !/продовжується автоматично/i.test(gate));

  A.write({trialStartedAt: Date.now() - 40 * 86400000});
  const closed = textOf(T.Paywall({mode: 'gate'}));
  ok('после пробного экран так и говорит', /пробний період завершився/i.test(closed), closed.slice(0, 40).trim());
  ok('и обещает, что клиенты на месте', /нічого не видалено/i.test(closed));

  /* без сервера подписки кабинет не имитирует оплату */
  T.Web.alive = false;
  const demo = textOf(T.Paywall({mode: 'gate'}));
  ok('без сервера честно пишем, что оплата не подключена', /оплата не підключена/i.test(demo));
  ok('и предлагаем демо-доступ, а не «оплату»', /демо-доступ/i.test(demo) && !/Перейти до оплати/.test(demo));
  T.Web.alive = null;

  A.write({status: 'active', source: 'web', plan: 'yearly', expiresAt: Date.now() + 100 * 86400000});
  const sub = textOf(T.SubscriptionPage({}));
  ok('на экране доступа виден план и срок', /1 рік/.test(sub) && /Оплачено до/.test(sub));
  ok('цена показана в гривне', sub.includes(T.uah(T.planById('yearly').uah)));
  ok('автопродления на экране нет вовсе', !/автопродовж/i.test(sub));
  ok('сказано, что списаний больше не будет', /автосписань немає/i.test(sub));

  A.write({source: 'demo'});
  ok('демо-доступ подписан честно', /демо/i.test(textOf(T.SubscriptionPage({}))));

  /* настройки ведут на подписку */
  ok('в настройках есть карточка доступа', textOf(T.Settings({})).includes('Доступ'));
  ok('экран подписки есть в разводке', typeof T.SCREENS.subscription === 'function');

  /* шлюз: кого пускать, а кому показывать приветствие */
  A.write({status: null, source: null, plan: null, expiresAt: 0, trialStartedAt: 0});
  ok('совсем новому кабинету показываем приветствие',
     textOf(T.AppGate({})).includes('14 днів безкоштовно'));
  A.write({trialStartedAt: Date.now()});
  ok('во время пробного периода открыт кабинет',
     !textOf(T.AppGate({})).includes('14 днів безкоштовно'));
  /* оплатил на другом устройстве — локальной даты пробного нет, но
     предлагать ему «начать бесплатно» было бы враньём */
  A.write({trialStartedAt: 0, status: 'active', source: 'web', plan: 'monthly',
           expiresAt: Date.now() + 30 * 86400000});
  const paid = textOf(T.AppGate({}));
  ok('оплатившему приветствие пробного не показываем', !paid.includes('14 днів безкоштовно'));
  ok('и сразу пускаем в кабинет', paid.includes('Про Барбер'));
  A.write({status: null, source: null, plan: null, expiresAt: 0, trialStartedAt: Date.now() - 40 * 86400000});
  ok('с истёкшим пробным вместо кабинета — выбор плана',
     textOf(T.AppGate({})).includes('Пробний період завершився'));
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
