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
  });

  final AppFlavor flavor;
  final String apiBaseUrl;
  final String? supabaseUrl;
  final String? supabaseAnonKey;
  final String? stripePublishableKey;
  final String? marketplaceBaseUrl;

  bool get isProd => flavor == AppFlavor.prod;
  bool get isDev => flavor == AppFlavor.dev;

  static const AppConfig dev = AppConfig(flavor: AppFlavor.dev);
}

/// Переопределяется в точке входа под флейвор/окружение.
final appConfigProvider = Provider<AppConfig>((_) => AppConfig.dev);
