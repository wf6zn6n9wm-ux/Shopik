/* Перевірка Urok+ без браузера.
   node urok/tests/smoke.js

   Кожен екран реально викликається з реальним станом — у трьох мовах,
   на порожніх і на заповнених даних. Ловить забуті змінні, биті
   екрани, неперекладені рядки й помилки в грошах. */
const {boot, render} = require('./harness');

const {U, files} = boot();
const {
  A, sel, store, makeT, LANGS, DICT, loadDemo, unloadDemo, hasDemo,
  todayISO, addDays, toMin, toTime, duration, expandSeries, fmtMoney, fmtDur, fmtLongDate,
  normalizeLesson, uid, Billing, FREE_STUDENT_LIMIT, applyTheme,
  MARKET_ITEMS, TAB_SCREENS, SCREENS, App, AuthFlow, Onboarding, BottomNav,
} = U;

let fails = 0, checks = 0;
const fail = m => { console.error('  ✗ ' + m); fails++; };
const ok = m => { checks++; if (m) console.log('  ✓ ' + m); };
const eq = (got, want, what) => { if (got !== want) fail(`${what}: «${got}» замість «${want}»`); else ok(); };
const yes = (cond, what) => { if (!cond) fail(what); else ok(); };

const nav = {push(){}, back(){}, replace(){}, reset(){}, go(){}};

/* Ключі локалізації, що просочилися в інтерфейс: якщо в тексті
   екрана трапився рядок, який є ключем словника, значить десь
   написали t('…') неправильно або забули викликати t зовсім. */
const KEYS = new Set(Object.keys(DICT.uk));
function checkTexts(out, where){
  out.texts.forEach(x => {
    if (KEYS.has(x)) fail(`${where}: у тексті ключ «${x}» замість перекладу`);
    if (/undefined|NaN|\[object Object\]/.test(x)) fail(`${where}: у тексті «${x}»`);
  });
}
function draw(Comp, props, where){
  try {
    const out = render(U.React ? null : Comp(props));
    return out;
  } catch (e){
    fail(`${where}: ${e.message}`);
    return {texts: [], types: [], count: 0};
  }
}
function screen(Comp, props, where){
  let out;
  try {
    out = render({__el: true, type: Comp, props});
  } catch (e){
    fail(`${where}: ${e && e.message}`);
    return null;
  }
  if (!out.count) fail(`${where}: порожній екран`);
  checkTexts(out, where);
  return out;
}

/* ── 1. підключення джерел ─────────────────────────────────── */
console.log('джерела');
ok(`${files.length} модулів: ${files.join(', ')}`);

/* ── 2. дати й гроші ───────────────────────────────────────── */
console.log('\nдати й гроші');
eq(U.dow('2025-08-14'), 3, 'четвер має бути 3');
eq(U.startOfWeek('2025-08-14'), '2025-08-11', 'початок тижня — понеділок');
eq(U.weekDays('2025-08-14').length, 7, 'у тижні днів');
eq(U.addDays('2025-12-31', 1), '2026-01-01', 'перехід через рік');
eq(U.addMonths('2025-01-31', 1), '2025-02-01', 'місяць уперед від 31-го');
eq(U.monthGrid('2025-08-14').length % 7, 0, 'сітка місяця кратна тижню');
eq(toTime(toMin('09:30') + 90), '11:00', 'час плюс 90 хвилин');
eq(duration('10:00', '11:30'), 90, 'тривалість');
eq(fmtMoney(2500, 'UAH'), '2\u00A0500\u00A0₴', 'гроші з групуванням');
eq(fmtMoney(-300, 'USD'), '\u2212300\u00A0$', 'відʼємна сума');
eq(fmtMoney(0, 'EUR'), '0\u00A0€', 'нуль');
const tuk = makeT('uk');
eq(fmtLongDate(tuk, '2025-08-14'), '14 серпня, четвер', 'довга дата українською');
eq(fmtDur(tuk, 90), '1 год 30 хв', 'тривалість словами');
eq(U.fmtShortDate(tuk, '2025-08-14'), '14.08.2025', 'коротка дата');
eq(U.initials('Іван Петренко'), 'ІП', 'ініціали');
eq(U.initials(''), '?', 'ініціали без імені');
yes(U.isPhoneValid('+380631234567'), 'валідний номер');
yes(!U.isPhoneValid('+38063'), 'закороткий номер');

/* ── 3. дані й вибірки ─────────────────────────────────────── */
console.log('\nдані');
store.reset();
A.setAuth({status: 'authed', phone: '+380631112233', provider: 'phone', createdAt: todayISO()});
A.setProfile({name: 'Тест Викладач'});
store.set(s => ({...s, onboarded: true}));

const st1 = A.addStudent({name: 'Іван Петренко', subject: 'Англійська мова', price: 400});
const st2 = A.addStudent({name: 'Марія Коваль', subject: 'Англійська мова', price: 500});
yes(store.get().students.length === 2, 'двох учнів додано');

const l1 = A.addLesson({studentIds: [st1.id], date: todayISO(), start: '10:00', end: '11:00', price: 400, status: 'done'});
const l2 = A.addLesson({studentIds: [st1.id, st2.id], date: todayISO(), start: '12:00', end: '13:00', price: 300});
eq(sel.lessonsOn(store.get(), todayISO()).length, 2, 'занять сьогодні');
eq(sel.incomeOn(store.get(), todayISO()), 400, 'дохід рахує лише проведені');
eq(sel.plannedOn(store.get(), todayISO()), 400 + 300 * 2, 'заплановане множиться на учнів');

/* конфлікт часу */
eq(sel.conflicts(store.get(), {date: todayISO(), start: '10:30', end: '11:30'}).length, 1, 'перетин занять');
eq(sel.conflicts(store.get(), {date: todayISO(), start: '11:00', end: '12:00'}).length, 0, 'стик не є перетином');

/* оплата */
A.togglePaid(l1.id, true);
eq(store.get().payments.length, 1, 'оплата створилась');
eq(sel.studentStats(store.get(), st1.id).income, 400, 'дохід учня');
eq(sel.studentStats(store.get(), st1.id).debt, 0, 'боргу немає після оплати');
A.togglePaid(l1.id, false);
eq(store.get().payments.length, 0, 'скасування оплати прибирає платіж');
eq(sel.studentStats(store.get(), st1.id).debt, 400, 'борг після скасування');

/* групове заняття: обидва учні бачать його */
eq(sel.lessonsOfStudent(store.get(), st2.id).length, 1, 'групове заняття видно другому учню');

/* видалення учня не ламає групове заняття */
const before = store.get().lessons.length;
A.removeStudent(st2.id);
eq(store.get().lessons.length, before, 'групове заняття лишилось');
eq(store.get().lessons.find(l => l.id === l2.id).studentIds.length, 1, 'учня прибрано зі списку');

/* серія */
const rule = {id: 'sr_test', freq: 'weekly', days: [0, 3], start: '18:00', end: '19:00', price: 350,
              studentIds: [st1.id], subject: 'Англійська мова', from: todayISO(), until: addDays(todayISO(), 27)};
const series = expandSeries(rule, {weeks: 12});
yes(series.length >= 6 && series.length <= 10, `серія на 4 тижні дала ${series.length} занять`);
yes(series.every(x => x.date >= rule.from && x.date <= rule.until), 'усі заняття серії в межах дат');
yes(series.every(x => [0, 3].includes(U.dow(x.date))), 'серія лише в обрані дні тижня');
const endless = expandSeries({...rule, until: ''}, {weeks: 4});
yes(endless.length >= 7, 'серія без кінцевої дати обмежена горизонтом');
A.addSeries(rule);
A.addLessons(series);
const withSeries = store.get().lessons.length;
A.removeSeries('sr_test');
yes(store.get().lessons.length < withSeries, 'видалення серії прибрало майбутні заняття');

/* ліміт безкоштовного плану */
store.set(s => ({...s, students: []}));
for (let i = 0; i < FREE_STUDENT_LIMIT; i++) A.addStudent({name: 'Учень ' + i});
yes(!sel.canAddStudent(store.get()), 'ліміт безкоштовного плану спрацював');
A.setPremium('yearly', addDays(todayISO(), 365));
yes(sel.canAddStudent(store.get()), 'преміум знімає ліміт');
yes(sel.isPremium(store.get()), 'преміум активний');
A.setPremium('yearly', addDays(todayISO(), -1));
yes(!sel.isPremium(store.get()), 'прострочений преміум не діє');

/* збереження між запусками */
store.set(s => ({...s, premium: {plan: null, until: '', trialUsed: false}}));
const restored = U.load();
eq(restored.students.length, store.get().students.length, 'стан читається з localStorage');
eq(restored.settings.lang, store.get().settings.lang, 'налаштування переживають перезапуск');

/* злиття зі старим станом: нові поля не зникають */
const merged = U.merge(U.blankState(), {settings: {lang: 'en'}, students: []});
eq(merged.settings.currency, 'UAH', 'нові поля доливаються у збережений стан');
eq(merged.settings.lang, 'en', 'збережене значення не затирається');

/* ── 4. екрани ─────────────────────────────────────────────── */
console.log('\nекрани');
store.reset();
A.setAuth({status: 'authed', phone: '+380631112233', provider: 'phone', createdAt: todayISO()});
A.setProfile({name: 'Олена Кравець'});
store.set(s => ({...s, onboarded: true}));

const langs = LANGS.map(l => l.id);
const stackRoutes = t => {
  const s = store.get();
  const lesson = s.lessons[0] || {id: 'none'};
  const student = s.students[0] || {id: 'none'};
  const item = MARKET_ITEMS[0];
  return [
    ['lesson', {id: lesson.id}],
    ['lesson-new', {date: todayISO()}],
    ['lesson-new', {studentId: student.id}],
    ['lesson-edit', {id: lesson.id}],
    ['student', {id: student.id}],
    ['student-new', {}],
    ['student-edit', {id: student.id}],
    ['market-item', {id: item.id}],
    ['settings', {}],
    ['profile-edit', {}],
    ['premium', {}],
    ['premium', {reason: 'students'}],
    ['contest', {}],
    ['rating', {}],
    ['coffee', {}],
    ['help', {}],
    ['privacy', {}],
    ['terms', {}],
    /* неіснуючі сутності: екран має показати «даних немає», а не впасти */
    ['lesson', {id: 'ghost'}],
    ['student', {id: 'ghost'}],
    ['market-item', {id: 'ghost'}],
  ];
};

langs.forEach(lang => {
  A.setSettings({lang});
  const t = makeT(lang);

  /* порожній застосунок */
  unloadDemo();
  store.set(s => ({...s, students: [], lessons: [], payments: [], library: []}));
  Object.keys(TAB_SCREENS).forEach(tab => {
    screen(TAB_SCREENS[tab], {t, s: store.get(), nav}, `${lang}/порожньо/${tab}`);
  });
  screen(SCREENS['lesson-new'], {t, s: store.get(), nav, params: {}}, `${lang}/порожньо/lesson-new`);
  screen(SCREENS['student-new'], {t, s: store.get(), nav, params: {}}, `${lang}/порожньо/student-new`);

  /* заповнений застосунок */
  loadDemo(t);
  yes(hasDemo(store.get()), `${lang}: демо-дані завантажились`);
  Object.keys(TAB_SCREENS).forEach(tab => {
    const out = screen(TAB_SCREENS[tab], {t, s: store.get(), nav}, `${lang}/дані/${tab}`);
    if (out && out.count < 10) fail(`${lang}/${tab}: підозріло малий екран (${out.count} вузлів)`);
  });
  stackRoutes(t).forEach(([name, params]) => {
    const Comp = SCREENS[name];
    if (!Comp) return fail(`немає екрана «${name}» у SCREENS`);
    screen(Comp, {t, s: store.get(), nav, params}, `${lang}/${name}`);
  });

  /* вхід і онбординг */
  screen(AuthFlow, {t, onDone(){}}, `${lang}/auth`);
  screen(Onboarding, {t, onDone(){}}, `${lang}/onboarding`);
  screen(BottomNav, {t, tab: 'calendar', onTab(){}}, `${lang}/nav`);
});
ok('усі екрани рендеряться в трьох мовах');

/* ── 4б. шторки й дрібні компоненти ────────────────────────────
   Хуки в пісочниці не змінюють стан, тому все, що ховається за
   useState, треба відкрити руками — інакше половина інтерфейсу
   лишається неперевіреною. */
console.log('\nшторки');
{
  const t = makeT('uk');
  A.setSettings({lang: 'uk'});
  loadDemo(t);
  const s = store.get();
  const student = s.students[0];
  const lesson = s.lessons[0];
  const noop = () => {};
  const cases = [
    ['Sheet', U.Sheet, {open: true, onClose: noop, title: t('d.date'), children: 'зміст'}],
    ['Confirm', U.Confirm, {open: true, text: t('st.deleteConfirm'), confirmLabel: t('a.delete'), cancelLabel: t('a.cancel'), onConfirm: noop, onClose: noop}],
    ['DatePickerSheet', U.DatePickerSheet, {open: true, value: todayISO(), t, onPick: noop, onClose: noop}],
    ['TimePickerSheet', U.TimePickerSheet, {open: true, value: '10:00', t, onPick: noop, onClose: noop}],
    ['PaymentSheet', U.PaymentSheet, {open: true, onClose: noop, t, s, student}],
    ['NotificationsSheet', U.NotificationsSheet, {open: true, onClose: noop, t, s}],
    ['StudentPicker', U.StudentPicker, {t, s, value: [student.id], onChange: noop}],
    ['WeekStrip', U.WeekStrip, {t, s, date: todayISO(), onPick: noop}],
    ['MonthGrid', U.MonthGrid, {t, s, date: todayISO(), onPick: noop}],
    ['LessonRow', U.LessonRow, {t, s, lesson, onClick: noop}],
    ['Stepper', U.Stepper, {value: 300, onChange: noop, format: v => String(v)}],
    ['Segmented', U.Segmented, {value: 'week', onChange: noop, options: [{id: 'week', label: t('d.week')}, {id: 'month', label: t('d.month')}]}],
    ['Empty', U.Empty, {icon: null, title: t('cal.noLessons'), text: t('cal.noLessonsD'), action: t('cal.addLesson'), onAction: noop}],
    ['Keypad', U.Keypad, {onKey: noop, onBack: noop}],
  ];
  cases.forEach(([name, Comp, props]) => {
    if (!Comp) return fail(`компонент ${name} не експортований`);
    screen(Comp, props, 'шторки/' + name);
  });
  /* сповіщення мають щось показати на демо-даних */
  yes(U.buildNotifications(s, t).length > 0, 'сповіщення будуються з реальних даних');
  ok('шторки й дрібні компоненти рендеряться');
}

/* ── 4в. розмітка не розходиться зі стилями ────────────────────
   Клас, якого немає в дизайн-системі, — це або друкарська помилка,
   або стиль, який забули додати. І те, й те видно лише в браузері,
   тому ловимо тут. */
console.log('\nстилі');
{
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = html.split('<style>')[1].split('</style>')[0];
  const defined = new Set((css.match(/\.([A-Za-z][\w-]*)/g) || []).map(x => x.slice(1)));
  const used = new Set();
  fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    (src.match(/className=(?:"[^"]*"|\{'[^']*')/g) || []).forEach(m => {
      m.replace(/className=\{?'?"?/, '').replace(/'$/, '').split(/\s+/).forEach(tok => {
        const clean = tok.replace(/["'{}]/g, '');
        if (clean && /^[a-z][\w-]*$/.test(clean)) used.add(clean);
      });
    });
  });
  const missing = [...used].filter(c => !defined.has(c));
  if (missing.length) fail(`класи без стилів: ${missing.join(', ')}`);
  else ok(`${used.size} класів розмітки описані в дизайн-системі`);

  /* сервіс-воркер кешує всі модулі — інакше офлайн зламається */
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  files.forEach(f => { if (!sw.includes(f)) fail(`sw.js не кешує src/${f}`); });
  ok('сервіс-воркер знає про всі модулі');
}

/* ── 5. головний компонент у трьох станах ──────────────────── */
console.log('\nкорінь');
store.reset();
screen(App, {}, 'App/гість');
A.setAuth({status: 'authed', phone: '+380631112233', provider: 'phone', createdAt: todayISO()});
screen(App, {}, 'App/онбординг');
store.set(s => ({...s, onboarded: true}));
screen(App, {}, 'App/застосунок');
ok('корінь проходить усі три стани');

/* ── 5б. навігація ─────────────────────────────────────────────
   Стек екранів і history браузера мають рухатись разом, але кожен
   лише на крок: якщо back() зніме екран і сам, і через popstate,
   користувач провалиться на два екрани назад.                    */
console.log('\nнавігація');
{
  let stack = [], tab = 'calendar';
  const setStack = fn => { stack = typeof fn === 'function' ? fn(stack) : fn; };
  const setTab = v => { tab = v; };
  /* маленька модель history: pushState кладе запис, back() знімає
     його й кличе popstate — рівно як браузер */
  const entries = [{}];
  const win = {history: {
    get state(){ return entries[entries.length - 1]; },
    pushState(st){ entries.push(st); },
    back(){ if (entries.length > 1){ entries.pop(); win.onPop(); } },
  }};
  win.onPop = () => setStack(st => st.slice(0, -1));
  const n = U.createNav(setStack, setTab, win);

  n.push({name: 'student', params: {id: 'a'}});
  n.push({name: 'lesson', params: {id: 'b'}});
  eq(stack.length, 2, 'два екрани в стеку');
  eq(entries.length, 3, 'два записи в history');

  n.back();
  eq(stack.length, 1, 'back знімає рівно один екран');
  eq(stack[0].name, 'student', 'лишився попередній екран');

  n.back();
  eq(stack.length, 0, 'повернулись у корінь');

  /* без нашого запису в history стек має зменшуватись напряму */
  n.push({name: 'settings'});
  entries.length = 1;
  n.back();
  eq(stack.length, 0, 'back працює й без запису в history');

  n.push({name: 'premium'});
  n.go('market');
  eq(stack.length, 0, 'перехід на вкладку очищає стек');
  eq(tab, 'market', 'вкладка перемкнулась');

  n.push({name: 'student', params: {id: 'a'}});
  n.replace({name: 'student', params: {id: 'b'}});
  eq(stack.length, 1, 'replace не додає екран');
  eq(stack[0].params.id, 'b', 'replace замінює верхній екран');
  ok('стек і history не розходяться');
}

/* ── 6. теми ───────────────────────────────────────────────── */
console.log('\nтеми');
eq(applyTheme('dark'), 'dark', 'темна тема');
eq(applyTheme('light'), 'light', 'світла тема');
eq(applyTheme('system'), 'light', 'системна тема без темної системи');

/* ── 7. підписка ───────────────────────────────────────────── */
console.log('\nпідписка');
store.reset();
Billing.trial().then(r => {
  yes(r.ok, 'пробний період вмикається');
  yes(sel.isPremium(store.get()), 'після пробного періоду преміум активний');
  return Billing.trial();
}).then(r2 => {
  yes(!r2.ok, 'другий пробний період не дається');
  return Billing.purchase('yearly');
}).then(r3 => {
  yes(r3.ok && store.get().premium.plan === 'yearly', 'річна підписка оформлюється');
  return Billing.restore();
}).then(r4 => {
  yes(r4.ok, 'відновлення покупок');
  console.log(fails ? `\n${fails} помилок (перевірок: ${checks})` : `\nусе гаразд · перевірок: ${checks}`);
  process.exit(fails ? 1 : 0);
}).catch(e => {
  fail('підписка: ' + e.message);
  process.exit(1);
});
