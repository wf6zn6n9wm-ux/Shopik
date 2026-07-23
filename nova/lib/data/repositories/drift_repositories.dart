import '../../domain/models.dart';
import '../../domain/repositories.dart';
import '../db/database.dart';

/// Реализация репозиториев поверх Drift. Тонкие обёртки: вся работа с БД —
/// в AppDatabase, здесь только контракт для UI.

class DriftClientsRepository implements ClientsRepository {
  DriftClientsRepository(this._db);
  final AppDatabase _db;

  @override
  Stream<List<Client>> watchAll() => _db.watchClients();

  @override
  Future<void> add(Client client) => _db.addClient(client);
}

class DriftServicesRepository implements ServicesRepository {
  DriftServicesRepository(this._db);
  final AppDatabase _db;

  @override
  Stream<List<Service>> watchAll() => _db.watchServices();

  @override
  Future<void> add(Service service) => _db.addService(service);
}

class DriftAppointmentsRepository implements AppointmentsRepository {
  DriftAppointmentsRepository(this._db);
  final AppDatabase _db;

  @override
  Stream<List<Appointment>> watchDay(DateTime day) => _db.watchDay(day);

  @override
  Stream<List<Appointment>> watchRange(DateTime start, DateTime end) =>
      _db.watchRange(start, end);

  @override
  Stream<List<Appointment>> watchForClient(String clientId) =>
      _db.watchClientAppointments(clientId);

  @override
  Future<void> add(Appointment appointment) => _db.addAppointment(appointment);

  @override
  Future<void> updateStatus(String id, AppointmentStatus status) =>
      _db.setAppointmentStatus(id, status);

  @override
  Future<void> move(String id, DateTime newStart) =>
      _db.moveAppointment(id, newStart);

  @override
  Future<void> delete(String id) => _db.deleteAppointment(id);
}

class DriftWorkspaceRepository implements WorkspaceRepository {
  DriftWorkspaceRepository(this._db);
  final AppDatabase _db;

  @override
  Future<void> applyIndustry(
    String industryId,
    List<(String, String, int, int)> services,
  ) =>
      _db.applyIndustryTemplate(industryId, services);
}
