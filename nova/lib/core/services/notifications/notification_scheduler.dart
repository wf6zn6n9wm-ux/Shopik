import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Запланированное напоминание (локальное или push).
@immutable
class ScheduledReminder {
  const ScheduledReminder({
    required this.id,
    required this.at,
    required this.title,
    required this.body,
  });

  final String id;
  final DateTime at;
  final String title;
  final String body;
}

/// Порт напоминаний. Реализация: flutter_local_notifications (локально) и/или
/// FCM (remote) — подключается адаптером. Дефолт — no-op, чтобы приложение
/// работало без настроенного канала (гейтинг — FeatureFlag.push).
abstract interface class NotificationScheduler {
  Future<void> schedule(ScheduledReminder reminder);
  Future<void> cancel(String id);
  Future<void> cancelForAppointment(String appointmentId);
}

class NoopNotificationScheduler implements NotificationScheduler {
  @override
  Future<void> schedule(ScheduledReminder reminder) async {}

  @override
  Future<void> cancel(String id) async {}

  @override
  Future<void> cancelForAppointment(String appointmentId) async {}
}

final notificationSchedulerProvider =
    Provider<NotificationScheduler>((ref) => NoopNotificationScheduler());

/// Политика напоминаний: за сколько до визита. Настраивается на уровне бизнеса
/// (пока — дефолт −24ч и −2ч).
abstract final class ReminderPolicy {
  static const List<Duration> offsets = [
    Duration(hours: 24),
    Duration(hours: 2),
  ];

  static String reminderId(String appointmentId, Duration offset) =>
      '${appointmentId}_r${offset.inHours}';
}
