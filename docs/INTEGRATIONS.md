# Nova — Интеграции (адаптеры к портам)

Порты уже в коде (`core/services/*`). Здесь — **готовые адаптеры**: включаются
добавлением зависимости и подменой одного провайдера. Дефолтная сборка остаётся
лёгкой и «зелёной» (CI), потому что тяжёлые SDK не тянутся, пока не нужны.

Схема включения одинаковая:
1. добавить пакет в `pubspec.yaml`;
2. добавить адаптер (код ниже) в `lib/core/integrations/...`;
3. подменить провайдер в `ProviderContainer(overrides: [...])` (в `main.dart`
   под нужный флейвор) — фичи не меняются.

---

## Firebase Crashlytics → `CrashReporter`

`pubspec`: `firebase_core`, `firebase_crashlytics`.

```dart
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:nova/core/services/analytics/analytics_service.dart';

class CrashlyticsReporter implements CrashReporter {
  final _c = FirebaseCrashlytics.instance;
  @override
  Future<void> recordError(Object error, StackTrace? stack, {bool? fatal}) =>
      _c.recordError(error, stack, fatal: fatal ?? false);
  @override
  void log(String message) => _c.log(message);
  @override
  Future<void> setUser(String? id) => _c.setUserIdentifier(id ?? '');
}
// override: crashReporterProvider.overrideWithValue(CrashlyticsReporter())
```

## Firebase Analytics → `AnalyticsService`

`pubspec`: `firebase_analytics`.

```dart
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:nova/core/services/analytics/analytics_service.dart';

class FirebaseAnalyticsService implements AnalyticsService {
  final _a = FirebaseAnalytics.instance;
  @override
  Future<void> initialize() async {}
  @override
  Future<void> logEvent(String name, {Map<String, Object?>? params}) =>
      _a.logEvent(name: name, parameters: params?.cast<String, Object>());
  @override
  Future<void> logScreen(String name) => _a.logScreenView(screenName: name);
  @override
  Future<void> setUserId(String? id) => _a.setUserId(id: id);
}
// override: analyticsServiceProvider.overrideWithValue(FirebaseAnalyticsService())
```

## Firebase Remote Config → `RemoteConfigService`

`pubspec`: `firebase_remote_config`.

```dart
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:nova/core/services/remote_config/remote_config_service.dart';

class FirebaseRemoteConfigService implements RemoteConfigService {
  final _rc = FirebaseRemoteConfig.instance;
  @override
  Future<void> initialize() async {
    await _rc.setConfigSettings(RemoteConfigSettings(
      fetchTimeout: const Duration(seconds: 10),
      minimumFetchInterval: const Duration(hours: 1),
    ));
    await _rc.fetchAndActivate();
  }
  @override
  bool flag(FeatureFlag f) => _rc.getBool(f.name);
  @override
  bool getBool(String key, {bool? fallback}) => _rc.getBool(key);
  @override
  String getString(String key, {String? fallback}) => _rc.getString(key);
  @override
  int getInt(String key, {int? fallback}) => _rc.getInt(key);
}
// override: remoteConfigServiceProvider.overrideWithValue(FirebaseRemoteConfigService())
```

## Sentry → `CrashReporter`

`pubspec`: `sentry_flutter`. Инициализация в `main` (оборачивает runApp).

```dart
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:nova/core/services/analytics/analytics_service.dart';

class SentryReporter implements CrashReporter {
  @override
  Future<void> recordError(Object error, StackTrace? stack, {bool? fatal}) =>
      Sentry.captureException(error, stackTrace: stack);
  @override
  void log(String message) => Sentry.addBreadcrumb(Breadcrumb(message: message));
  @override
  Future<void> setUser(String? id) => Sentry.configureScope((s) => s.setUser(SentryUser(id: id)));
}
```

## Биллинг / подписки (напоминание)

- Мобайл: `in_app_purchase` → адаптер `BillingService` (StoreKit / Play).
- Web: `flutter_stripe` / Stripe Checkout → адаптер `BillingService` (канал stripe).
- Выбор канала — по `PlatformCapabilities`. Права выводит `SubscriptionService`.

## Авторизация

- `supabase_flutter` → адаптер `AuthService` (`SupabaseAuthService`).
- Либо собственный OTP-бэкенд через `ApiClient` → `ApiAuthService`.

---

## Порядок инициализации при включении Firebase/Sentry

`main.dart` (или `main_prod.dart`): `Firebase.initializeApp()` /
`SentryFlutter.init(...)` **до** `bootstrap(container)`, затем передать адаптеры
в `overrides`. `bootstrap` вызовет `initialize()` у RemoteConfig/Analytics и
навесит `FlutterError.onError` на выбранный `CrashReporter` — код bootstrap не
меняется.
