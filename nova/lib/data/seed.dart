import '../domain/models.dart';

/// Демо-данные каркаса. Заменяются реальной БД (Drift) без правок UI.
abstract final class Seed {
  static const staff = <Staff>[
    Staff(id: 'st1', name: 'Ирина', role: 'Мастер'),
    Staff(id: 'st2', name: 'Олег', role: 'Барбер'),
  ];

  static const services = <Service>[
    Service(id: 'sv1', name: 'Стрижка + укладка', durationMinutes: 60, price: 1200000, category: 'Волосы'),
    Service(id: 'sv2', name: 'Окрашивание', durationMinutes: 90, price: 2400000, category: 'Волосы'),
    Service(id: 'sv3', name: 'Мужская стрижка', durationMinutes: 45, price: 700000, category: 'Барбер'),
    Service(id: 'sv4', name: 'Маникюр', durationMinutes: 75, price: 900000, category: 'Ногти'),
  ];

  static const clients = <Client>[
    Client(id: 'c1', name: 'Анна Ковач', phone: '+7 700 111 22 33', visitsCount: 12, totalSpent: 21000000, tags: ['постоянная']),
    Client(id: 'c2', name: 'Мария Лунь', phone: '+7 700 222 33 44', visitsCount: 4, totalSpent: 6800000, tags: ['онлайн']),
    Client(id: 'c3', name: 'Игорь Дан', phone: '+7 700 333 44 55', visitsCount: 1, totalSpent: 700000, tags: ['новый']),
    Client(id: 'c4', name: 'Елена Мороз', phone: '+7 700 444 55 66', visitsCount: 8, totalSpent: 14200000),
  ];

  static List<Appointment> appointments() {
    final now = DateTime.now();
    DateTime at(int h, int m) => DateTime(now.year, now.month, now.day, h, m);
    return [
      Appointment(id: 'a1', client: clients[0], service: services[0], start: at(10, 0), status: AppointmentStatus.confirmed, staff: staff[0]),
      Appointment(id: 'a2', client: clients[1], service: services[1], start: at(11, 30), status: AppointmentStatus.online, staff: staff[0]),
      Appointment(id: 'a3', client: clients[2], service: services[2], start: at(13, 15), status: AppointmentStatus.pending, staff: staff[1]),
      Appointment(id: 'a4', client: clients[3], service: services[3], start: at(15, 0), status: AppointmentStatus.confirmed, staff: staff[0]),
    ];
  }
}
