import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app/app.dart';
import 'core/boot_uri.dart';
import 'core/bootstrap.dart';
import 'core/config/app_config.dart';

Future<void> main() async {
  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    bootFragment = Uri.base.fragment; // до старту роутера (для знімків ?view=)
    await initializeDateFormatting('uk'); // українські локалізовані дати

    // Единый корень зависимостей: платформенные сервисы + модули.
    // Конфиг читается из окружения сборки (FLAVOR/ключи через --dart-define).
    final container = ProviderContainer(
      overrides: [
        appConfigProvider.overrideWithValue(AppConfig.fromEnvironment()),
      ],
    );
    await bootstrap(container);

    runApp(UncontrolledProviderScope(
        container: container, child: const KavioApp()));
  }, (error, stack) {
    if (kDebugMode) debugPrint('uncaught: $error');
  });
}
