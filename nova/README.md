# Kavio — Flutter (финальная архитектура)

CRM нового поколения для сферы услуг. Offline-first SaaS, рассчитанный на
масштаб (миллионы пользователей) и долгосрочное расширение. Этот пакет —
рабочий каркас: дизайн-система в коде + полноценная БД + официальная навигация
+ живые экраны на реальном хранилище.

> Продуктовые документы: `../docs/ARCHITECTURE.md`, `../docs/DESIGN_SYSTEM.md`.

## Стек (зафиксирован)

| Слой | Технология | Почему |
|---|---|---|
| State | **Riverpod 2.x** | Реактивно, компиляторно безопасно, ложится на потоки БД |
| БД | **Drift (SQLite)** + `drift_flutter` | Полноценная local-first БД с первого дня, кроссплатформенно (вкл. web) |
| Навигация | **go_router** | Официальный стандарт: deep links, web-URL, масштабирование |
| Типографика | **Inter (локальный бандл)** | Полностью офлайн, без сети; веса через `fontVariations` |

## Запуск

```bash
cd kavio
flutter pub get
# 1) Кодогенерация Drift (обязательно перед первым запуском):
dart run build_runner build --delete-conflicting-outputs
# 2) Шрифт: положить assets/fonts/Inter-Variable.ttf (см. assets/fonts/README.md)
flutter run   # iOS / Android / web / desktop
```

Требуется Flutter ≥ 3.22 (Dart ≥ 3.4). `database.g.dart` генерируется build_runner'ом
и не коммитится (см. `.gitignore`). Без файла Inter приложение работает на системном
шрифте (офлайн, без ошибок); с ним — типографика пиксель-в-пиксель.

## Архитектура (слои)

> Платформенный фундамент и карта расширяемости: `../docs/PLATFORM_ARCHITECTURE.md`.

```
lib/
├─ core/           платформенное ядро (ports & adapters) — не зависит от фич
│  ├─ config/          AppConfig + флейворы (dev/staging/prod)
│  ├─ platform/        PlatformCapabilities (web/desktop/mobile)
│  ├─ localization/    localeProvider (i18n)
│  ├─ bootstrap.dart   последовательность старта
│  └─ services/        ПОРТЫ + дефолтные (no-op/local) реализации:
│     auth · billing · subscriptions · push · remote_config(flags) ·
│     analytics(+crash) · ai · sync · api · data_transfer(export/import)
├─ modules/        модульная навигация: фича = модуль (маршруты + вкладки)
│  ├─ app_module.dart · registry.dart · crm/crm_module.dart
├─ l10n/           app_en.arb · app_ru.arb (генерация → app_localizations.dart)
├─ design/         дизайн-система в коде (источник — DESIGN_SYSTEM.md)
│  ├─ tokens.dart · colors.dart (ThemeExtension) · typography.dart · theme.dart
├─ domain/         бизнес-модель, без Flutter/БД
│  ├─ models.dart        Client, Service, Staff, Appointment (+ статусы)
│  └─ repositories.dart  контракты (Stream/Future) — UI зависит только от них
├─ data/           источник данных
│  ├─ db/database.dart              Drift-схема (мультиарендная) + запросы + сид
│  ├─ repositories/drift_repositories.dart  реализация контрактов поверх Drift
│  └─ providers.dart                Riverpod: БД, репозитории, потоки, сводка
├─ ui/             переиспользуемые виджеты из токенов
│  ├─ kavio_button · status_pill · stat_tile · appointment_card · client_row
│  ├─ empty_state · error_view · skeleton · format
├─ features/       экраны (Consumer, реактивные потоки: loading/error/empty)
│  ├─ today/ · clients/ · create/ · analytics/ · menu/
├─ app/            app.dart (MaterialApp.router) · router.dart (go_router)
│  └─ scaffold_with_nav.dart (нижний бар + ➕)
└─ main.dart       ProviderScope + локали
```

## Мультиарендность с первого дня

Схема БД несёт `businessId` на каждой сущности + таблицы `Businesses`,
`Locations`, `StaffMembers`. Это фундамент под **команды, филиалы, роли и
подписки** — они добавляются как данные/права, без переделки архитектуры.

## Рассчитано на масштаб и расширение

| Ось роста | Как заложено |
|---|---|
| **Команды** | `StaffMembers` + `businessId`; роли/права — слой поверх |
| **Филиалы** | `Locations` per business; фильтрация запросов по локации |
| **Роли и права** | таблица ролей + policy-слой над репозиториями (следующий шаг) |
| **Подписки** | биллинг-сущности per business; фичефлаги в data-слое |
| **Синхронизация** | Drift local-first + слой синка (outbox/CRDT) — репозитории не меняются |
| **Аналитика** | всё выводимо из Appointments/Sales; SQL-агрегации в Drift |
| **Marketplace услуг** | публичный каталог `Services`/`Businesses` + discovery поверх той же схемы |
| **API** | доменные модели + репозитории = готовый контракт для REST/GraphQL-гейта |
| **Web-версия** | go_router (URL-маршруты) + drift_flutter (web-БД) — та же кодовая база |

**Принцип масштабируемости:** UI зависит от абстракций (`domain/repositories.dart`);
источник данных, синхронизация, права и транспорт меняются под капотом, не трогая
экраны. Схема нейтральна к сфере услуг (`Business.industry` — конфигурация).

## Что дальше

- Слой синхронизации (outbox + сервер), auth, подписки/биллинг.
- Роли и права (policy над репозиториями).
- Остальные экраны из карты (`docs/ARCHITECTURE.md §6`), AI-слой.
- Тесты (unit по репозиториям, widget по экранам), CI.
