import 'models.dart';

/// Абстракции доступа к данным. UI зависит только от них — конкретная
/// реализация (in-memory сейчас, Drift/SQLite позже) подключается через
/// провайдеры и не требует правок экранов.

abstract interface class ClientsRepository {
  List<Client> all();
  Client? byId(String id);
  void upsert(Client client);
}

abstract interface class ServicesRepository {
  List<Service> all();
}

abstract interface class StaffRepository {
  List<Staff> all();
}

abstract interface class AppointmentsRepository {
  List<Appointment> all();
  List<Appointment> forDay(DateTime day);
  void add(Appointment appointment);
  void updateStatus(String id, AppointmentStatus status);
}
