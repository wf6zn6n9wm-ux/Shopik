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

/* Статуси заняття. «Не відбулося» — це не «скасовано»: скасоване
   заняття зняли завчасно, а зірване коштувало викладачеві часу.
   Різницю видно в статистиці, тому два різні статуси.            */
const LESSON_STATUS = ['planned', 'done', 'canceled', 'missed'];
const HOMEWORK_STATUS = ['todo', 'doing', 'done'];

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
/* Ціна в сторі пишеться за звичаєм своєї валюти: $3.99 перед числом,
   149 ₴ — після. Копійки лишаємо, лише коли вони є.               */
const SYMBOL_FIRST = new Set(['USD', 'EUR', 'GBP']);
function fmtPrice(amount, currency){
  const n = Number(amount) || 0;
  const sym = currencySymbol(currency);
  const body = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return SYMBOL_FIRST.has(currency) ? sym + body : body + '\u00A0' + sym;
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

/* Фото учня зменшуємо до квадрата 160px і кладемо в стан як
   data:URL. Оригінал із камери — це мегабайти, а localStorage має
   кілька: без стиснення застосунок помер би на десятому учневі. */
function photoFromFile(file, size){
  const px = size || 160;
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined' || typeof document === 'undefined') return reject(new Error('no FileReader'));
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      reader.onerror = reject;
      img.onerror = reject;
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = px;
          const ctx = canvas.getContext('2d');
          const side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function isPhoneValid(v){ const p = normalizePhone(v); return p.replace(/\D/g, '').length >= 9; }

/* ── типовий стан ──────────────────────────────────────────── */
function detectTz(){
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'; }
  catch (e) { return 'Europe/Kyiv'; }
}
function blankState(){
  return {
    v: 1,
    onboarded: false,
    auth: {status: 'guest', phone: '', provider: '', createdAt: ''},
    profile: {name: '', emoji: '', color: AVATAR_COLORS[0], email: '', bio: '', subjects: [], photo: ''},
    settings: {
      /* Українська — типова мова продукту, а не «як у браузера»:
         так домовлено з першого дня, і перемикач поруч у налаштуваннях. */
      lang: 'uk',
      theme: 'system',
      currency: 'UAH',
      tz: detectTz(),
      notifications: {lesson: true, payment: true, homework: true, news: false},
      workStart: '08:00',
      workEnd: '21:00',
      defaultDuration: 60,
      defaultPrice: 300,
    },
    students: [],
    lessons: [],
    series: [],
    payments: [],
    homework: [],
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
      homework: s.homework
        .map(h => ({...h, studentIds: h.studentIds.filter(x => x !== id)}))
        .filter(h => h.studentIds.length),
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
  setLessonStatus(id, status){
    A.updateLesson(id, {status: LESSON_STATUS.includes(status) ? status : 'planned'});
  },
  /* Перенести — це та сама картка на новий час, а не нове заняття:
     інакше з історії учня зникає, що заняття взагалі було. */
  rescheduleLesson(id, {date, start, end}){
    const lesson = store.get().lessons.find(l => l.id === id);
    if (!lesson) return null;
    const len = duration(lesson.start, lesson.end);
    const nextStart = start || lesson.start;
    A.updateLesson(id, {
      date: date || lesson.date,
      start: nextStart,
      end: end || toTime(toMin(nextStart) + len),
      status: lesson.status === 'canceled' || lesson.status === 'missed' ? 'planned' : lesson.status,
    });
    return store.get().lessons.find(l => l.id === id);
  },
  /* Повторити — копія на N днів уперед, уже без серії. */
  duplicateLesson(id, offsetDays){
    const lesson = store.get().lessons.find(l => l.id === id);
    if (!lesson) return null;
    return A.addLesson({
      studentIds: lesson.studentIds, subject: lesson.subject,
      date: addDays(lesson.date, offsetDays === undefined ? 7 : offsetDays),
      start: lesson.start, end: lesson.end, price: lesson.price, prices: lesson.prices,
      note: lesson.note, status: 'planned',
    });
  },
  setLessonPrice(id, price, perStudent){
    A.updateLesson(id, perStudent
      ? {prices: Object.assign({}, (store.get().lessons.find(l => l.id === id) || {}).prices, perStudent)}
      : {price: Number(price) || 0});
  },
  /* Оплатити заняття — це запис про гроші з посиланням на нього.
     Знімається так само: прибираємо платіж, а не «галочку».     */
  payForLesson(lessonId, method){
    const s = store.get();
    const lesson = s.lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    lesson.studentIds.forEach(sid => {
      if (s.payments.some(p => p.lessonId === lessonId && p.studentId === sid)) return;
      A.addPayment({studentId: sid, amount: lessonPrice(lesson, sid), date: lesson.date,
                    method: method || 'cash', lessonId, type: 'lesson'});
    });
  },
  unpayLesson(lessonId){
    store.set(st => ({...st, payments: st.payments.filter(p => p.lessonId !== lessonId)}));
  },
  addPayment(data){
    const payment = {
      id: uid('pm'),
      studentId: data.studentId,
      amount: Number(data.amount) || 0,
      date: data.date || todayISO(),
      method: data.method || 'cash',
      lessonId: data.lessonId || '',
      /* передоплата — платіж без прив'язки до заняття */
      type: data.type || (data.lessonId ? 'lesson' : 'prepay'),
      note: data.note || '',
    };
    store.set(s => ({...s, payments: [...s.payments, payment]}));
    return payment;
  },
  removePayment(id){
    store.set(s => ({...s, payments: s.payments.filter(p => p.id !== id)}));
  },

  /* ── домашні завдання ───────────────────────────────────── */
  addHomework(data){
    const hw = {
      id: uid('hw'),
      studentIds: (data.studentIds || []).slice(),
      lessonId: data.lessonId || '',
      title: String(data.title || '').trim(),
      description: data.description || '',
      issuedAt: data.issuedAt || todayISO(),
      dueDate: data.dueDate || addDays(todayISO(), 7),
      status: HOMEWORK_STATUS.includes(data.status) ? data.status : 'todo',
      checked: !!data.checked,
      createdAt: todayISO(),
    };
    store.set(s => ({...s, homework: [...s.homework, hw]}));
    return hw;
  },
  updateHomework(id, patch){
    store.set(s => ({...s, homework: s.homework.map(h => (h.id === id ? {...h, ...patch} : h))}));
  },
  setHomeworkStatus(id, status){
    /* повернули в роботу — перевірка теж скидається */
    A.updateHomework(id, {status, checked: status === 'done' ? undefined : false});
    if (status !== 'done') A.updateHomework(id, {checked: false});
  },
  checkHomework(id, checked){
    A.updateHomework(id, {checked: checked === undefined ? true : checked});
  },
  removeHomework(id){
    store.set(s => ({...s, homework: s.homework.filter(h => h.id !== id)}));
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
    /* ціна на кожного учня окремо — у групі вона рідко однакова;
       порожньо означає «як у занятті» */
    prices: Object.assign({}, data.prices),
    status: LESSON_STATUS.includes(data.status) ? data.status : 'planned',
    note: data.note || '',
    seriesId: data.seriesId || '',
    createdAt: data.createdAt || todayISO(),
  };
}

/* Скільки коштує заняття конкретному учневі й скільки — разом. */
const lessonPrice = (lesson, studentId) => {
  const own = lesson.prices && lesson.prices[studentId];
  return Number(own === undefined || own === '' ? lesson.price : own) || 0;
};
const lessonTotal = lesson => (lesson.studentIds.length
  ? lesson.studentIds.reduce((sum, id) => sum + lessonPrice(lesson, id), 0)
  : Number(lesson.price) || 0);
/* Гроші заробляються, коли заняття проведено. Скасоване й зірване
   не приносять нічого — інакше «дохід» перестає бути доходом. */
const isEarning = lesson => lesson.status === 'done';

/* ── вибірки ───────────────────────────────────────────────── */
const byTime = (a, b) => (a.date === b.date ? toMin(a.start) - toMin(b.start) : a.date < b.date ? -1 : 1);

const sel = {
  lessonsOn: (s, date) => s.lessons.filter(l => l.date === date).sort(byTime),
  lessonsBetween: (s, from, to) => s.lessons.filter(l => l.date >= from && l.date <= to).sort(byTime),
  lessonsOfStudent: (s, id) => s.lessons.filter(l => l.studentIds.includes(id)).sort(byTime),
  student: (s, id) => s.students.find(x => x.id === id),
  studentsOf: (s, lesson) => (lesson ? lesson.studentIds.map(id => sel.student(s, id)).filter(Boolean) : []),
  activeStudents: s => s.students.filter(x => !x.archived),
  nextLesson: (s, id) => s.lessons
    .filter(l => l.status === 'planned' && l.date >= todayISO() && (!id || l.studentIds.includes(id)))
    .sort(byTime)[0],

  /* ── гроші ──────────────────────────────────────────────────
     Дохід рахуємо по проведених заняттях, а оплати — окремо, як
     рух грошей. Два різні числа: «заробив» і «отримав». Плутати
     їх — найшвидший спосіб збрехати собі про свій місяць.       */
  incomeOn: (s, date) => s.lessons
    .filter(l => l.date === date && isEarning(l))
    .reduce((sum, l) => sum + lessonTotal(l), 0),
  incomeBetween: (s, from, to) => s.lessons
    .filter(l => l.date >= from && l.date <= to && isEarning(l))
    .reduce((sum, l) => sum + lessonTotal(l), 0),
  receivedBetween: (s, from, to) => s.payments
    .filter(p => p.date >= from && p.date <= to)
    .reduce((sum, p) => sum + p.amount, 0),
  /* Очікується — заплановані заняття попереду. Це ще не дохід. */
  expectedBetween: (s, from, to) => s.lessons
    .filter(l => l.date >= from && l.date <= to && l.status === 'planned')
    .reduce((sum, l) => sum + lessonTotal(l), 0),
  plannedOn: (s, date) => s.lessons
    .filter(l => l.date === date && l.status !== 'canceled')
    .reduce((sum, l) => sum + lessonTotal(l), 0),

  /* ── книга учня ─────────────────────────────────────────────
     Один розрахунок на всі гроші учня. Оплати закривають проведені
     заняття за порядком у часі (найстаріше — першим), тому
     передоплата працює сама собою: щойно заняття проведено, воно
     з'їдає гроші з балансу. Плюс на балансі — оплачено наперед,
     мінус — борг. Жодного окремого поля «оплачено» на занятті:
     воно завжди розходилося б із реальністю.                    */
  ledger(s, studentId){
    const lessons = sel.lessonsOfStudent(s, studentId).filter(isEarning);
    const payments = s.payments.filter(p => p.studentId === studentId);
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    const earned = lessons.reduce((a, l) => a + lessonPrice(l, studentId), 0);
    /* заняття, оплачені адресно, закриті незалежно від черги */
    const direct = new Set(payments.filter(p => p.lessonId).map(p => p.lessonId));
    let pool = payments.filter(p => !p.lessonId).reduce((a, p) => a + p.amount, 0);
    const covered = new Set(), partial = {};
    lessons.forEach(l => {
      if (direct.has(l.id)) return covered.add(l.id);
      const price = lessonPrice(l, studentId);
      if (pool >= price){ pool -= price; covered.add(l.id); }
      else if (pool > 0){ partial[l.id] = pool; pool = 0; }
    });
    const balance = paid - earned;
    return {
      earned, paid, balance,
      debt: Math.max(0, -balance),
      prepay: Math.max(0, balance),
      covered, partial,
      unpaid: lessons.filter(l => !covered.has(l.id)),
      payments: payments.slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
  },
  /* Заняття оплачене, якщо закриті частки всіх його учнів. */
  isLessonPaid(s, lesson){
    if (!isEarning(lesson)) return false;
    return lesson.studentIds.every(id => sel.ledger(s, id).covered.has(lesson.id));
  },
  studentStats(s, id){
    const lessons = sel.lessonsOfStudent(s, id);
    const money = sel.ledger(s, id);
    return {
      total: lessons.length,
      done: lessons.filter(l => l.status === 'done').length,
      canceled: lessons.filter(l => l.status === 'canceled').length,
      missed: lessons.filter(l => l.status === 'missed').length,
      upcoming: lessons.filter(l => l.status === 'planned' && l.date >= todayISO()),
      history: lessons.filter(l => l.status !== 'planned' || l.date < todayISO()).sort((a, b) => byTime(b, a)),
      next: sel.nextLesson(s, id),
      homework: sel.homeworkOf(s, id),
      earned: money.earned,
      income: money.paid,
      balance: money.balance,
      debt: money.debt,
      prepay: money.prepay,
      unpaid: money.unpaid,
      payments: money.payments,
    };
  },
  /* Хто винен гроші — окремим списком: це найчастіше питання
     викладача до застосунку після «що в мене сьогодні». */
  debtors(s){
    return sel.activeStudents(s)
      .map(st => ({student: st, ...sel.ledger(s, st.id)}))
      .filter(x => x.debt > 0)
      .sort((a, b) => b.debt - a.debt);
  },
  prepaid(s){
    return sel.activeStudents(s)
      .map(st => ({student: st, ...sel.ledger(s, st.id)}))
      .filter(x => x.prepay > 0)
      .sort((a, b) => b.prepay - a.prepay);
  },
  totalDebt: s => sel.debtors(s).reduce((a, x) => a + x.debt, 0),
  totalPrepay: s => sel.prepaid(s).reduce((a, x) => a + x.prepay, 0),

  /* ── домашні завдання ───────────────────────────────────── */
  homeworkOf: (s, studentId) => s.homework
    .filter(h => h.studentIds.includes(studentId))
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)),
  homeworkOfLesson: (s, lessonId) => s.homework.filter(h => h.lessonId === lessonId),
  homeworkActive: s => s.homework
    .filter(h => h.status !== 'done')
    .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1)),
  homeworkOverdue: s => sel.homeworkActive(s).filter(h => h.dueDate && h.dueDate < todayISO()),
  homeworkDueBy: (s, date) => sel.homeworkActive(s).filter(h => h.dueDate && h.dueDate <= date),
  /* Виконане, але ще не перевірене — те, що чекає на викладача. */
  homeworkToCheck: s => s.homework.filter(h => h.status === 'done' && !h.checked),

  /* ── статистика ─────────────────────────────────────────────
     Одна функція на період: усі числа рахуються з тих самих
     заняття-оплати, тому вони не можуть розійтися між екранами. */
  stats(s, from, to){
    const lessons = s.lessons.filter(l => l.date >= from && l.date <= to);
    const done = lessons.filter(isEarning);
    const earned = done.reduce((a, l) => a + lessonTotal(l), 0);
    const seats = done.reduce((a, l) => a + Math.max(1, l.studentIds.length), 0);
    const ids = new Set();
    lessons.forEach(l => l.studentIds.forEach(id => ids.add(id)));
    const hw = s.homework.filter(h => h.dueDate >= from && h.dueDate <= to);
    return {
      from, to,
      lessons: done.length,
      planned: lessons.filter(l => l.status === 'planned').length,
      canceled: lessons.filter(l => l.status === 'canceled').length,
      missed: lessons.filter(l => l.status === 'missed').length,
      students: ids.size,
      earned,
      received: sel.receivedBetween(s, from, to),
      expected: sel.expectedBetween(s, from, to),
      avgPrice: seats ? Math.round(earned / seats) : 0,
      hours: Math.round(done.reduce((a, l) => a + duration(l.start, l.end), 0) / 6) / 10,
      homeworkDone: hw.filter(h => h.status === 'done').length,
      homeworkTotal: hw.length,
    };
  },
  /* Стовпчики для графіка: день/тиждень/місяць/рік однією формою. */
  incomeSeries(s, kind, anchor){
    const base = anchor || todayISO();
    const out = [];
    if (kind === 'day'){
      for (let i = 6; i >= 0; i--){
        const d = addDays(base, -i);
        out.push({key: d, from: d, to: d, value: sel.incomeOn(s, d)});
      }
    } else if (kind === 'week'){
      for (let i = 5; i >= 0; i--){
        const from = addDays(startOfWeek(base), -i * 7), to = addDays(from, 6);
        out.push({key: from, from, to, value: sel.incomeBetween(s, from, to)});
      }
    } else if (kind === 'year'){
      for (let i = 4; i >= 0; i--){
        const y = Number(base.slice(0, 4)) - i;
        out.push({key: String(y), from: `${y}-01-01`, to: `${y}-12-31`, value: sel.incomeBetween(s, `${y}-01-01`, `${y}-12-31`)});
      }
    } else {
      for (let i = 5; i >= 0; i--){
        const from = startOfMonth(addMonths(base, -i));
        const to = addDays(startOfMonth(addMonths(from, 1)), -1);
        out.push({key: from, from, to, value: sel.incomeBetween(s, from, to)});
      }
    }
    return out;
  },
  /* Межі періоду для заголовків і KPI. */
  periodRange(kind, anchor){
    const base = anchor || todayISO();
    if (kind === 'day') return {from: base, to: base};
    if (kind === 'week') return {from: startOfWeek(base), to: addDays(startOfWeek(base), 6)};
    if (kind === 'year') return {from: `${base.slice(0, 4)}-01-01`, to: `${base.slice(0, 4)}-12-31`};
    const from = startOfMonth(base);
    return {from, to: addDays(startOfMonth(addMonths(from, 1)), -1)};
  },
  /* Розклад учня — з правил серій, а не з окремих занять. */
  scheduleOf: (s, studentId) => s.series.filter(x => x.studentIds.includes(studentId)),

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
  /* Ліміт безкоштовного плану — м'який: він показує пропозицію, а
     не забирає роботу. Заблокований учень означає, що викладач
     веде його в іншому місці, і тоді Urok+ уже не потрібен.      */
  overFreeLimit: s => !sel.isPremium(s) && sel.activeStudents(s).length >= FREE_STUDENT_LIMIT,
  canAddStudent: () => true,
  unpaidLessons: s => s.lessons.filter(l => isEarning(l) && !sel.isLessonPaid(s, l)).sort((a, b) => byTime(b, a)),
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
/* Ціни підписки живуть у доларах і не залежать від валюти, у якій
   викладач рахує заняття: у App Store тариф один на всі країни, а
   ₴/zł/€ у застосунку — це про гроші учнів, не про нашу підписку.
   months потрібні, щоб рахувати вигоду й строк без окремих таблиць. */
const PRODUCTS = {
  monthly: {id: 'plus.monthly', period: 'month', months: 1, price: 3.99, currency: 'USD'},
  quarterly: {id: 'plus.quarterly', period: 'quarter', months: 3, price: 9.99, currency: 'USD'},
  yearly: {id: 'plus.yearly', period: 'year', months: 12, price: 44.99, currency: 'USD'},
};
const PLAN_ORDER = ['yearly', 'quarterly', 'monthly'];
/* Скільки виходить на місяць і скільки це економить проти місячного. */
const planMonthly = plan => (PRODUCTS[plan] ? PRODUCTS[plan].price / PRODUCTS[plan].months : 0);
const planSaving = plan => Math.round((1 - planMonthly(plan) / PRODUCTS.monthly.price) * 100);

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
    A.setPremium(planId, addDays(todayISO(), Math.round(product.months * 30.4)));
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

/* Копіювання в буфер: сучасний API там, де він є, і старий трюк з
   прихованим полем там, де немає (Safari без https, iframe). */
function copyText(text){
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).then(() => true, () => fallback());
  }
  return Promise.resolve(fallback());
  function fallback(){
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand && document.execCommand('copy');
      area.remove();
      return !!ok;
    } catch (e) { return false; }
  }
}
/* Сторінка всередині іншої (артефакт, прев'ю): там браузер не дасть
   зберегти файл, тому такі місця мають поводитись інакше. */
function isEmbedded(){
  try { return typeof window !== 'undefined' && window.top !== window.self; }
  catch (e) { return true; }
}

/* ── тема ──────────────────────────────────────────────────────
   Тримаємо data-theme на <html> і колір системної панелі поруч:
   інакше на iOS «шапка» лишається білою в темній темі.          */
function applyTheme(pref){
  if (typeof document === 'undefined') return 'light';
  /* Коли сторінку вбудували (артефакт, прев'ю), «системна» тема
     означає тему хоста, а не операційної системи: інакше наш
     перемикач сперечався б із перемикачем сторінки навколо. */
  const host = typeof window !== 'undefined' ? window.__UROK_HOST_THEME : '';
  const sysDark = host ? host === 'dark'
    : (typeof window !== 'undefined' && window.matchMedia
       && window.matchMedia('(prefers-color-scheme: dark)').matches);
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
  const L = {
    uk: {
      names: [['Іван Петренко', 'Англійська мова'], ['Марія Коваль', 'Англійська мова'], ['Олексій Шевченко', 'Математика'], ['Софія Бондаренко', 'Українська мова'], ['Дмитро Мороз', 'Математика']],
      group: 'Англійська мова · група',
      hw: [
        ['Past Simple: вправи 3–5', 'Сторінки 42–43, письмово. Перевіримо на занятті.'],
        ['Прочитати розділ 4', 'Виписати 10 нових слів із транскрипцією.'],
        ['Квадратні рівняння', 'Варіант Б, задачі 1–8.'],
        ['Твір «Мій день»', '120–150 слів, минулий час.'],
      ],
    },
    ru: {
      names: [['Иван Петренко', 'Английский язык'], ['Мария Коваль', 'Английский язык'], ['Алексей Шевченко', 'Математика'], ['София Бондаренко', 'Украинский язык'], ['Дмитрий Мороз', 'Математика']],
      group: 'Английский язык · группа',
      hw: [
        ['Past Simple: упражнения 3–5', 'Страницы 42–43, письменно. Проверим на занятии.'],
        ['Прочитать главу 4', 'Выписать 10 новых слов с транскрипцией.'],
        ['Квадратные уравнения', 'Вариант Б, задачи 1–8.'],
        ['Сочинение «Мой день»', '120–150 слов, прошедшее время.'],
      ],
    },
    en: {
      names: [['Ivan Petrenko', 'English'], ['Maria Koval', 'English'], ['Oleksii Shevchenko', 'Maths'], ['Sofia Bondarenko', 'Ukrainian'], ['Dmytro Moroz', 'Maths']],
      group: 'English · group',
      hw: [
        ['Past Simple: exercises 3–5', 'Pages 42–43, in writing. We will check it in class.'],
        ['Read chapter 4', 'Write out 10 new words with transcription.'],
        ['Quadratic equations', 'Variant B, problems 1–8.'],
        ['Essay “My day”', '120–150 words, past tense.'],
      ],
    },
  }[t.lang] || {};
  const students = (L.names || []).map(([name, subject], i) => ({
    id: `demo_st_${i}`, name, subject, phone: `+38063000000${i}`, email: '',
    birthday: '', notes: '', price: [400, 400, 500, 350, 500][i],
    color: AVATAR_COLORS[i % AVATAR_COLORS.length], emoji: '', archived: false, photo: '',
    createdAt: addDays(base, -60 + i * 5),
  }));
  /* [зсув у днях, початок, хвилин, учень, статус] */
  const plan = [
    [0, '10:00', 60, 0, 'done'], [0, '12:00', 60, 1, 'done'], [0, '15:00', 60, 2, 'planned'],
    [0, '17:30', 45, 3, 'planned'],
    [1, '11:00', 60, 1, 'planned'], [1, '16:00', 60, 2, 'planned'],
    [2, '10:00', 60, 0, 'planned'], [2, '13:00', 90, 4, 'planned'],
    [3, '18:00', 60, 3, 'planned'],
    [-1, '10:00', 60, 0, 'done'], [-1, '12:00', 60, 1, 'done'], [-1, '15:00', 60, 2, 'done'],
    [-2, '11:00', 60, 4, 'done'], [-2, '16:00', 60, 3, 'canceled'],
    [-3, '10:00', 60, 0, 'done'], [-4, '16:00', 60, 3, 'done'], [-5, '12:00', 60, 1, 'missed'],
    [-7, '10:00', 60, 0, 'done'], [-7, '12:00', 60, 1, 'done'], [-8, '15:00', 60, 2, 'done'],
    [-9, '11:00', 60, 4, 'done'], [-11, '10:00', 60, 0, 'done'], [-14, '12:00', 60, 1, 'done'],
  ];
  const lessons = plan.map(([off, start, dur, si, status], i) => normalizeLesson({
    id: `demo_ls_${i}`, studentIds: [students[si].id], subject: students[si].subject,
    date: addDays(base, off), start, end: toTime(toMin(start) + dur),
    price: students[si].price, status,
  }));
  /* групове заняття: ціна в кожного своя */
  lessons.push(normalizeLesson({
    id: 'demo_ls_group', studentIds: [students[0].id, students[1].id, students[3].id],
    subject: L.group, date: addDays(base, 0), start: '19:00', end: '20:00',
    price: 300, prices: {[students[0].id]: 300, [students[1].id]: 300, [students[3].id]: 250},
    status: 'planned',
  }));

  /* Оплати: частина занять закрита, в одного учня передоплата, в
     одного — борг. Без цього не видно, як живуть гроші.          */
  const done = lessons.filter(l => l.status === 'done');
  const payments = [];
  done.forEach((l, i) => {
    const sid = l.studentIds[0];
    if (sid === students[2].id) return;            // Олексій лишається боржником
    payments.push({
      id: `demo_pm_${i}`, studentId: sid, amount: lessonPrice(l, sid), date: l.date,
      method: PAYMENT_METHODS[i % 3], lessonId: l.id, type: 'lesson', note: '',
    });
  });
  payments.push({
    id: 'demo_pm_prepay', studentId: students[1].id, amount: 1200, date: addDays(base, -3),
    method: 'card', lessonId: '', type: 'prepay', note: '',
  });

  const hw = (L.hw || []).map(([title, description], i) => ({
    id: `demo_hw_${i}`,
    studentIds: [students[[0, 1, 2, 3][i]].id],
    lessonId: '', title, description,
    issuedAt: addDays(base, -[2, 3, 1, 5][i]),
    dueDate: addDays(base, [1, 0, 3, -1][i]),
    status: ['todo', 'done', 'doing', 'todo'][i],
    checked: false,
    createdAt: addDays(base, -[2, 3, 1, 5][i]),
  }));

  return {students, lessons, payments, homework: hw};
}
const notDemo = x => !String(x.id).startsWith('demo_');
function loadDemo(t){
  const d = demoData(t);
  store.set(s => ({
    ...s,
    students: [...s.students.filter(notDemo), ...d.students],
    lessons: [...s.lessons.filter(notDemo), ...d.lessons],
    payments: [...s.payments.filter(notDemo), ...d.payments],
    homework: [...s.homework.filter(notDemo), ...d.homework],
  }));
}
function unloadDemo(){
  store.set(s => ({
    ...s,
    students: s.students.filter(notDemo),
    lessons: s.lessons.filter(notDemo),
    payments: s.payments.filter(notDemo),
    homework: s.homework.filter(notDemo),
  }));
}
const hasDemo = s => s.students.some(x => x.id.startsWith('demo_'));

Object.assign(window.U, {
  KEY, VERSION, FREE_STUDENT_LIMIT, SERIES_HORIZON_WEEKS, CURRENCIES, TIMEZONES, AVATAR_COLORS, PAYMENT_METHODS, PRODUCTS,
  pad2, iso, parseISO, todayISO, addDays, addMonths, dow, startOfWeek, weekDays, startOfMonth, daysInMonth,
  monthGrid, isSame, isPast, diffDays, toMin, toTime, duration,
  fmtDayMonth, fmtLongDate, fmtShortDate, fmtRelDate, fmtDur, fmtMoney, fmtPrice, currencySymbol, initials, uid, pickColor,
  normalizePhone, isPhoneValid, photoFromFile, copyText, isEmbedded, blankState, merge, load, persist, createStore, store, useStore, A, normalizeLesson,
  sel, byTime, expandSeries, Billing, applyTheme, applyLang, demoData, loadDemo, unloadDemo, hasDemo, detectTz,
  LESSON_STATUS, HOMEWORK_STATUS, lessonPrice, lessonTotal, isEarning, PLAN_ORDER, planMonthly, planSaving,
});
})();
