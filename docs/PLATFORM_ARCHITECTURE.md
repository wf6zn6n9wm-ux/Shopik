# Nova — Платформенный фундамент (SaaS)

Архитектура заложена так, чтобы каждую из перечисленных возможностей можно было
**включить без переписывания** — через адаптер (реализацию порта) или новый
модуль. Ниже: принцип, карта возможностей на швы, матрица платформ и структура.

## Принцип: ports & adapters + модули

- **Порт (интерфейс)** в `core/services/*` описывает, *что* умеет сервис.
- **Адаптер** — конкретная реализация (Supabase, StoreKit, Stripe, Firebase…).
  Подключается заменой одного Riverpod-провайдера. Фичи не меняются.
- **Дефолт** каждого порта — безопасный no-op/local, поэтому приложение
  работает уже сейчас (офлайн, без бэкендов).
- **Модуль** (`modules/*`) добавляет функциональность как единицу: свои
  маршруты и вкладки. Регистрируется в `modules/registry.dart` — единственном
  месте сборки. UI-ядро о фиче не знает.

```
UI (features) ──зависит от──▶ Порты (core/services, domain/repositories)
                                   ▲ подставляется
                     Адаптеры (Supabase/Stripe/StoreKit/FCM/Firebase/API)
```

## Карта возможностей → архитектурный шов

| Возможность | Где заложено | Что подключить (без переписывания) |
|---|---|---|
| **Apple IAP / Google Play Billing** | `services/billing/BillingService` (порт) | Адаптеры StoreKit / Play Billing → выбор по `PlatformCapabilities.supportsNativeIap` |
| **Web из той же кодовой базы** | go_router (URL-маршруты) + `drift_flutter` (web-БД) | Ничего: `flutter build web` |
| **Desktop (Win/macOS)** | Flutter desktop + `PlatformCapabilities` + Drift (нативный SQLite) | `flutter build windows/macos` |
| **Push-уведомления** | `services/push/PushService` (порт) | `FcmPushService` (FCM/APNs) |
| **i18n с первого дня** | `l10n/*.arb` + `AppLocalizations` + `localeProvider` | Добавить локали/строки в ARB |
| **Remote Config / Feature Flags** | `services/remote_config/RemoteConfigService` + `FeatureFlag` | `FirebaseRemoteConfigService` |
| **Crashlytics / аналитика** | `services/analytics/CrashReporter` + `AnalyticsService` | Crashlytics/Sentry, Firebase/Amplitude/PostHog |
| **Собственные подписки** | `services/subscriptions/SubscriptionService` + `Entitlement`/`Feature` | Сверка прав с сервером; гейтинг уже работает через `hasFeatureProvider` |
| **Stripe (оплата на Web)** | `BillingService` (канал `stripe`) + `AppConfig.stripePublishableKey` | `StripeBillingService`, включается при `prefersStripeCheckout` |
| **Supabase / своя авторизация** | `services/auth/AuthService` (порт) | `SupabaseAuthService` или `ApiAuthService` |
| **AI-ассистент (в будущем)** | `services/ai/AiAssistant` (порт), UI спрашивает `available` | `BackendAiAssistant` (вызов модели), флаг `aiAssistant` |
| **Marketplace специалистов** | модуль + `Feature.marketplace` + флаг + публичный каталог из той же схемы | `MarketplaceModule` (маршруты/вкладка) |
| **Публичные страницы специалистов** | модуль + go_router (`/@handle`) + `AppConfig.marketplaceBaseUrl` | `PublicPagesModule` |
| **Онлайн-запись** | модуль + go_router deep-link (`/book/...`) + `Feature.onlineBooking` | `BookingModule` (web-страница записи) |
| **Команды, филиалы, роли** | схема БД мультиарендная: `businessId`, `Businesses`/`Locations`/`StaffMembers` | Таблица ролей + policy-слой над репозиториями |
| **API для интеграций** | `services/api/ApiClient` (порт) + доменные модели/репозитории как контракт | `HttpApiClient`; серверный API поверх той же модели |
| **Экспорт данных** | `services/data_transfer/ExportService` (порт) | `DriftExportService` (БД → JSON/CSV/файл) |
| **Импорт из конкурентов** | `services/data_transfer/ImportService` + `ImportSource` (fresha/booksy/…) | Парсер-адаптер на каждый источник |
| **Полностью модульная архитектура** | `modules/AppModule` + `registry.dart` | Новый модуль = новая запись в реестре |

## Матрица платформ (одна кодовая база)

| Слой | Mobile (iOS/Android) | Web | Desktop (Win/macOS) |
|---|---|---|---|
| UI (Flutter) | ✅ | ✅ | ✅ |
| БД (Drift) | SQLite нативный | sqlite3 wasm/IndexedDB | SQLite нативный |
| Навигация (go_router) | стек | URL + история | стек/окна |
| Оплата | Apple IAP / Play Billing | Stripe | Stripe / внешний чекаут |
| Push | FCM / APNs | Web Push | — (опц.) |

Выбор канала — через `PlatformCapabilities`, а не ветвления в фичах.

## Конфигурация и секреты

`AppConfig` (флейворы dev/staging/prod) читает URL/ключи из `--dart-define`, не из
кода. Точки входа под флейвор (`main_dev.dart`/`main_prod.dart`) переопределяют
`appConfigProvider`. Секреты в репозиторий не попадают.

## Последовательность старта (`core/bootstrap.dart`)

`ProviderContainer` → перехват ошибок в `CrashReporter` → инициализация
RemoteConfig → Analytics → Auth.restore → Push → bootstrap модулей → `runApp`.
Всё на дефолтных реализациях безопасно и не требует бэкендов.

## Что это даёт

- **Ноль переписывания:** включение фичи = адаптер или модуль, а не рефактор.
- **Работает сегодня:** дефолты (local/no-op) делают приложение запускаемым и
  офлайн-устойчивым до подключения любого бэкенда.
- **Один код на все платформы:** web/desktop/mobile обслуживаются capability-слоем.
- **Готово к масштабу:** мультиарендность, флаги, подписки и синк — швами, а не
  условиями в экранах.
