import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../modules/registry.dart';
import 'services/analytics/analytics_service.dart';
import 'services/auth/auth_service.dart';
import 'services/push/push_service.dart';
import 'services/remote_config/remote_config_service.dart';

/// Единая последовательность старта: инициализация платформенных сервисов и
/// модулей. Дефолтные реализации безопасны (no-op/local), поэтому bootstrap не
/// падает и без настроенных бэкендов. Реальные адаптеры включаются заменой
/// провайдеров — эта функция не меняется.
Future<void> bootstrap(ProviderContainer container) async {
  // Перехват ошибок Flutter в crash-репортер.
  final crash = container.read(crashReporterProvider);
  FlutterError.onError = (details) {
    crash.recordError(details.exception, details.stack, fatal: false);
    FlutterError.presentError(details);
  };

  // Порядок важен: конфиг флагов → аналитика → авторизация → пуши.
  await container.read(remoteConfigServiceProvider).initialize();
  await container.read(analyticsServiceProvider).initialize();
  await container.read(authServiceProvider).restore();
  await container.read(pushServiceProvider).initialize();

  // Инициализация модулей.
  for (final module in appModules) {
    await module.bootstrap(container);
  }
}
