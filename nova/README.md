# Nova — Flutter (Этап 3, каркас)

CRM нового поколения для сферы услуг. Этот пакет — **технический каркас**:
дизайн-система в коде + слои данных + навигация + два живых экрана. Экраны
рендерятся на демо-данных и кликабельны; реальная БД и остальные экраны
навешиваются поверх без правок UI.

> Документы продукта: `../docs/ARCHITECTURE.md`, `../docs/DESIGN_SYSTEM.md`.

## Запуск

```bash
cd nova
flutter pub get
flutter run          # iOS / Android / desktop
```

Требуется Flutter ≥ 3.22 (Dart ≥ 3.4). Шрифт Inter пока тянется через
`google_fonts` (сеть при первом запуске); для офлайна и премиума — забандлить
Inter локально (раскомментировать секцию `fonts` в `pubspec.yaml`).

## Архитектура (слои)

```
lib/
├─ design/         дизайн-система в коде (источник — DESIGN_SYSTEM.md)
│  ├─ tokens.dart      Spacing (4pt), Radii, Motion — не зависят от темы
│  ├─ colors.dart      NovaColors + NovaShadows как ThemeExtension (light/dark)
│  ├─ typography.dart  AppTypography — 8 ступеней (Inter), tabular-цифры
│  └─ theme.dart       buildNovaTheme() + context.nova / context.shadows
├─ domain/         бизнес-модель, без Flutter/БД
│  ├─ models.dart      Client, Service, Staff, Appointment (+ статусы)
│  └─ repositories.dart  абстрактные контракты доступа к данным
├─ data/           источник данных (заменяем без правок UI)
│  ├─ seed.dart        демо-данные каркаса
│  ├─ in_memory_repositories.dart  in-memory реализация
│  └─ providers.dart   Riverpod-проводка (репозитории, день, сводка)
├─ ui/             переиспользуемые виджеты из токенов
│  ├─ nova_button.dart · status_pill.dart · stat_tile.dart
│  ├─ appointment_card.dart · client_row.dart · empty_state.dart · format.dart
├─ features/       экраны
│  ├─ today/       «Сегодня» (сводка + лента записей) — живой
│  ├─ clients/     «Клиенты» (поиск + список) — живой
│  ├─ create/      быстрая запись (bottom sheet) — живой
│  ├─ analytics/   «Обзор» — сводка (период-дашборд далее)
│  └─ menu/        «Меню» — разделы
├─ app/            app.dart (MaterialApp + темы) · shell.dart (нав + ➕)
└─ main.dart       ProviderScope + локали
```

## Принятые инженерные решения

- **State — Riverpod 2.x.** Реактивно, компиляторно безопасно, ложится на
  local-first и кэш. Экраны — `ConsumerWidget`, читают провайдеры.
- **Данные — Repository + in-memory сейчас, Drift/SQLite потом.** UI зависит от
  абстракций (`domain/repositories.dart`); замена источника не трогает экраны —
  меняется только `data/providers.dart`.
- **Дизайн-система — `ThemeExtension`.** Все токены доступны как
  `context.nova.accent`, `context.shadows.e1`. Ноль хардкод-значений в виджетах.
  Обе темы — первого класса (`ThemeMode.system`).
- **Навигация — кастомный shell** (4 таба + центральная ➕ → bottom sheet), точно
  под дизайн-систему. Deep-links через go_router — следующий слой.

## Что дальше (Этап 3.1+)

- Drift/SQLite + слой синхронизации (local-first, офлайн-очередь).
- go_router и deep-links (онлайн-запись, карточки).
- Остальные экраны из карты (`docs/ARCHITECTURE.md §6`).
- AI-слой (умные слоты, предсказание услуги, инсайты).
- Бандл Inter, иконочный набор, haptics, тесты.
