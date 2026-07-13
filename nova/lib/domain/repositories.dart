import 'models.dart';

/// Абстракции доступа к данным. UI зависит только от них; реализация — Drift.
/// Потоки (`watch*`) отражают offline-first реактивность: изменение в БД
/// мгновенно обновляет все экраны.

abstract interface class ClientsRepository {
  Stream<List<Client>> watchAll();
  Future<void> add(Client client);
}

abstract interface class ServicesRepository {
  Stream<List<Service>> watchAll();
  Future<void> add(Service service);
}

abstract interface class AppointmentsRepository {
  Stream<List<Appointment>> watchDay(DateTime day);

  /// Записи в полуоткрытом диапазоне [start, end) — для Недели/Месяца.
  Stream<List<Appointment>> watchRange(DateTime start, DateTime end);
  Future<void> add(Appointment appointment);
  Future<void> updateStatus(String id, AppointmentStatus status);

  /// Перенос (Drag & Drop): меняет время начала.
  Future<void> move(String id, DateTime newStart);
  Future<void> delete(String id);
}

/// Настройка рабочего пространства (онбординг): применение отраслевого шаблона.
abstract interface class WorkspaceRepository {
  /// [services]: (категория, название, длительность_мин, цена_минор).
  Future<void> applyIndustry(
    String industryId,
    List<(String, String, int, int)> services,
  );
}
