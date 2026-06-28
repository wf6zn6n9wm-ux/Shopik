// Shared content for the Connected.com.ua homepage clone.
// Copy is realistic Ukrainian for an online exam-prep school
// (ЄВІ / ТЗНК / ЄФВВ / ЄВВ). Numbers are illustrative.

export type Course = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  price: string;
  oldPrice?: string;
  duration: string;
  color: string; // tailwind gradient classes
  track: "magistracy" | "phd";
};

export const courses: Course[] = [
  {
    id: "yevi",
    badge: "ЄВІ",
    title: "Англійська мова (ЄВІ)",
    subtitle: "Єдиний вступний іспит",
    description:
      "Граматика, читання, лексика та стратегії виконання тесту з нуля до впевненого результату.",
    price: "4 900 ₴",
    oldPrice: "6 500 ₴",
    duration: "3 місяці",
    color: "from-accent-blue/90 to-accent-violet/90",
    track: "magistracy",
  },
  {
    id: "tznk",
    badge: "ТЗНК",
    title: "ТЗНК",
    subtitle: "Тест загальної навчальної компетентності",
    description:
      "Логіка, аналітичне читання та робота з даними. Розбираємо всі типи завдань на практиці.",
    price: "4 500 ₴",
    oldPrice: "5 900 ₴",
    duration: "2.5 місяці",
    color: "from-brand to-brand-dark",
    track: "magistracy",
  },
  {
    id: "yefvv",
    badge: "ЄФВВ",
    title: "ЄФВВ (Право)",
    subtitle: "Єдиний фаховий вступний іспит",
    description:
      "Фахова частина для вступу в магістратуру права. Теорія, тести та консультації викладача.",
    price: "5 400 ₴",
    oldPrice: "7 200 ₴",
    duration: "3 місяці",
    color: "from-accent-amber to-accent-rose",
    track: "magistracy",
  },
  {
    id: "yevv-phd",
    badge: "ЄВВ",
    title: "Підготовка до аспірантури",
    subtitle: "Єдине вступне випробування",
    description:
      "Іноземна мова та фахова підготовка для вступу до аспірантури з індивідуальним планом.",
    price: "6 200 ₴",
    duration: "4 місяці",
    color: "from-accent-violet to-accent-blue",
    track: "phd",
  },
  {
    id: "english-phd",
    badge: "ЄВІ",
    title: "Англійська для аспірантів",
    subtitle: "Рівень B2+",
    description:
      "Поглиблений курс для тих, хто вступає в аспірантуру та готується до наукової діяльності.",
    price: "5 800 ₴",
    duration: "3.5 місяці",
    color: "from-brand-dark to-accent-blue",
    track: "phd",
  },
];

export type Step = {
  n: string;
  title: string;
  text: string;
};

export const steps: Step[] = [
  {
    n: "01",
    title: "Залишаєте заявку",
    text: "Ви обираєте курс і залишаєте заявку. Менеджер зв'язується з вами та визначає ваш рівень.",
  },
  {
    n: "02",
    title: "Проходите вхідне тестування",
    text: "Безкоштовне тестування показує сильні та слабкі сторони, щоб скласти індивідуальний план.",
  },
  {
    n: "03",
    title: "Навчаєтесь онлайн",
    text: "Живі заняття у Zoom, записи всіх уроків та доступ до платформи з домашніми завданнями.",
  },
  {
    n: "04",
    title: "Отримуєте підтримку",
    text: "Куратор перевіряє домашні завдання, відповідає на питання та тримає вас у графіку.",
  },
  {
    n: "05",
    title: "Складаєте іспит і вступаєте",
    text: "Ви здаєте пробні іспити, виходите на потрібний бал і вступаєте до обраного університету.",
  },
];

export type Review = {
  name: string;
  role: string;
  text: string;
  rating: number;
};

export const reviews: Review[] = [
  {
    name: "Олена К.",
    role: "Вступила в магістратуру КНУ",
    text: "За три місяці підняла англійську з нуля до 170+ балів на ЄВІ. Викладачі пояснюють так, що все стає зрозуміло.",
    rating: 5,
  },
  {
    name: "Дмитро С.",
    role: "ЄФВВ, право",
    text: "Структуровані матеріали і постійна підтримка куратора. Склав фаховий на високий бал з першого разу.",
    rating: 5,
  },
  {
    name: "Марія Л.",
    role: "ТЗНК",
    text: "Спочатку боялася логічних завдань, але після розборів усе стало системним. Дуже рекомендую!",
    rating: 5,
  },
  {
    name: "Андрій П.",
    role: "Вступив в аспірантуру",
    text: "Індивідуальний план і живі заняття — саме те, що потрібно для серйозної підготовки. Дякую команді!",
    rating: 5,
  },
];

export const universities: string[] = [
  "КНУ ім. Шевченка",
  "КПІ ім. Сікорського",
  "НаУКМА",
  "ЛНУ ім. Франка",
  "ХНУ ім. Каразіна",
  "КНЕУ",
  "НУ «Львівська політехніка»",
  "ОНУ ім. Мечникова",
];

export type ExamEvent = {
  date: string;
  title: string;
  note?: string;
};

export const examSchedule: ExamEvent[] = [
  { date: "Лютий 2026", title: "Старт реєстрації на пробні іспити" },
  { date: "Березень 2026", title: "Реєстрація вступників", note: "не пропустіть дедлайн!" },
  { date: "Травень 2026", title: "Основна сесія ТЗНК та ЄВІ" },
  { date: "Червень 2026", title: "ЄФВВ та фахові іспити" },
  { date: "Липень 2026", title: "Подача заяв до магістратури" },
];

export type Faq = {
  q: string;
  a: string;
};

export const faqs: Faq[] = [
  {
    q: "Чи підходить курс, якщо я починаю з нуля?",
    a: "Так. Ми починаємо з базового рівня та поступово доводимо вас до результату, потрібного для вступу. Перед стартом ви проходите безкоштовне тестування рівня.",
  },
  {
    q: "Як проходять заняття?",
    a: "Заняття проходять онлайн у форматі живих груп у Zoom. Усі уроки записуються, тож ви завжди можете переглянути матеріал ще раз на нашій платформі.",
  },
  {
    q: "Що буде, якщо я пропущу заняття?",
    a: "Нічого страшного — ви отримуєте запис заняття та матеріали. Куратор допоможе наздогнати групу та відповість на питання.",
  },
  {
    q: "Чи є розстрочка на оплату?",
    a: "Так, доступна оплата частинами від банків-партнерів, а також гнучкі тарифи для різних бюджетів.",
  },
  {
    q: "Чи допоможете з подачею документів?",
    a: "Ми консультуємо щодо дедлайнів, переліку документів та стратегії вступу до обраних університетів.",
  },
];

export type NavItem = { label: string; href: string };

export const navItems: NavItem[] = [
  { label: "Курси", href: "#courses" },
  { label: "Чому ми", href: "#why" },
  { label: "Як навчаємось", href: "#steps" },
  { label: "Відгуки", href: "#reviews" },
  { label: "Розклад", href: "#schedule" },
  { label: "FAQ", href: "#faq" },
];

export const stats = [
  { value: "93%", label: "наших студентів вступають" },
  { value: "150+", label: "годин практики на курсі" },
  { value: "5 000+", label: "випускників за 5 років" },
  { value: "4.9", label: "середня оцінка курсів" },
];
