/* ══════════════════════════════════════════════════════════════════
   UROK+ · МАРКЕТ
   ------------------------------------------------------------------
   Каталог матеріалів для занять. Зараз дані статичні — це вітрина
   майбутнього маркетплейсу: та сама структура полів, що піде з
   сервера (id, категорія, автор, ціна, вміст), тому екран не
   доведеться переписувати, лише замінити джерело.
   ══════════════════════════════════════════════════════════════════ */
window.U = window.U || {};

/* Модуль у власній області: окремі <script> ділять глобальний
   лексичний простір, тому однакові імена в двох файлах — це
   SyntaxError ще до першого кадру. */
(function(){

const {
  Icon, Avatar, Btn, IconBtn, Card, SectionHead, Row, Empty, Sheet, StackBar, AppBar, toast,
  A, sel, fmtMoney, currencySymbol,
} = window.U;

const MARKET_CATS = ['english', 'math', 'music', 'ukrainian', 'games', 'kids'];

/* Обкладинка — не картинка, а градієнт + емодзі: важить нуль,
   виглядає однаково добре в обох темах і не блимає при завантаженні. */
const ITEMS = [
  {
    id: 'mc-past-simple', cat: 'games', emoji: '⛏️', price: 149, author: 'Kate Lysenko',
    grad: ['#3B82F6', '#1D4ED8'], badge: 'popular',
    title: {uk: 'Minecraft + Past Simple', ru: 'Minecraft + Past Simple', en: 'Minecraft + Past Simple'},
    desc: {
      uk: 'Заняття для підлітків: будуємо світ і водночас відпрацьовуємо минулий час.',
      ru: 'Занятие для подростков: строим мир и одновременно отрабатываем прошедшее время.',
      en: 'A lesson for teens: build a world while drilling the past simple.',
    },
    includes: {
      uk: ['12 слайдів', 'Робочий аркуш PDF', 'Список слів', 'Домашнє завдання'],
      ru: ['12 слайдов', 'Рабочий лист PDF', 'Список слов', 'Домашнее задание'],
      en: ['12 slides', 'PDF worksheet', 'Word list', 'Homework'],
    },
  },
  {
    id: 'hp-past-simple', cat: 'english', emoji: '⚡', price: 199, author: 'Kate Lysenko',
    grad: ['#A855F7', '#6D28D9'], badge: 'popular',
    title: {uk: 'Harry Potter + Past Simple', ru: 'Harry Potter + Past Simple', en: 'Harry Potter + Past Simple'},
    desc: {
      uk: 'Уривки з книги, завдання на час і фінальна вікторина. Рівень A2–B1.',
      ru: 'Отрывки из книги, задания на время и финальная викторина. Уровень A2–B1.',
      en: 'Book excerpts, tense drills and a final quiz. Level A2–B1.',
    },
    includes: {
      uk: ['18 слайдів', '3 робочі аркуші', 'Аудіо', 'Вікторина'],
      ru: ['18 слайдов', '3 рабочих листа', 'Аудио', 'Викторина'],
      en: ['18 slides', '3 worksheets', 'Audio', 'Quiz'],
    },
  },
  {
    id: 'vocal-basics', cat: 'music', emoji: '🎤', price: 250, author: 'Andrii Hlushko',
    grad: ['#EC4899', '#BE185D'],
    title: {uk: 'Урок вокалу', ru: 'Урок вокала', en: 'Vocal lesson'},
    desc: {
      uk: 'Розспівки, дихання, робота з мікрофоном. Готовий план на 60 хвилин.',
      ru: 'Распевки, дыхание, работа с микрофоном. Готовый план на 60 минут.',
      en: 'Warm-ups, breathing and mic technique. A ready 60-minute plan.',
    },
    includes: {
      uk: ['План заняття', '8 вправ', 'Аудіо-розспівки', 'Чек-ліст прогресу'],
      ru: ['План занятия', '8 упражнений', 'Аудио-распевки', 'Чек-лист прогресса'],
      en: ['Lesson plan', '8 exercises', 'Warm-up audio', 'Progress checklist'],
    },
  },
  {
    id: 'math-fractions', cat: 'math', emoji: '➗', price: 0, author: 'Urok+ Team',
    grad: ['#22C55E', '#15803D'], badge: 'new',
    title: {uk: 'Дроби без страху', ru: 'Дроби без страха', en: 'Fractions without fear'},
    desc: {
      uk: 'Пояснення на піці й шоколадці, 30 задач із відповідями. 5–6 клас.',
      ru: 'Объяснение на пицце и шоколадке, 30 задач с ответами. 5–6 класс.',
      en: 'Explained with pizza and chocolate, 30 problems with answers. Ages 10–12.',
    },
    includes: {
      uk: ['Конспект', '30 задач', 'Відповіді', 'Картки для друку'],
      ru: ['Конспект', '30 задач', 'Ответы', 'Карточки для печати'],
      en: ['Notes', '30 problems', 'Answer key', 'Printable cards'],
    },
  },
  {
    id: 'math-zno', cat: 'math', emoji: '📐', price: 320, author: 'Olena Kravets',
    grad: ['#F5A524', '#B45309'],
    title: {uk: 'Математика: підготовка до НМТ', ru: 'Математика: подготовка к экзамену', en: 'Maths: exam prep'},
    desc: {
      uk: 'Повний курс на 10 занять: теми, типові пастки, пробний тест.',
      ru: 'Полный курс на 10 занятий: темы, типичные ловушки, пробный тест.',
      en: 'A full 10-lesson course: topics, common traps, mock test.',
    },
    includes: {
      uk: ['10 планів занять', '120 задач', 'Пробний тест', 'Таблиця прогресу'],
      ru: ['10 планов занятий', '120 задач', 'Пробный тест', 'Таблица прогресса'],
      en: ['10 lesson plans', '120 problems', 'Mock test', 'Progress sheet'],
    },
  },
  {
    id: 'ukr-diktant', cat: 'ukrainian', emoji: '✍️', price: 120, author: 'Iryna Savchuk',
    grad: ['#14B8A6', '#0F766E'],
    title: {uk: 'Диктанти й правопис', ru: 'Диктанты и правописание', en: 'Dictations and spelling'},
    desc: {
      uk: '20 диктантів різного рівня з поясненням кожного правила.',
      ru: '20 диктантов разного уровня с объяснением каждого правила.',
      en: '20 dictations of varying difficulty with every rule explained.',
    },
    includes: {
      uk: ['20 текстів', 'Аудіо-начитка', 'Пояснення правил', 'Робота над помилками'],
      ru: ['20 текстов', 'Аудио-начитка', 'Объяснение правил', 'Работа над ошибками'],
      en: ['20 texts', 'Audio readings', 'Rule explanations', 'Error correction'],
    },
  },
  {
    id: 'kids-abc', cat: 'kids', emoji: '🐣', price: 0, author: 'Urok+ Team',
    grad: ['#6366F1', '#3730A3'], badge: 'new',
    title: {uk: 'Абетка в іграх', ru: 'Азбука в играх', en: 'Alphabet games'},
    desc: {
      uk: 'Перші заняття з дошкільнятами: 15 ігор на 5–7 хвилин кожна.',
      ru: 'Первые занятия с дошкольниками: 15 игр по 5–7 минут каждая.',
      en: 'First lessons with preschoolers: 15 games, 5–7 minutes each.',
    },
    includes: {
      uk: ['15 ігор', 'Картки для друку', 'Поради батькам'],
      ru: ['15 игр', 'Карточки для печати', 'Советы родителям'],
      en: ['15 games', 'Printable cards', 'Tips for parents'],
    },
  },
  {
    id: 'speaking-club', cat: 'english', emoji: '💬', price: 180, author: 'Mark Doroshenko',
    grad: ['#0EA5E9', '#0369A1'],
    title: {uk: 'Speaking club: 30 тем', ru: 'Speaking club: 30 тем', en: 'Speaking club: 30 topics'},
    desc: {
      uk: 'Питання, лексика й фрази-помічники для розмовних занять B1–B2.',
      ru: 'Вопросы, лексика и фразы-помощники для разговорных занятий B1–B2.',
      en: 'Questions, vocabulary and helper phrases for B1–B2 conversation classes.',
    },
    includes: {
      uk: ['30 тем', 'Картки з питаннями', 'Лексика до кожної теми'],
      ru: ['30 тем', 'Карточки с вопросами', 'Лексика к каждой теме'],
      en: ['30 topics', 'Question cards', 'Vocabulary per topic'],
    },
  },
  {
    id: 'guitar-start', cat: 'music', emoji: '🎸', price: 220, author: 'Andrii Hlushko',
    grad: ['#EF4444', '#991B1B'],
    title: {uk: 'Гітара з нуля', ru: 'Гитара с нуля', en: 'Guitar from scratch'},
    desc: {
      uk: 'Перші 8 занять: акорди, бій, дві пісні наприкінці курсу.',
      ru: 'Первые 8 занятий: аккорды, бой, две песни в конце курса.',
      en: 'The first 8 lessons: chords, strumming, two songs by the end.',
    },
    includes: {
      uk: ['8 планів', 'Табулатури', 'Мінусовки'],
      ru: ['8 планов', 'Табулатуры', 'Минусовки'],
      en: ['8 plans', 'Tabs', 'Backing tracks'],
    },
  },
];

const itemText = (item, field, t) => (item[field] || {})[t.lang] || (item[field] || {}).uk || '';

function MarketCard({item, t, s, onClick}){
  const owned = s.library.some(x => x.id === item.id);
  return (
    <button className="mcard" onClick={onClick}>
      <div className="mcover" style={{background: `linear-gradient(135deg, ${item.grad[0]}, ${item.grad[1]})`}}>
        <span className="em">{item.emoji}</span>
        {item.badge ? <span className="tag">{t('mk.' + item.badge)}</span> : null}
      </div>
      <div className="body">
        <div className="cat ellip">{t('mk.cat.' + item.cat)}</div>
        <div className="t">{itemText(item, 'title', t)}</div>
        <div className="d">{itemText(item, 'desc', t)}</div>
        <div className="foot">
          <span className={'price' + (item.price ? '' : ' free')}>
            {item.price ? fmtMoney(item.price, s.settings.currency) : t('mk.free')}
          </span>
          {owned
            ? <span className="owned"><Icon.check size={17} stroke={3} /></span>
            : <span className="auth">{item.author}</span>}
        </div>
      </div>
    </button>
  );
}

function MarketScreen({t, s, nav}){
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');

  const needle = q.trim().toLowerCase();
  const list = ITEMS.filter(item => {
    if (cat !== 'all' && item.cat !== cat) return false;
    if (!needle) return true;
    return (itemText(item, 'title', t) + ' ' + itemText(item, 'desc', t) + ' ' + item.author)
      .toLowerCase().includes(needle);
  });
  const owned = s.library.map(x => ITEMS.find(i => i.id === x.id)).filter(Boolean);

  return (
    <div className="app tabs">
      <AppBar title={t('mk.header')} sub={t('mk.demoNote')} />
      <div className="screen">
        <div className="search">
          <Icon.search size={18} />
          <input className="inp" value={q} placeholder={t('mk.search')} onChange={e => setQ(e.target.value)} />
        </div>

        <div className="chips" style={{marginTop: 14, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2}}>
          <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>{t('mk.all')}</button>
          {MARKET_CATS.map(c => (
            <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}
                    style={{flex: 'none'}}>{t('mk.cat.' + c)}</button>
          ))}
        </div>

        {owned.length ? (
          <>
            <SectionHead title={t('mk.library')} action={String(owned.length)} />
            <div className="rows">
              {owned.map(item => (
                <Row key={item.id} title={itemText(item, 'title', t)} sub={item.author} chevron
                     avatar={<span style={{width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center',
                                           fontSize: 20, flex: 'none',
                                           background: `linear-gradient(135deg, ${item.grad[0]}, ${item.grad[1]})`}}>{item.emoji}</span>}
                     onClick={() => nav.push({name: 'market-item', params: {id: item.id}})} />
              ))}
            </div>
          </>
        ) : null}

        <SectionHead title={cat === 'all' ? t('mk.title') : t('mk.cat.' + cat)}
                     action={list.length ? String(list.length) : null} />
        {list.length ? (
          <div className="grid2">
            {list.map(item => (
              <MarketCard key={item.id} item={item} t={t} s={s}
                          onClick={() => nav.push({name: 'market-item', params: {id: item.id}})} />
            ))}
          </div>
        ) : (
          <Empty icon={<Icon.search size={34} />} title={t('mk.emptyT')} text={t('mk.emptyD')} />
        )}
      </div>
    </div>
  );
}

function MarketItemScreen({t, s, nav, params}){
  const item = ITEMS.find(i => i.id === params.id);
  if (!item) return (
    <div className="app stack">
      <StackBar t={t} title={t('mk.title')} onBack={nav.back} />
      <div className="screen"><Empty icon={<Icon.bag size={34} />} title={t('c.noData')} /></div>
    </div>
  );
  const owned = s.library.some(x => x.id === item.id);
  const includes = (item.includes || {})[t.lang] || item.includes.uk;

  const buy = () => {
    A.addToLibrary(item.id, item.price);
    toast(t('mk.bought'));
  };

  return (
    <div className="app stack">
      <StackBar t={t} title={t('mk.title')} onBack={nav.back} />
      <div className="screen">
        <div style={{borderRadius: 'var(--r-lg)', padding: '30px 20px', textAlign: 'center', color: '#fff',
                     background: `linear-gradient(135deg, ${item.grad[0]}, ${item.grad[1]})`,
                     boxShadow: 'var(--shadow-2)'}}>
          <div style={{fontSize: 60, lineHeight: 1}}>{item.emoji}</div>
          <div className="dsp" style={{fontSize: 23, fontWeight: 800, letterSpacing: '-.04em', marginTop: 14}}>
            {itemText(item, 'title', t)}
          </div>
          <div style={{fontSize: 13.5, fontWeight: 600, opacity: .85, marginTop: 6}}>
            {t('mk.author')}: {item.author}
          </div>
        </div>

        <SectionHead title={t('mk.about')} />
        <Card><div style={{fontSize: 14.5, lineHeight: 1.55}}>{itemText(item, 'desc', t)}</div></Card>

        <SectionHead title={t('mk.includes')} />
        <Card>
          {includes.map((x, i) => (
            <div className="feat" key={i} style={{padding: '7px 0'}}>
              <span className="ck"><Icon.check size={13} stroke={3} /></span>
              <span style={{fontSize: 14.5, fontWeight: 600}}>{x}</span>
            </div>
          ))}
        </Card>

        <div style={{display: 'flex', gap: 8, marginTop: 18, alignItems: 'center'}}>
          <span className="pill acc">{t('mk.cat.' + item.cat)}</span>
          {item.badge ? <span className="pill">{t('mk.' + item.badge)}</span> : null}
          <span className="pill">{t('c.demo')}</span>
        </div>
        <div className="barpad" />
      </div>

      <div className="fixedbar">
        {owned ? (
          <Btn kind="soft" size="lg" wide icon={<Icon.check size={19} stroke={3} />}>{t('mk.owned')}</Btn>
        ) : (
          <Btn kind="pri" size="lg" wide onClick={buy}>
            {item.price ? t('mk.buy', {price: fmtMoney(item.price, s.settings.currency)}) : t('mk.get')}
          </Btn>
        )}
      </div>
    </div>
  );
}

Object.assign(window.U, {MarketScreen, MarketItemScreen, MARKET_CATS, MARKET_ITEMS: ITEMS, itemText});
})();
