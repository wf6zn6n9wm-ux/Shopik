import '../domain/models.dart';
import '../domain/repositories.dart';
import 'seed.dart';

/// In-memory реализация репозиториев (каркас). Хранит списки в памяти и
/// заменяется на Drift/SQLite без правок UI — контракт тот же.

class InMemoryClientsRepository implements ClientsRepository {
  final List<Client> _items = [...Seed.clients];

  @override
  List<Client> all() => List.unmodifiable(_items);

  @override
  Client? byId(String id) {
    for (final c in _items) {
      if (c.id == id) return c;
    }
    return null;
  }

  @override
  void upsert(Client client) {
    final i = _items.indexWhere((c) => c.id == client.id);
    if (i == -1) {
      _items.add(client);
    } else {
      _items[i] = client;
    }
  }
}

class InMemoryServicesRepository implements ServicesRepository {
  @override
  List<Service> all() => Seed.services;
}

class InMemoryStaffRepository implements StaffRepository {
  @override
  List<Staff> all() => Seed.staff;
}

class InMemoryAppointmentsRepository implements AppointmentsRepository {
  final List<Appointment> _items = Seed.appointments();

  @override
  List<Appointment> all() => List.unmodifiable(_items);

  @override
  List<Appointment> forDay(DateTime day) {
    final sorted = _items
        .where((a) => a.start.year == day.year && a.start.month == day.month && a.start.day == day.day)
        .toList()
      ..sort((a, b) => a.start.compareTo(b.start));
    return sorted;
  }

  @override
  void add(Appointment appointment) => _items.add(appointment);

  @override
  void updateStatus(String id, AppointmentStatus status) {
    final i = _items.indexWhere((a) => a.id == id);
    if (i != -1) _items[i] = _items[i].copyWith(status: status);
  }
}
