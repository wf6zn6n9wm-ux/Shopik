import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/services/subscriptions/entitlements.dart';
import '../core/time/demo_clock.dart';
import '../domain/models.dart';
import '../domain/repositories.dart';
import 'db/database.dart';
import 'repositories/drift_repositories.dart';

/// Поточний тариф користувача (демо: Pro). У проді — з SubscriptionService.
final currentPlanProvider = Provider<Plan>((ref) => Plan.pro);

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

/// Дані головного екрана «Сьогодні»: зароблено, кількість, наступний клієнт,
/// вільні вікна, інсайт повернення.
@immutable
class DashboardData {
  const DashboardData({
    required this.revenue,
    required this.visits,
    required this.freeWindows,
    required this.next,
    required this.minutesToNext,
    required this.lapsedCount,
  });
  final int revenue; // зароблено (завершені), у мін. одиницях
  final int visits; // усього записів на день
  final List<DateTime> freeWindows; // вільні початки в робочих годинах
  final Appointment? next; // найближчий майбутній запис
  final int minutesToNext; // хвилин до наступного
  final int lapsedCount; // клієнти, що давно не були
}

final dashboardProvider = Provider<DashboardData>((ref) {
  final appts =
      ref.watch(dayAppointmentsProvider).value ?? const <Appointment>[];
  final now = demoNow();

  final revenue = appts
      .where((a) => a.status == AppointmentStatus.completed)
      .fold<int>(0, (s, a) => s + a.service.price);

  Appointment? next;
  for (final a in appts) {
    if (a.start.isAfter(now) &&
        a.status != AppointmentStatus.cancelled &&
        a.status != AppointmentStatus.noShow) {
      if (next == null || a.start.isBefore(next.start)) next = a;
    }
  }
  final minutesToNext =
      next == null ? 0 : next.start.difference(now).inMinutes.clamp(0, 999);

  // Вільні вікна: гепи ≥40 хв від «зараз» до кінця робочого дня (20:00).
  final dayEnd = DateTime(now.year, now.month, now.day, 20);
  final busy = appts
      .where(
          (a) => a.status != AppointmentStatus.cancelled && a.end.isAfter(now))
      .map((a) => (a.start, a.end))
      .toList()
    ..sort((x, y) => x.$1.compareTo(y.$1));
  final windows = <DateTime>[];
  var cursor = now;
  for (final b in busy) {
    if (b.$1.isAfter(cursor) && b.$1.difference(cursor).inMinutes >= 40) {
      windows.add(_ceilTo15(cursor));
    }
    if (b.$2.isAfter(cursor)) cursor = b.$2;
  }
  if (cursor.isBefore(dayEnd) && dayEnd.difference(cursor).inMinutes >= 40) {
    windows.add(_ceilTo15(cursor));
  }

  return DashboardData(
    revenue: revenue,
    visits: appts.length,
    freeWindows: windows.take(3).toList(),
    next: next,
    minutesToNext: minutesToNext,
    lapsedCount: 3,
  );
});

DateTime _ceilTo15(DateTime t) {
  final m = t.minute;
  final add = (15 - (m % 15)) % 15;
  final r = t.add(Duration(minutes: add == 0 ? 15 : add));
  return DateTime(r.year, r.month, r.day, r.hour, r.minute);
}
