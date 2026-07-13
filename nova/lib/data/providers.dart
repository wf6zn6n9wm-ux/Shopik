import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/models.dart';
import '../domain/repositories.dart';
import 'in_memory_repositories.dart';

/// Riverpod-проводка. Экраны читают провайдеры, а не репозитории напрямую —
/// это точка замены источника данных (in-memory → Drift) без правок UI.

final clientsRepositoryProvider = Provider<ClientsRepository>((ref) => InMemoryClientsRepository());
final servicesRepositoryProvider = Provider<ServicesRepository>((ref) => InMemoryServicesRepository());
final staffRepositoryProvider = Provider<StaffRepository>((ref) => InMemoryStaffRepository());
final appointmentsRepositoryProvider =
    Provider<AppointmentsRepository>((ref) => InMemoryAppointmentsRepository());

final clientsProvider = Provider<List<Client>>((ref) => ref.watch(clientsRepositoryProvider).all());
final servicesProvider = Provider<List<Service>>((ref) => ref.watch(servicesRepositoryProvider).all());

/// Записи выбранного дня. Реактивны: создание записи обновляет ленту.
final selectedDayProvider = StateProvider<DateTime>((ref) => DateTime.now());

final dayAppointmentsProvider = NotifierProvider<DayAppointmentsNotifier, List<Appointment>>(
  DayAppointmentsNotifier.new,
);

class DayAppointmentsNotifier extends Notifier<List<Appointment>> {
  AppointmentsRepository get _repo => ref.read(appointmentsRepositoryProvider);

  @override
  List<Appointment> build() {
    final day = ref.watch(selectedDayProvider);
    return _repo.forDay(day);
  }

  void add(Appointment a) {
    _repo.add(a);
    state = _repo.forDay(ref.read(selectedDayProvider));
  }

  void setStatus(String id, AppointmentStatus status) {
    _repo.updateStatus(id, status);
    state = _repo.forDay(ref.read(selectedDayProvider));
  }
}

/// Простая дневная сводка для экрана «Сегодня».
@immutable
class DaySummary {
  const DaySummary({required this.revenue, required this.visits, required this.load});
  final int revenue;
  final int visits;
  final int load;
}

final daySummaryProvider = Provider<DaySummary>((ref) {
  final appts = ref.watch(dayAppointmentsProvider);
  final revenue = appts
      .where((a) => a.status == AppointmentStatus.completed || a.status == AppointmentStatus.confirmed)
      .fold<int>(0, (sum, a) => sum + a.service.price);
  final load = appts.isEmpty ? 0 : ((appts.length / 8) * 100).clamp(0, 100).round();
  return DaySummary(revenue: revenue, visits: appts.length, load: load);
});
