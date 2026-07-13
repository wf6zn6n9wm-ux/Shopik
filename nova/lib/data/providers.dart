import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/models.dart';
import '../domain/repositories.dart';
import 'db/database.dart';
import 'repositories/drift_repositories.dart';

/// Riverpod-проводка. Экраны читают провайдеры, а не БД напрямую.
/// Drift-потоки делают всё реактивным и offline-first.

final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  // Сид демо-данных при первом запуске (fire-and-forget; потоки обновятся).
  // ignore: discarded_futures
  db.ensureSeeded();
  ref.onDispose(db.close);
  return db;
});

final clientsRepositoryProvider =
    Provider<ClientsRepository>((ref) => DriftClientsRepository(ref.watch(databaseProvider)));
final servicesRepositoryProvider =
    Provider<ServicesRepository>((ref) => DriftServicesRepository(ref.watch(databaseProvider)));
final appointmentsRepositoryProvider =
    Provider<AppointmentsRepository>((ref) => DriftAppointmentsRepository(ref.watch(databaseProvider)));

/// Все клиенты (реактивно из БД).
final clientsProvider =
    StreamProvider<List<Client>>((ref) => ref.watch(clientsRepositoryProvider).watchAll());

/// Каталог услуг.
final servicesProvider =
    FutureProvider<List<Service>>((ref) => ref.watch(servicesRepositoryProvider).all());

/// Выбранный день календаря.
final selectedDayProvider = StateProvider<DateTime>((ref) => DateTime.now());

/// Записи выбранного дня (реактивно из БД).
final dayAppointmentsProvider = StreamProvider<List<Appointment>>((ref) {
  final day = ref.watch(selectedDayProvider);
  return ref.watch(appointmentsRepositoryProvider).watchDay(day);
});

/// Дневная сводка для экранов «Сегодня»/«Обзор».
@immutable
class DaySummary {
  const DaySummary({required this.revenue, required this.visits, required this.load});
  final int revenue;
  final int visits;
  final int load;
}

final daySummaryProvider = Provider<DaySummary>((ref) {
  final appts = ref.watch(dayAppointmentsProvider).value ?? const <Appointment>[];
  final revenue = appts
      .where((a) => a.status == AppointmentStatus.completed || a.status == AppointmentStatus.confirmed)
      .fold<int>(0, (sum, a) => sum + a.service.price);
  final load = appts.isEmpty ? 0 : ((appts.length / 8) * 100).clamp(0, 100).round();
  return DaySummary(revenue: revenue, visits: appts.length, load: load);
});
