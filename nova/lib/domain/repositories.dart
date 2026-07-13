import 'models.dart';

/// Абстракции доступа к данным. UI зависит только от них; реализация — Drift.
/// Потоки (`watch*`) отражают offline-first реактивность: изменение в БД
/// мгновенно обновляет все экраны.

abstract interface class ClientsRepository {
  Stream<List<Client>> watchAll();
}

abstract interface class ServicesRepository {
  Future<List<Service>> all();
}

abstract interface class AppointmentsRepository {
  Stream<List<Appointment>> watchDay(DateTime day);
  Future<void> add(Appointment appointment);
  Future<void> updateStatus(String id, AppointmentStatus status);
}
