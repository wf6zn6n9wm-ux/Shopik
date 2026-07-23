import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Флейворы окружения. Разные точки входа (main_dev/main_prod) переопределяют
/// [appConfigProvider] — без ветвлений в коде фич.
enum AppFlavor { dev, staging, prod }

/// Единая конфигурация приложения. Секреты и URL приходят из окружения сборки
/// (--dart-define), а не хардкодятся. Здесь — контракт, который читают адаптеры
/// (Supabase, Stripe, API-клиент и т.д.).
class AppConfig {
  const AppConfig({
    required this.flavor,
    this.apiBaseUrl = '',
    this.supabaseUrl,
    this.supabaseAnonKey,
    this.stripePublishableKey,
    this.marketplaceBaseUrl,
    this.defaultCurrencyCode = 'UAH',
    this.defaultTimeZone = 'Europe/Kyiv',
  });

  final AppFlavor flavor;
  final String apiBaseUrl;
  final String? supabaseUrl;
  final String? supabaseAnonKey;
  final String? stripePublishableKey;
  final String? marketplaceBaseUrl;

  /// Дефолты локали денег/времени (переопределяются на уровне бизнеса).
  final String defaultCurrencyCode;
  final String defaultTimeZone;

  bool get isProd => flavor == AppFlavor.prod;
  bool get isDev => flavor == AppFlavor.dev;

  static const AppConfig dev = AppConfig(flavor: AppFlavor.dev);

  /// Читает конфигурацию из окружения сборки (--dart-define). Секреты в код не
  /// попадают. Флейворы выбираются через FLAVOR=dev|staging|prod.
  factory AppConfig.fromEnvironment() {
    const flavorName = String.fromEnvironment('FLAVOR', defaultValue: 'dev');
    final flavor = switch (flavorName) {
      'prod' => AppFlavor.prod,
      'staging' => AppFlavor.staging,
      _ => AppFlavor.dev,
    };
    return AppConfig(
      flavor: flavor,
      apiBaseUrl: const String.fromEnvironment('API_BASE_URL'),
      supabaseUrl: const bool.hasEnvironment('SUPABASE_URL')
          ? const String.fromEnvironment('SUPABASE_URL')
          : null,
      supabaseAnonKey: const bool.hasEnvironment('SUPABASE_ANON_KEY')
          ? const String.fromEnvironment('SUPABASE_ANON_KEY')
          : null,
      stripePublishableKey: const bool.hasEnvironment('STRIPE_PUBLISHABLE_KEY')
          ? const String.fromEnvironment('STRIPE_PUBLISHABLE_KEY')
          : null,
      defaultCurrencyCode:
          const String.fromEnvironment('DEFAULT_CURRENCY', defaultValue: 'UAH'),
      defaultTimeZone: const String.fromEnvironment('DEFAULT_TZ',
          defaultValue: 'Europe/Kyiv'),
    );
  }
}

/// Переопределяется в точке входа под флейвор/окружение.
final appConfigProvider = Provider<AppConfig>((_) => AppConfig.dev);
