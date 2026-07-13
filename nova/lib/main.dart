import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app/app.dart';
import 'core/bootstrap.dart';

Future<void> main() async {
  await runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    await initializeDateFormatting('ru'); // локализованные даты

    // Единый корень зависимостей: платформенные сервисы + модули.
    final container = ProviderContainer();
    await bootstrap(container);

    runApp(UncontrolledProviderScope(container: container, child: const NovaApp()));
  }, (error, stack) {
    if (kDebugMode) debugPrint('uncaught: $error');
  });
}
