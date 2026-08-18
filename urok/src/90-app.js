/* ══════════════════════════════════════════════════════════════════
   UROK+ · КОРІНЬ
   ------------------------------------------------------------------
   Навігація: чотири вкладки + стек екранів поверх них. Стек живе в
   стані, а не в URL: застосунок мобільний, а системна кнопка
   «назад» під'єднана через history — так на Android і в браузері
   жест назад працює очікувано.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Toaster, useStore, A, sel, makeT, applyTheme, applyLang,
  AuthFlow, Onboarding,
  CalendarScreen, LessonFormScreen, LessonScreen,
  StudentsScreen, StudentFormScreen, StudentScreen,
  MarketScreen, MarketItemScreen,
  ProfileScreen, ProfileEditScreen, SettingsScreen, PremiumScreen, SubscriptionScreen,
  ContestScreen, TextScreen, HelpScreen,
  HomeworkScreen, HomeworkCardScreen, HomeworkFormScreen, FinanceScreen,
} = window.U;

const TABS = [
  {id: 'calendar', key: 'nav.calendar', icon: Icon.calendar},
  {id: 'students', key: 'nav.students', icon: Icon.users},
  {id: 'market', key: 'nav.market', icon: Icon.bag},
  {id: 'profile', key: 'nav.profile', icon: Icon.user},
];

const SCREENS = {
  'lesson': LessonScreen,
  'lesson-new': LessonFormScreen,
  'lesson-edit': LessonFormScreen,
  'student': StudentScreen,
  'student-new': StudentFormScreen,
  'student-edit': StudentFormScreen,
  'market-item': MarketItemScreen,
  'homework': props => (props.params && props.params.id
    ? <HomeworkCardScreen {...props} /> : <HomeworkScreen {...props} />),
  'homework-new': HomeworkFormScreen,
  'homework-edit': HomeworkFormScreen,
  'finance': FinanceScreen,
  'settings': SettingsScreen,
  'profile-edit': ProfileEditScreen,
  'premium': PremiumScreen,
  'subscription': SubscriptionScreen,
  'contest': ContestScreen,
  'rating': props => <ContestScreen {...props} params={{mode: 'rating'}} />,
  'help': HelpScreen,
  'privacy': props => <TextScreen {...props} titleKey="lg.privacyTitle" textKey="lg.privacyText" />,
  'terms': props => <TextScreen {...props} titleKey="lg.termsTitle" textKey="lg.termsText" />,
};

const TAB_SCREENS = {
  calendar: CalendarScreen,
  students: StudentsScreen,
  market: MarketScreen,
  profile: ProfileScreen,
};

/* Навігація окремою функцією, а не всередині App: так її видно з
   тестів — а перевіряти тут є що, бо стек і history мають рухатись
   разом, але кожен лише на один крок. */
function createNav(setStack, setTab, win){
  const history = win && win.history;
  /* У вбудованій сторінці (iframe без same-origin) history кидає
     виняток. Навігація по стеку від цього не залежить, тому просто
     працюємо далі без системної кнопки «назад». */
  const safe = fn => { try { return fn(); } catch (e) { return undefined; } };
  const own = () => !!safe(() => history && history.state && history.state.urok);
  return {
    push(route){
      setStack(st => [...st, route]);
      if (history) safe(() => history.pushState({urok: 1}, ''));
    },
    replace(route){ setStack(st => [...st.slice(0, -1), route]); },
    /* Якщо запис у history наш — знімаємо його, а стек зменшить
       обробник popstate. Знімати вручну й тут, і там означало б
       повертатись одразу на два екрани назад. */
    back(){
      if (own()) safe(() => history.back());
      else setStack(st => st.slice(0, -1));
    },
    reset(){ setStack([]); },
    go(nextTab){ setStack([]); setTab(nextTab); },
  };
}

function BottomNav({t, tab, onTab}){
  return (
    <nav className="nav">
      <div className="inner">
        {TABS.map(x => {
          const I = x.icon;
          return (
            <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => onTab(x.id)}
                    aria-current={tab === x.id ? 'page' : undefined}>
              <I size={23} stroke={tab === x.id ? 2.1 : 1.85} />
              <span>{t(x.key)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function App(){
  const s = useStore();
  const t = React.useMemo(() => makeT(s.settings.lang), [s.settings.lang]);
  const [tab, setTab] = React.useState('calendar');
  const [stack, setStack] = React.useState([]);

  /* тема: реагуємо і на вибір користувача, і на зміну системної */
  React.useEffect(() => {
    applyTheme(s.settings.theme);
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(window.U.store.get().settings.theme);
    if (mq.addEventListener) { mq.addEventListener('change', onChange); return () => mq.removeEventListener('change', onChange); }
    if (mq.addListener) { mq.addListener(onChange); return () => mq.removeListener(onChange); }
  }, [s.settings.theme]);

  React.useEffect(() => { applyLang(s.settings.lang); }, [s.settings.lang]);

  /* системна кнопка «назад» */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    const onPop = () => setStack(st => st.slice(0, -1));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const nav = React.useMemo(
    () => createNav(setStack, setTab, typeof window !== 'undefined' ? window : null), []);

  /* Повторний дотик по активній вкладці повертає її в корінь —
     звична поведінка iOS, яку помічають, лише коли її немає. */
  const onTab = id => { if (id === tab) setStack([]); else { setStack([]); setTab(id); } };

  if (s.auth.status !== 'authed') return (
    <>
      <AuthFlow t={t} onDone={() => {}} />
      <Toaster />
    </>
  );
  if (!s.onboarded) return (
    <>
      <Onboarding t={t} onDone={() => A.finishOnboarding()} />
      <Toaster />
    </>
  );

  const top = stack[stack.length - 1];
  const Tab = TAB_SCREENS[tab] || CalendarScreen;
  const Screen = top ? SCREENS[top.name] : null;

  return (
    <>
      {top && Screen
        ? <Screen key={top.name + (top.params && top.params.id || '') + stack.length} t={t} s={s} nav={nav} params={top.params || {}} />
        : <Tab t={t} s={s} nav={nav} />}
      {!top ? <BottomNav t={t} tab={tab} onTab={onTab} /> : null}
      <Toaster />
    </>
  );
}

if (typeof document !== 'undefined' && document.getElementById('root')){
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
}

Object.assign(window.U, {App, BottomNav, createNav, TABS, SCREENS, TAB_SCREENS});
})();
