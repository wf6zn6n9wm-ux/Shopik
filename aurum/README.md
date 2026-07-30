# AURUM — Cloud Mining Reactor

Telegram Mini App нового поколения: премиальный FinTech-продукт, в котором
пользователь наблюдает за работой виртуального облачного дата-центра. Ощущение
живого, дорогого, технологичного продукта — **не** казино.

Вдохновение по механике: приложения вроде StarStake. Дизайн и бренд —
полностью оригинальные (чёрный + золото, OLED, glassmorphism).

Открывается по прямой ссылке `/aurum/`. Самодостаточный `index.html`
(React 18 + Babel-standalone + inline SVG-иконки, без сборки), работает внутри
Telegram WebView. Деплой на Vercel — как у соседних мини-аппов (`shark`,
`para`, `profit`).

---

## Дизайн-система

### Палитра
| Токен | Значение | Роль |
|---|---|---|
| `--bg` | `#050505` | OLED-фон |
| `--ink` / `--ink-dim` / `--ink-mute` | `#f5f5f7` / `#a9a9b2` / `#6a6a72` | текст |
| `--gold` | `#f3c765` | основной акцент |
| `--gold-hi` / `--gold-deep` | `#ffe6a6` / `#c9982f` | блик / тень золота |
| `--pos` / `--neg` / `--info` | `#46e0a0` / `#ff6b6b` / `#59b4ff` | семантика |
| `--glass` / `--stroke` | `rgba(255,255,255,.045)` / `.08` | стекло / границы |

Золото используется как градиент (`--gold-hi → --gold → --gold-deep`) с мягким
свечением (`box-shadow`/`drop-shadow` на `--gold-glow`). Зелёный — только для
позитивной дельты.

### Типографика
- **Sora** — дисплей, крупные числа, счётчики (`.display`).
- **Manrope** — весь UI-текст.
- Все числа — `tabular-nums` + отрицательный трекинг (`.num`) для «финтех»-ритма.

### Геометрия и ритм
Радиусы `12 / 18 / 24 / 30 / 999`. 4-pt сетка, большие отступы (20–28px),
максимальная ширина оболочки `480px` (центрируется на планшете/десктопе).
Safe-area (`env(safe-area-inset-*)`) для верхней/нижней зон Telegram.

### Компоненты
`Card` (стекло + sheen), `Chip` / `Chip.gold`, `Btn.primary` (золото + sweep-блик)
/ `Btn.ghost`, `Reactor`, `StatRow`, `QuickActions`, `MineCard`, `BoostRow`,
`Segmented`, `RewardCalendar`, `LuckyWheel`, `Podium` + `LeaderRow`, `YieldChart`,
`ProfileCard`, `Toast`, `BottomNav` (5 вкладок, центральная — приподнята).

### Анимации (60 FPS, только transform/opacity)
- **Реактор**: 3 вращающихся кольца (разные скорости/направления), кольцо-прогресс
  обратного отсчёта, `<canvas>` система частиц по орбите, дышащее золотое свечение.
- **Счётчики**: баланс растёт каждый кадр (rAF пишет в DOM напрямую, без ре-рендера React).
- **Micro**: ripple, glow, sweep на кнопках, floating `+amount` при начислении,
  shimmer на прогресс-барах, spring-переходы экранов, toast in/out с blur.
- **Lucky Wheel**: физика вращения (cubic-bezier «замедление»), конфетти на `<canvas>`.
- Тактильная отдача через `Telegram.WebApp.HapticFeedback` на всех действиях.

---

## Архитектура экранов
Нижняя навигация — 5 вкладок: **Реактор · Ферма · Буст · Топ · Профиль**.
Остальные экраны доступны из главного и шапки, всего 9:

1. **Реактор** (главный) — реактор, живой баланс, Yield/Hash/Uptime, быстрые действия, превью инфраструктуры.
2. **Майнинг** — ASIC, GPU Cluster, Power Grid, Cooling, Solar Farm, AI Optimization (уровень, эффективность, апгрейд).
3. **Буст** — Turbo, Quantum Boost, AI Optimizer, Battery Backup, Satellite Node.
4. **Задания** — Daily / Weekly / Achievements / Referral + календарь наград.
5. **Lucky Wheel** — 3D-колесо, физика вращения, конфетти.
6. **Топ** — Today / Week / Month / Friends / Country, подиум + карточки.
7. **Кошелёк** — обзор, история, статистика, график доходности, пополнение/вывод.
8. **Профиль** — премиум-карточка, level/XP, badges, mining power, рефералы, достижения.
9. **Уведомления** — лента toast-событий с blur, иконками, свечением.

Точки входа: шапка (баланс → Кошелёк, колокол → Уведомления), быстрые действия
на главном (Пополнить/Ролл/Задания/Буст).

### Состояния
Загрузка/пусто → `.empty-hint`; активная вкладка сегмента; заблокированные дни
календаря/бейджи (`.locked` / `.lock`); прогресс-бары заданий и апгрейдов;
позитив/негатив транзакций.

---

## Экономический движок (демо)
Единый `requestAnimationFrame`-цикл: баланс аккумулируется каждый кадр
(`RATE ★/сек`), кольцо обратного отсчёта на 10-секундный `CYCLE`, по завершении —
payout-событие (haptic + floating-число + toast). Числа пишутся в DOM через refs,
поэтому React не ре-рендерится на каждом кадре — стабильные 60 FPS.

Реальные данные подключаются позже (serverless `api/` + Supabase, как в соседних
мини-аппах) — экраны уже спроектированы под подстановку живых значений.

---

## Перенос на Flutter (спецификация)
Дизайн-система транслируется 1:1, если продукт понадобится нативно:

| Web | Flutter |
|---|---|
| CSS-токены | `ThemeData` + `ColorScheme` (seed `#f3c765`, `Brightness.dark`) |
| `.display` / `.num` | `google_fonts` Sora/Manrope, `FontFeature.tabularFigures()` |
| glassmorphism | `BackdropFilter(ImageFilter.blur)` + полупрозрачный `Container` |
| вращения/частицы | `CustomPainter` + `AnimationController` (repeat) / `Ticker` |
| реактор-прогресс | `CustomPainter` арка + `TweenAnimationBuilder` |
| счётчик баланса | `AnimatedBuilder` над `Ticker`, без `setState` каждый кадр |
| конфетти | `confetti` пакет или `CustomPainter`-particles |
| haptics | `HapticFeedback.lightImpact()` и т.п. |
| навигация | `IndexedStack` + кастомный `BottomBar`, `Hero` для переходов |

---

## Запуск локально
Статичный файл — открыть `aurum/index.html` в браузере или отдать любым
статик-сервером (`python3 -m http.server`). Внутри Telegram — задать URL
`…/aurum/` как Mini App в BotFather.
