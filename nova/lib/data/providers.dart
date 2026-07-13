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

final clientsRepositoryProvider = Provider<ClientsRepository>(
    (ref) => DriftClientsRepository(ref.watch(databaseProvider)));
final servicesRepositoryProvider = Provider<ServicesRepository>(
    (ref) => DriftServicesRepository(ref.watch(databaseProvider)));
final appointmentsRepositoryProvider = Provider<AppointmentsRepository>(
    (ref) => DriftAppointmentsRepository(ref.watch(databaseProvider)));
final workspaceRepositoryProvider = Provider<WorkspaceRepository>(
    (ref) => DriftWorkspaceRepository(ref.watch(databaseProvider)));

/// Все клиенты (реактивно из БД).
final clientsProvider = StreamProvider<List<Client>>(
    (ref) => ref.watch(clientsRepositoryProvider).watchAll());

/// Один клиент по id (из общего потока — мгновенно, без отдельного запроса).
final clientByIdProvider = Provider.family<Client?, String>((ref, id) {
  final list = ref.watch(clientsProvider).value ?? const <Client>[];
  for (final c in list) {
    if (c.id == id) return c;
  }
  return null;
});

/// Все записи клиента (история/метрики карточки).
final clientAppointmentsProvider =
    StreamProvider.family<List<Appointment>, String>((ref, id) =>
        ref.watch(appointmentsRepositoryProvider).watchForClient(id));

/// Каталог услуг (реактивно из БД).
final servicesProvider = StreamProvider<List<Service>>(
    (ref) => ref.watch(servicesRepositoryProvider).watchAll());

/// Выбранный день календаря.
final selectedDayProvider = StateProvider<DateTime>((ref) => DateTime.now());

/// Записи выбранного дня (реактивно из БД).
final dayAppointmentsProvider = StreamProvider<List<Appointment>>((ref) {
  final day = ref.watch(selectedDayProvider);
  return ref.watch(appointmentsRepositoryProvider).watchDay(day);
});

/// Записи в диапазоне (Неделя/Месяц). Ключ-запись обеспечивает кэш по диапазону:
/// одинаковый [start, end) переиспользует поток без повторного запроса.
typedef DateRange = ({DateTime start, DateTime end});

final rangeAppointmentsProvider =
    StreamProvider.family<List<Appointment>, DateRange>((ref, range) {
  return ref
      .watch(appointmentsRepositoryProvider)
      .watchRange(range.start, range.end);
});

/// Дневная сводка для экранов «Сегодня»/«Обзор».
@immutable
class DaySummary {
  const DaySummary(
      {required this.revenue, required this.visits, required this.load});
  final int revenue;
  final int visits;
  final int load;
}

final daySummaryProvider = Provider<DaySummary>((ref) {
  final appts =
      ref.watch(dayAppointmentsProvider).value ?? const <Appointment>[];
  final revenue = appts
      .where((a) =>
          a.status == AppointmentStatus.completed ||
          a.status == AppointmentStatus.confirmed)
      .fold<int>(0, (sum, a) => sum + a.service.price);
  final load =
      appts.isEmpty ? 0 : ((appts.length / 8) * 100).clamp(0, 100).round();
  return DaySummary(revenue: revenue, visits: appts.length, load: load);
});
