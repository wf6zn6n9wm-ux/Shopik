# Findoria — Hidden Objects (Unity 6, C#)

Оригинальная мобильная игра-искалка в жанре **Hidden Objects** для Android и iOS.
Чистая модульная архитектура, данные отделены от кода, расширяется без правок C#.

> Никаких чужих ассетов, названий, персонажей или интерфейсов. Стиль
> оригинальный — яркая мультяшная графика и дружелюбный UX. Графика/звук пока
> заглушки (см. `Assets/Art`, `Assets/Audio`) — вся логика реализована.

---

## Как открыть

1. Unity **6000.0.x** (Unity 6). Открыть папку `unity/` как проект.
2. Unity подтянет пакеты из `Packages/manifest.json` (Addressables, uGUI, TMP,
   Unity IAP, Services Core) и сгенерирует `Library/`, `.meta`, `.csproj`.
3. Собрать стартовую сцену по инструкции ниже (сцены `.unity` не входят в
   репозиторий, чтобы не коммитить хрупкий YAML — их собирают в редакторе за 5 минут).

Скрипты компилируются сразу; графика подключается ассетами и префабами.

---

## Архитектура

Слабая связность через **Event Bus** + **Dependency Injection** (ручной, без
рефлексии). Принципы SOLID/DRY, всё зависит от абстракций (`ServiceInterfaces.cs`).

```
GameBootstrap (композиционный корень)
   ├─ создаёт EventBus + ServiceContainer  → App.Bus / App.Resolve<T>()
   ├─ регистрирует реализации по интерфейсам
   └─ инициализирует (async) и показывает главное меню

Модули общаются ТОЛЬКО через интерфейсы сервисов и события.
```

- **Event Bus** (`Core/EventBus.cs`) — типобезопасные `Subscribe/Publish`.
- **DI** (`Core/ServiceContainer.cs`, `Core/App.cs`) — регистрация в бустрапе,
  доступ через `App.Resolve<T>()`.
- **Данные вне кода** — весь контент это ScriptableObject'ы (`Data/`) + импорт из
  JSON/CSV. Добавление уровня не требует изменения кода.

### Поток одного уровня

`WorldMap` → `IGameFlow.StartLevel(id)` → загрузка фона (Addressables/async) →
расстановка зон предметов из пула → верное нажатие (`ItemFoundEvent`, награда,
анимация) / промах (`WrongTapEvent`, минус «жизнь уровня») → все найдены →
`LevelCompletedEvent` (звёзды, награды, открытие следующего) → экран победы.

---

## Структура папок

```
Assets/
├─ Scripts/
│  ├─ Core/            App, EventBus, DI, интерфейсы, события, GameStateMachine, Bootstrap
│  ├─ Data/            ScriptableObjects (уровни/предметы/бустеры/…), PlayerData, DTO
│  ├─ Economy/         Wallet, Experience, Lives, Boosters, RewardService
│  ├─ Progression/     Save, Progress, Quests, Achievements, DailyReward, LoginStreak
│  ├─ Gameplay/        HiddenObjectSceneController (ядро цикла), HiddenItemView
│  ├─ Services/        LevelProvider, SpriteLoader, ObjectPool, Audio
│  ├─ UI/              UIManager + экраны (меню, карта, HUD, магазин, …)
│  ├─ Monetization/    AdService, PurchaseService, BattlePass (заглушки под SDK)
│  └─ Admin/           Импорт уровней из JSON/CSV в рантайме
├─ Editor/             Level Importer (окно), валидатор каталога
├─ UI/                 UI-префабы (собираются в редакторе)
├─ Art/                Графика (README со спецификацией ассетов)
├─ Audio/              Звук (README со списком клипов)
├─ Levels/             Исходники уровней (CSV) + сгенерированные ассеты
└─ Resources/          GameCatalog + Levels/levels.json (рантайм-контент)
Packages/manifest.json
ProjectSettings/ProjectVersion.txt
```

---

## Реализованные системы

| Категория | Что есть |
|-----------|----------|
| Игровой цикл | Карта → сцена → список предметов → находки/промахи → победа/поражение |
| Экономика | Монеты, кристаллы, опыт, уровни игрока (кривая в `GameConfig`) |
| Жизни | Лимит + восстановление по таймеру (переживает перезапуск) |
| Звёзды | 1–3 за время прохождения (пороги в данных уровня) |
| Достижения | Накопительные метрики + награды |
| Задания | Ежедневные и еженедельные, детерминированная ротация |
| Серия входов | Login streak по календарным дням |
| Ежедневные награды | Календарь наград с циклом |
| Бустеры | Подсказка, Магнит, Заморозка, Доп. жизнь, Лупа |
| Монетизация | Rewarded / Interstitial / Banner, Remove Ads (IAP), наборы, Battle Pass |
| Сохранения | Локально (JSON) + шов для Cloud Save (`ICloudBackend`) |
| Оптимизация | Object Pooling, Addressables, async-загрузка, экономия памяти |
| Анимации | Появление, scale/bounce, подсветка подсказки (`HiddenItemView`) |

---

## Данные отдельно от кода

Контент — `ScriptableObject`'ы, собранные в один **`GameCatalog`**
(`Assets/Resources/GameCatalog.asset`, создать через *Create → Findoria → Game Catalog*):

- `GameConfig` — жизни, кривая опыта, стартовый баланс, частота рекламы.
- `WorldData` / `LevelData` — миры и уровни (иллюстрация, координаты предметов,
  сложность, награды, пороги звёзд).
- `HiddenItemData`, `BoosterData`, `ShopItemData`.
- `QuestDefinition`, `AchievementDefinition`, `DailyRewardTable`.

### Добавить уровень без кода

**Вариант A — редактор.** *Findoria → Level Importer* → «Импорт JSON…» или
«Импорт CSV…». Инструмент создаёт ассеты `LevelData` в `Assets/Levels/Generated/`,
**автоматически генерирует список предметов** (`RequiredItems`) из координат и
создаёт недостающие `HiddenItemData`. Можно сразу дописать их в выбранный `GameCatalog`.

**Вариант B — рантайм JSON.** Положить уровни в `Assets/Resources/Levels/levels.json`
(формат — `Assets/Resources/Levels/levels.json`, схема = `LevelPackDto`) и включить
в `GameBootstrap` галочку *Load Runtime Json Levels* — грузятся без пересборки.

**CSV-схема:** одна строка = одно размещение предмета, группировка по `levelId`;
мета-колонки уровня указываются в любой его строке. Пример —
`Assets/Levels/sample_levels.csv`.

---

## Сборка стартовой сцены (однократно, в редакторе)

1. Новая сцена `Bootstrap`. Пустой объект `GameBootstrap` → компонент
   `GameBootstrap`, назначить `GameCatalog`.
2. `Canvas` (Screen Space – Overlay, Canvas Scaler = *Scale With Screen Size*,
   1080×1920). Внутри — объект `UIManager` + по объекту на каждый экран
   (`MainMenuScreen`, `WorldMapScreen`, `GameHudScreen`, `ShopScreen`,
   `SettingsScreen`, `WinScreen`, `LoseScreen`, `DailyRewardScreen`, `ProfileScreen`).
   Заполнить у `UIManager` список экранов; в бустрапе поле *Navigation* = `UIManager`.
3. Объект `AudioService` (2× `AudioSource`) → поле *Audio* в бустрапе. Заполнить
   банк клипов (см. `Assets/Audio/README.md`).
4. Игровой экран: `RectTransform` доски + `Image` фона + невидимая кнопка-ловушка
   промахов + префаб зоны предмета (`HiddenItemView`) → назначить в
   `HiddenObjectSceneController`; сам контроллер → поле *Scene Controller* бустрапа.
5. Для тяжёлых фонов включить символ `FINDORIA_ADDRESSABLES` и пометить спрайты как
   Addressable (адрес = `Background` уровня). Без него работает загрузка из `Resources`.

---

## Точки расширения (швы)

- **Cloud Save** — реализовать `ICloudBackend` (Unity Cloud Save / Google Play /
  iCloud) и передать в `LocalSaveService`.
- **Реклама** — заменить `Monetization/AdService` на адаптер AdMob/LevelPlay
  (интерфейс `IAdService` не меняется).
- **IAP** — в `PurchaseService` подключить Unity IAP (швы помечены в коде).

Всё остальное подключается к уже готовому графу зависимостей без переписывания.
