import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Порт аналитики продукта. Реализации: Firebase Analytics, Amplitude, PostHog.
abstract interface class AnalyticsService {
  Future<void> initialize();
  Future<void> logEvent(String name, {Map<String, Object?>? params});
  Future<void> logScreen(String name);
  Future<void> setUserId(String? id);
}

/// Порт отчётов о сбоях. Реализация: Firebase Crashlytics, Sentry.
abstract interface class CrashReporter {
  Future<void> recordError(Object error, StackTrace? stack, {bool? fatal});
  void log(String message);
  Future<void> setUser(String? id);
}

/// DEFAULT: в debug пишет в консоль, в release молчит. Замена — адаптеры выше.
class ConsoleAnalytics implements AnalyticsService {
  @override
  Future<void> initialize() async {}

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? params}) async {
    if (kDebugMode) debugPrint('analytics: $name ${params ?? const {}}');
  }

  @override
  Future<void> logScreen(String name) async {
    if (kDebugMode) debugPrint('screen: $name');
  }

  @override
  Future<void> setUserId(String? id) async {}
}

class ConsoleCrashReporter implements CrashReporter {
  @override
  Future<void> recordError(Object error, StackTrace? stack,
      {bool? fatal}) async {
    if (kDebugMode) {
      debugPrint('crash${(fatal ?? false) ? '(fatal)' : ''}: $error');
    }
  }

  @override
  void log(String message) {
    if (kDebugMode) debugPrint('log: $message');
  }

  @override
  Future<void> setUser(String? id) async {}
}

final analyticsServiceProvider =
    Provider<AnalyticsService>((ref) => ConsoleAnalytics());
final crashReporterProvider =
    Provider<CrashReporter>((ref) => ConsoleCrashReporter());
