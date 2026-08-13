/* ══════════════════════════════════════════════════════════════════
   UROK+ · ЯДРО
   ------------------------------------------------------------------
   Дані, стан, дати, гроші, ліміти й міст до покупок.

   МОДЕЛЬ ДАНИХ (усе плоске, зв'язки — по id; так само ляже в SQL,
   коли з'явиться сервер):

     profile   {name, emoji, color, phone, email, createdAt}
     student   {id, name, subject, color, emoji, phone, email,
                birthday, notes, price, archived, createdAt}
     lesson    {id, studentIds[], subject, date, start, end, price,
                status, paid, note, seriesId, createdAt}
     series    {id, freq, days[], start, end, price, subject,
                studentIds[], until, createdAt}
     payment   {id, studentId, amount, date, method, lessonId}
     purchase  {id (market item), date, price}

   Стан живе в одному об'єкті, пишеться в localStorage цілком
   (дані одного викладача — це кілограми тексту, не мегабайти) і
   роздається через підписку. Жодного контексту з reducer'ом: ціна
   зайвої абстракції тут вища за користь.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const KEY = 'urok.v1';
const VERSION = '1.0.0';
const FREE_STUDENT_LIMIT = 5;
const SERIES_HORIZON_WEEKS = 12;

const CURRENCIES = [
  {id: 'UAH', symbol: '₴', name: 'Українська гривня'},
  {id: 'USD', symbol: '$', name: 'US dollar'},
  {id: 'EUR', symbol: '€', name: 'Euro'},
  {id: 'PLN', symbol: 'zł', name: 'Polski złoty'},
  {id: 'GBP', symbol: '£', name: 'Pound sterling'},
  {id: 'KZT', symbol: '₸', name: 'Teňge'},
];

const TIMEZONES = [
  'Europe/Kyiv', 'Europe/Warsaw', 'Europe/Berlin', 'Europe/London',
  'Europe/Lisbon', 'Europe/Chisinau', 'Asia/Tbilisi', 'Asia/Almaty',
  'America/New_York', 'America/Los_Angeles',
];

/* Палітра для аватарів і крапок статусу. Кольори не несуть змісту,
   лише розрізняють людей — тому насичені, але не кричущі. */
const AVATAR_COLORS = ['#22C55E', '#3B82F6', '#A855F7', '#F5A524', '#EF4444', '#14B8A6', '#EC4899', '#6366F1'];

const PAYMENT_METHODS = ['cash', 'card', 'transfer'];

/* ── дати ──────────────────────────────────────────────────────
   Скрізь ISO-рядок 'YYYY-MM-DD' і час 'HH:MM'. Date беремо лише
   для арифметики: рядок як ключ не має часових поясів і не з'їде
   на добу при серіалізації.                                     */
const pad2 = n => (n < 10 ? '0' + n : String(n));
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = s => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const todayISO = () => iso(new Date());
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => { const d = parseISO(s); d.setDate(1); d.setMonth(d.getMonth() + n); return iso(d); };
/* 0 = понеділок: тиждень у нас починається з Пн, як у розкладі */
const dow = s => (parseISO(s).getDay() + 6) % 7;
const startOfWeek = s => addDays(s, -dow(s));
const weekDays = s => { const a = startOfWeek(s); return Array.from({length: 7}, (_, i) => addDays(a, i)); };
const startOfMonth = s => s.slice(0, 8) + '01';
const daysInMonth = s => { const d = parseISO(s); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const monthGrid = s => {
  /* сітка місяця, доповнена сусідніми днями до цілих тижнів */
  const first = startOfMonth(s);
  const lead = dow(first);
  const total = Math.ceil((lead + daysInMonth(s)) / 7) * 7;
  return Array.from({length: total}, (_, i) => addDays(first, i - lead));
};
const isSame = (a, b) => a === b;
const isPast = s => s < todayISO();
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

const toMin = t => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toTime = m => `${pad2(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad2(((m % 60) + 60) % 60)}`;
const duration = (a, b) => Math.max(0, toMin(b) - toMin(a));

/* ── формати ───────────────────────────────────────────────── */
function fmtDayMonth(t, s){
  const d = parseISO(s);
  return t.lang === 'en'
    ? `${d.getDate()} ${t.cal.monthGen[d.getMonth()]}`
    : `${d.getDate()} ${t.cal.monthGen[d.getMonth()]}`;
}
function fmtLongDate(t, s){
  /* «14 серпня, п’ятниця» — так само в ru; en ставить день тижня попереду */
  const d = parseISO(s);
  const dm = fmtDayMonth(t, s);
  const w = t.cal.dowLong[dow(s)];
  return t.lang === 'en' ? `${w.charAt(0).toUpperCase() + w.slice(1)}, ${dm}` : `${dm}, ${w}`;
}
function fmtShortDate(t, s){
  const d = parseISO(s);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function fmtRelDate(t, s){
  if (s === todayISO()) return t('d.today');
  if (s === addDays(todayISO(), 1)) return t('d.tomorrow');
  if (s === addDays(todayISO(), -1)) return t('d.yesterday');
  return fmtDayMonth(t, s);
}
function fmtDur(t, min){
  if (min < 60) return `${min} ${t('d.min')}`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ${t('d.hour')} ${m} ${t('d.min')}` : `${h} ${t('d.hour')}`;
}
function currencySymbol(id){
  const c = CURRENCIES.find(x => x.id === id);
  return c ? c.symbol : '₴';
}
/* Гроші пишемо групами по три з нерозривним пробілом: «2 500 ₴».
   Валюта завжди після числа — так у всіх мовах застосунку. */
function fmtMoney(amount, currency, opts){
  const n = Math.round(Number(amount) || 0);
  const NBSP = '\u00A0';
  const group = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = n < 0 ? '\u2212' : '';
  const sym = currencySymbol(currency);
  if (opts && opts.bare) return sign + group;
  return sign + group + NBSP + sym;
}
function initials(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
function uid(prefix){
  const rnd = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(36)).join('')
    : Math.random().toString(36).slice(2, 10);
  return `${prefix || 'id'}_${Date.now().toString(36)}${rnd}`;
}
function pickColor(seed){
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function normalizePhone(v){ return String(v || '').replace(/[^\d+]/g, ''); }
function isPhoneValid(v){ const p = normalizePhone(v); return p.replace(/\D/g, '').length >= 9; }

/* ── типовий стан ──────────────────────────────────────────── */
function detectLang(){
  const nav = (typeof navigator !== 'undefined' && (navigator.language || '')).slice(0, 2);
  return ['uk', 'ru', 'en'].includes(nav) ? nav : 'uk';
}
function detectTz(){
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'; }
  catch (e) { return 'Europe/Kyiv'; }
}
function blankState(){
  return {
    v: 1,
    onboarded: false,
    auth: {status: 'guest', phone: '', provider: '', createdAt: ''},
    profile: {name: '', emoji: '', color: AVATAR_COLORS[0], email: '', bio: ''},
    settings: {
      lang: detectLang(),
      theme: 'system',
      currency: 'UAH',
      tz: detectTz(),
      notifications: {lesson: true, payment: true, news: false},
      workStart: '08:00',
      workEnd: '21:00',
      defaultDuration: 60,
      defaultPrice: 300,
    },
    students: [],
    lessons: [],
    series: [],
    payments: [],
    library: [],
    premium: {plan: null, until: '', trialUsed: false},
    seen: {},
  };
}

/* Злиття збереженого стану з типовим: після оновлення застосунку
   в старих даних не буде нових полів — доливаємо їх, а не падаємо. */
function merge(base, saved){
  if (!saved || typeof saved !== 'object') return base;
  const out = Array.isArray(base) ? saved : Object.assign({}, base);
  Object.keys(saved).forEach(k => {
    const b = base[k], s = saved[k];
    out[k] = (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s))
      ? merge(b, s) : s;
  });
  return out;
}

function load(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankState();
    return merge(blankState(), JSON.parse(raw));
  } catch (e) { return blankState(); }
}
function persist(state){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

/* ── стан ──────────────────────────────────────────────────── */
function createStore(){
  let state = load();
  const listeners = new Set();
  const emit = () => listeners.forEach(l => { try { l(state); } catch (e) {} });
  return {
    get: () => state,
    set(patch){
      const next = typeof patch === 'function' ? patch(state) : Object.assign({}, state, patch);
      if (next === state) return state;
      state = next;
      persist(state);
      emit();
      return state;
    },
    subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); },
    reset(){ state = blankState(); persist(state); emit(); },
  };
}
const store = createStore();

/* Хук підписки. useSyncExternalStore не беремо: він є не в кожній
   збірці React, а тут вистачає простої підписки. */
function useStore(){
  const [s, setS] = React.useState(store.get());
  React.useEffect(() => store.subscribe(setS), []);
  return s;
}

/* ── дії ──────────────────────────────────────────────────────
   Кожна дія — чиста функція над станом: приймає стан, віддає
   новий. Так їх можна перевіряти без React.                    */
const A = {
  setSettings: patch => store.set(s => ({...s, settings: {...s.settings, ...patch}})),
  setProfile: patch => store.set(s => ({...s, profile: {...s.profile, ...patch}})),
  setAuth: patch => store.set(s => ({...s, auth: {...s.auth, ...patch}})),
  markSeen: key => store.set(s => ({...s, seen: {...s.seen, [key]: true}})),
  finishOnboarding: () => store.set(s => ({...s, onboarded: true})),

  addStudent(data){
    const id = uid('st');
    const student = {
      id,
      name: String(data.name || '').trim(),
      subject: data.subject || '',
      phone: data.phone || '',
      email: data.email || '',
      birthday: data.birthday || '',
      notes: data.notes || '',
      price: Number(data.price) || 0,
      color: data.color || pickColor(id),
      emoji: data.emoji || '',
      archived: false,
      createdAt: todayISO(),
    };
    store.set(s => ({...s, students: [...s.students, student]}));
    return student;
  },
  updateStudent(id, patch){
    store.set(s => ({...s, students: s.students.map(x => (x.id === id ? {...x, ...patch} : x))}));
  },
  removeStudent(id){
    store.set(s => ({
      ...s,
      students: s.students.filter(x => x.id !== id),
      /* заняття, де він був єдиним, зникають; у групових — просто виходить */
      lessons: s.lessons
        .map(l => ({...l, studentIds: l.studentIds.filter(x => x !== id)}))
        .filter(l => l.studentIds.length),
      payments: s.payments.filter(p => p.studentId !== id),
    }));
  },

  addLesson(data){
    const lesson = normalizeLesson(data);
    store.set(s => ({...s, lessons: [...s.lessons, lesson]}));
    return lesson;
  },
  addLessons(list){
    const items = list.map(normalizeLesson);
    store.set(s => ({...s, lessons: [...s.lessons, ...items]}));
    return items;
  },
  updateLesson(id, patch){
    store.set(s => ({...s, lessons: s.lessons.map(l => (l.id === id ? {...l, ...patch} : l))}));
  },
  removeLesson(id){
    store.set(s => ({...s, lessons: s.lessons.filter(l => l.id !== id)}));
  },
  removeSeries(seriesId){
    /* минуле не чіпаємо: історія занять має лишатись правдивою */
    const from = todayISO();
    store.set(s => ({
      ...s,
      lessons: s.lessons.filter(l => !(l.seriesId === seriesId && l.date >= from)),
      series: s.series.filter(x => x.id !== seriesId),
    }));
  },
  addSeries(series){
    store.set(s => ({...s, series: [...s.series, series]}));
    return series;
  },
  togglePaid(lessonId, paid){
    const s = store.get();
    const lesson = s.lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    A.updateLesson(lessonId, {paid});
    if (paid){
      lesson.studentIds.forEach(sid => A.addPayment({
        studentId: sid, amount: lesson.price, date: lesson.date, method: 'cash', lessonId,
      }));
    } else {
      store.set(st => ({...st, payments: st.payments.filter(p => p.lessonId !== lessonId)}));
    }
  },
  addPayment(data){
    const payment = {
      id: uid('pm'),
      studentId: data.studentId,
      amount: Number(data.amount) || 0,
      date: data.date || todayISO(),
      method: data.method || 'cash',
      lessonId: data.lessonId || '',
    };
    store.set(s => ({...s, payments: [...s.payments, payment]}));
    return payment;
  },
  removePayment(id){
    store.set(s => ({...s, payments: s.payments.filter(p => p.id !== id)}));
  },
  addToLibrary(itemId, price){
    store.set(s => (s.library.some(x => x.id === itemId) ? s : {
      ...s, library: [...s.library, {id: itemId, date: todayISO(), price: price || 0}],
    }));
  },
  setPremium(plan, until){
    store.set(s => ({...s, premium: {...s.premium, plan, until, trialUsed: s.premium.trialUsed || plan === 'trial'}}));
  },
  logout(){
    store.set(s => ({...s, auth: {status: 'guest', phone: '', provider: '', createdAt: ''}, onboarded: false}));
  },
  wipe(){ store.reset(); },
};

function normalizeLesson(data){
  const start = data.start || '10:00';
  return {
    id: data.id || uid('ls'),
    studentIds: (data.studentIds || []).slice(),
    subject: data.subject || '',
    date: data.date || todayISO(),
    start,
    end: data.end || toTime(toMin(start) + 60),
    price: Number(data.price) || 0,
    status: data.status || 'planned',
    paid: !!data.paid,
    note: data.note || '',
    seriesId: data.seriesId || '',
    createdAt: data.createdAt || todayISO(),
  };
}

/* ── вибірки ───────────────────────────────────────────────── */
const byTime = (a, b) => (a.date === b.date ? toMin(a.start) - toMin(b.start) : a.date < b.date ? -1 : 1);

const sel = {
  lessonsOn: (s, date) => s.lessons.filter(l => l.date === date).sort(byTime),
  lessonsBetween: (s, from, to) => s.lessons.filter(l => l.date >= from && l.date <= to).sort(byTime),
  lessonsOfStudent: (s, id) => s.lessons.filter(l => l.studentIds.includes(id)).sort(byTime),
  student: (s, id) => s.students.find(x => x.id === id),
  studentsOf: (s, lesson) => (lesson ? lesson.studentIds.map(id => sel.student(s, id)).filter(Boolean) : []),
  activeStudents: s => s.students.filter(x => !x.archived),

  /* Дохід рахуємо по проведених заняттях, а не по запланованих:
     показувати «дохід» за те, що ще не сталося, — самообман. */
  incomeOn: (s, date) => s.lessons
    .filter(l => l.date === date && l.status === 'done')
    .reduce((sum, l) => sum + l.price * Math.max(1, l.studentIds.length), 0),
  incomeBetween: (s, from, to) => s.lessons
    .filter(l => l.date >= from && l.date <= to && l.status === 'done')
    .reduce((sum, l) => sum + l.price * Math.max(1, l.studentIds.length), 0),
  plannedOn: (s, date) => s.lessons
    .filter(l => l.date === date && l.status !== 'canceled')
    .reduce((sum, l) => sum + l.price * Math.max(1, l.studentIds.length), 0),

  studentStats(s, id){
    const lessons = sel.lessonsOfStudent(s, id);
    const done = lessons.filter(l => l.status === 'done');
    const paid = s.payments.filter(p => p.studentId === id).reduce((a, p) => a + p.amount, 0);
    const earned = done.reduce((a, l) => a + l.price, 0);
    return {
      total: lessons.length,
      done: done.length,
      upcoming: lessons.filter(l => l.status === 'planned' && l.date >= todayISO()),
      history: lessons.filter(l => l.status !== 'planned' || l.date < todayISO()).sort((a, b) => byTime(b, a)),
      income: paid,
      debt: Math.max(0, earned - paid),
    };
  },
  /* Заняття, що перетинаються за часом — попереджаємо при створенні. */
  conflicts(s, {date, start, end, ignoreId}){
    const a = toMin(start), b = toMin(end);
    return s.lessons.filter(l => l.id !== ignoreId && l.date === date && l.status !== 'canceled'
      && toMin(l.start) < b && toMin(l.end) > a).sort(byTime);
  },
  isPremium(s){
    if (!s.premium.plan) return false;
    if (!s.premium.until) return true;
    return s.premium.until >= todayISO();
  },
  canAddStudent: s => sel.isPremium(s) || sel.activeStudents(s).length < FREE_STUDENT_LIMIT,
  unpaidLessons: s => s.lessons.filter(l => l.status === 'done' && !l.paid).sort((a, b) => byTime(b, a)),
};

/* ── серії ─────────────────────────────────────────────────────
   Розкладаємо правило в конкретні заняття наперед: календар має
   показувати реальні картки, які можна перенести чи скасувати
   поштучно, а не «віртуальні» повтори.                          */
function expandSeries(rule, opts){
  const weeks = (opts && opts.weeks) || SERIES_HORIZON_WEEKS;
  const step = rule.freq === 'biweekly' ? 14 : 7;
  const from = rule.from || todayISO();
  const limit = rule.until || addDays(from, weeks * 7);
  const out = [];
  const firstMonday = startOfWeek(from);
  for (let w = 0; w * step <= diffDays(firstMonday, limit); w++){
    (rule.days || []).forEach(d => {
      const date = addDays(firstMonday, w * step + d);
      if (date < from || date > limit) return;
      out.push({
        studentIds: rule.studentIds, subject: rule.subject, date,
        start: rule.start, end: rule.end, price: rule.price,
        seriesId: rule.id, note: rule.note || '',
      });
    });
  }
  return out.sort(byTime);
}

/* ── покупки ───────────────────────────────────────────────────
   Один фасад для App Store, Google Play і вебу. Зараз реальний
   лише демо-провайдер; нативний міст (Capacitor-плагін StoreKit)
   підхоплюється автоматично, щойно з'явиться window.UrokIAP —
   екрани підписки міняти не доведеться.                          */
const PRODUCTS = {
  monthly: {id: 'plus.monthly', period: 'month', price: 149, currency: 'UAH'},
  yearly: {id: 'plus.yearly', period: 'year', price: 1190, currency: 'UAH', monthly: 99},
};

const Billing = {
  bridge(){ return typeof window !== 'undefined' ? window.UrokIAP : null; },
  available(){ return !!Billing.bridge(); },
  products(){ return PRODUCTS; },
  async purchase(planId){
    const bridge = Billing.bridge();
    const product = PRODUCTS[planId];
    if (!product) throw new Error('unknown product');
    if (bridge && typeof bridge.purchase === 'function'){
      const res = await bridge.purchase(product.id);
      if (!res || !res.ok) throw new Error(res && res.error || 'purchase failed');
      A.setPremium(planId, res.expiresAt || '');
      return {ok: true, source: 'store'};
    }
    /* демо: підписка живе локально, щоб можна було пройти сценарій */
    const until = planId === 'yearly' ? addDays(todayISO(), 365) : addDays(todayISO(), 30);
    A.setPremium(planId, until);
    return {ok: true, source: 'demo'};
  },
  async trial(){
    const s = store.get();
    if (s.premium.trialUsed) return {ok: false, reason: 'used'};
    A.setPremium('trial', addDays(todayISO(), 7));
    return {ok: true};
  },
  async restore(){
    const bridge = Billing.bridge();
    if (bridge && typeof bridge.restore === 'function'){
      const res = await bridge.restore();
      if (res && res.plan) A.setPremium(res.plan, res.expiresAt || '');
      return {ok: !!(res && res.plan)};
    }
    return {ok: sel.isPremium(store.get())};
  },
};

/* ── тема ──────────────────────────────────────────────────────
   Тримаємо data-theme на <html> і колір системної панелі поруч:
   інакше на iOS «шапка» лишається білою в темній темі.          */
function applyTheme(pref){
  if (typeof document === 'undefined') return 'light';
  const sysDark = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = pref === 'dark' || (pref === 'system' && sysDark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.getElementById('metaTheme');
  if (meta) meta.setAttribute('content', dark ? '#0B0D10' : '#FFFFFF');
  return dark ? 'dark' : 'light';
}
function applyLang(lang){
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', lang);
}

/* ── демо-дані ─────────────────────────────────────────────────
   Не для краси скриншотів: без даних неможливо побачити, як
   поводяться фінанси й тиждень. Вмикається в налаштуваннях.     */
function demoData(t){
  const base = todayISO();
  const names = {
    uk: [['Іван Петренко', 'Англійська мова'], ['Марія Коваль', 'Англійська мова'], ['Олексій Шевченко', 'Математика'], ['Софія Бондаренко', 'Українська мова'], ['Дмитро Мороз', 'Математика']],
    ru: [['Иван Петренко', 'Английский язык'], ['Мария Коваль', 'Английский язык'], ['Алексей Шевченко', 'Математика'], ['София Бондаренко', 'Украинский язык'], ['Дмитрий Мороз', 'Математика']],
    en: [['Ivan Petrenko', 'English'], ['Maria Koval', 'English'], ['Oleksii Shevchenko', 'Maths'], ['Sofia Bondarenko', 'Ukrainian'], ['Dmytro Moroz', 'Maths']],
  }[t.lang] || [];
  const students = names.map(([name, subject], i) => ({
    id: `demo_st_${i}`, name, subject, phone: `+38063000000${i}`, email: '',
    birthday: '', notes: '', price: [400, 400, 500, 350, 500][i],
    color: AVATAR_COLORS[i % AVATAR_COLORS.length], emoji: '', archived: false,
    createdAt: addDays(base, -60 + i * 5),
  }));
  const plan = [
    [0, '10:00', 60, 0, 'done'], [0, '12:00', 60, 1, 'done'], [0, '15:00', 60, 2, 'planned'],
    [0, '17:30', 45, 3, 'planned'], [0, '19:00', 60, 4, 'planned'],
    [1, '11:00', 60, 1, 'planned'], [1, '16:00', 60, 2, 'planned'],
    [2, '10:00', 60, 0, 'planned'], [2, '13:00', 90, 4, 'planned'],
    [3, '18:00', 60, 3, 'planned'],
    [-1, '10:00', 60, 0, 'done'], [-1, '12:00', 60, 1, 'done'], [-1, '15:00', 60, 2, 'done'],
    [-2, '11:00', 60, 4, 'done'], [-3, '10:00', 60, 0, 'done'], [-4, '16:00', 60, 3, 'done'],
    [-7, '10:00', 60, 0, 'done'], [-7, '12:00', 60, 1, 'done'], [-8, '15:00', 60, 2, 'done'],
  ];
  const lessons = plan.map(([off, start, dur, si, status], i) => normalizeLesson({
    id: `demo_ls_${i}`, studentIds: [students[si].id], subject: students[si].subject,
    date: addDays(base, off), start, end: toTime(toMin(start) + dur),
    price: students[si].price, status, paid: status === 'done' && i % 4 !== 1,
  }));
  const payments = lessons.filter(l => l.paid).map((l, i) => ({
    id: `demo_pm_${i}`, studentId: l.studentIds[0], amount: l.price, date: l.date,
    method: PAYMENT_METHODS[i % 3], lessonId: l.id,
  }));
  return {students, lessons, payments};
}
function loadDemo(t){
  const d = demoData(t);
  store.set(s => ({
    ...s,
    students: [...s.students.filter(x => !x.id.startsWith('demo_')), ...d.students],
    lessons: [...s.lessons.filter(x => !x.id.startsWith('demo_')), ...d.lessons],
    payments: [...s.payments.filter(x => !x.id.startsWith('demo_')), ...d.payments],
  }));
}
function unloadDemo(){
  store.set(s => ({
    ...s,
    students: s.students.filter(x => !x.id.startsWith('demo_')),
    lessons: s.lessons.filter(x => !x.id.startsWith('demo_')),
    payments: s.payments.filter(x => !x.id.startsWith('demo_')),
  }));
}
const hasDemo = s => s.students.some(x => x.id.startsWith('demo_'));

Object.assign(window.U, {
  KEY, VERSION, FREE_STUDENT_LIMIT, SERIES_HORIZON_WEEKS, CURRENCIES, TIMEZONES, AVATAR_COLORS, PAYMENT_METHODS, PRODUCTS,
  pad2, iso, parseISO, todayISO, addDays, addMonths, dow, startOfWeek, weekDays, startOfMonth, daysInMonth,
  monthGrid, isSame, isPast, diffDays, toMin, toTime, duration,
  fmtDayMonth, fmtLongDate, fmtShortDate, fmtRelDate, fmtDur, fmtMoney, currencySymbol, initials, uid, pickColor,
  normalizePhone, isPhoneValid, blankState, merge, load, persist, createStore, store, useStore, A, normalizeLesson,
  sel, byTime, expandSeries, Billing, applyTheme, applyLang, demoData, loadDemo, unloadDemo, hasDemo, detectLang, detectTz,
});
})();
