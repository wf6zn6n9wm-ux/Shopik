import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import '../../domain/models.dart' as domain;

part 'database.g.dart';

// ⚠️ Кодогенерация Drift: перед запуском выполнить
//    flutter pub run build_runner build --delete-conflicting-outputs
// Файл database.g.dart создаётся генератором (в git не коммитим).

/// Схема мультиарендная с первого дня: businessId на каждой сущности —
/// фундамент под команды, филиалы, роли и подписки. Приложение — offline-first
/// SaaS: Drift (SQLite) на устройстве, синхронизация — отдельный слой.

@DataClassName('BusinessRow')
class Businesses extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get industry => text().withDefault(const Constant('beauty'))();
  // Мультивалютность и мультизональность на уровне арендатора.
  TextColumn get currency => text().withDefault(const Constant('KZT'))();
  TextColumn get timeZone =>
      text().withDefault(const Constant('Asia/Almaty'))();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('LocationRow')
class Locations extends Table {
  TextColumn get id => text()();
  TextColumn get businessId => text()();
  TextColumn get name => text()();
  TextColumn get address => text().nullable()();
  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('StaffRow')
class StaffMembers extends Table {
  TextColumn get id => text()();
  TextColumn get businessId => text()();
  TextColumn get name => text()();
  TextColumn get role => text().withDefault(const Constant('Мастер'))();
  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('ServiceCategoryRow')
class ServiceCategories extends Table {
  TextColumn get id => text()();
  TextColumn get businessId => text()();
  TextColumn get name => text()();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('ServiceRow')
class Services extends Table {
  TextColumn get id => text()();
  TextColumn get businessId => text()();
  TextColumn get categoryId => text().nullable()();
  TextColumn get name => text()();
  IntColumn get durationMinutes => integer()();
  IntColumn get price => integer()(); // минимальные единицы валюты
  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('ClientRow')
class Clients extends Table {
  TextColumn get id => text()();
  TextColumn get businessId => text()();
  TextColumn get name => text()();
  TextColumn get phone => text()();
  IntColumn get visitsCount => integer().withDefault(const Constant(0))();
  IntColumn get totalSpent => integer().withDefault(const Constant(0))();
  TextColumn get note => text().nullable()();
  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('AppointmentRow')
class Appointments extends Table {
  TextColumn get id => text()();
  TextColumn get businessId => text()();
  TextColumn get clientId => text()();
  TextColumn get serviceId => text()();
  TextColumn get staffId => text().nullable()();
  DateTimeColumn get startAt => dateTime()();
  TextColumn get status => text()(); // AppointmentStatus.name
  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(
  tables: [
    Businesses,
    Locations,
    StaffMembers,
    ServiceCategories,
    Services,
    Clients,
    Appointments
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'nova'));
  AppDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 1;

  // --- Маппинг строк БД → доменные модели ---
  domain.Client _toClient(ClientRow r) => domain.Client(
        id: r.id,
        name: r.name,
        phone: r.phone,
        visitsCount: r.visitsCount,
        totalSpent: r.totalSpent,
        note: r.note,
      );

  domain.Service _toService(ServiceRow r) => domain.Service(
        id: r.id,
        name: r.name,
        durationMinutes: r.durationMinutes,
        price: r.price,
      );

  domain.Staff _toStaff(StaffRow r) =>
      domain.Staff(id: r.id, name: r.name, role: r.role);

  domain.Appointment _toAppointment(
          AppointmentRow a, ClientRow c, ServiceRow s, StaffRow? st) =>
      domain.Appointment(
        id: a.id,
        client: _toClient(c),
        service: _toService(s),
        staff: st == null ? null : _toStaff(st),
        start: a.startAt,
        status: domain.AppointmentStatus.values.byName(a.status),
      );

  // --- Запросы ---
  Stream<List<domain.Client>> watchClients() {
    return (select(clients)..orderBy([(t) => OrderingTerm.asc(t.name)]))
        .watch()
        .map((rows) => rows.map(_toClient).toList());
  }

  Stream<List<domain.Service>> watchServices() {
    return (select(services)..orderBy([(t) => OrderingTerm.asc(t.name)]))
        .watch()
        .map((rows) => rows.map(_toService).toList());
  }

  Stream<List<domain.Appointment>> watchDay(DateTime day) {
    final start = DateTime(day.year, day.month, day.day);
    final end = start.add(const Duration(days: 1));
    final query = select(appointments).join([
      innerJoin(clients, clients.id.equalsExp(appointments.clientId)),
      innerJoin(services, services.id.equalsExp(appointments.serviceId)),
      leftOuterJoin(
          staffMembers, staffMembers.id.equalsExp(appointments.staffId)),
    ])
      ..where(appointments.startAt.isBiggerOrEqualValue(start) &
          appointments.startAt.isSmallerThanValue(end))
      ..orderBy([OrderingTerm.asc(appointments.startAt)]);

    return query.watch().map((rows) => rows.map((row) {
          return _toAppointment(
            row.readTable(appointments),
            row.readTable(clients),
            row.readTable(services),
            row.readTableOrNull(staffMembers),
          );
        }).toList());
  }

  Future<void> addAppointment(domain.Appointment a,
      {String businessId = 'b1'}) {
    return into(appointments).insert(AppointmentsCompanion.insert(
      id: a.id,
      businessId: businessId,
      clientId: a.client.id,
      serviceId: a.service.id,
      staffId: Value(a.staff?.id),
      startAt: a.start,
      status: a.status.name,
    ));
  }

  Future<void> setAppointmentStatus(
      String id, domain.AppointmentStatus status) {
    return (update(appointments)..where((t) => t.id.equals(id)))
        .write(AppointmentsCompanion(status: Value(status.name)));
  }

  Future<void> addClient(domain.Client c, {String businessId = 'b1'}) {
    return into(clients).insert(ClientsCompanion.insert(
      id: c.id,
      businessId: businessId,
      name: c.name,
      phone: c.phone,
      visitsCount: Value(c.visitsCount),
      totalSpent: Value(c.totalSpent),
      note: Value(c.note),
    ));
  }

  Future<void> addService(domain.Service s, {String businessId = 'b1'}) {
    return into(services).insert(ServicesCompanion.insert(
      id: s.id,
      businessId: businessId,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: s.price,
    ));
  }

  /// Сид демо-данных при первом запуске (пустая БД). Заменяется реальной
  /// регистрацией бизнеса / синхронизацией.
  Future<void> ensureSeeded() async {
    final has = await (select(clients)..limit(1)).get();
    if (has.isNotEmpty) return;

    await transaction(() async {
      await into(businesses).insert(
        BusinessesCompanion.insert(
            id: 'b1', name: 'Моя студия', industry: const Value('beauty')),
      );
      await into(locations).insert(
        LocationsCompanion.insert(
            id: 'l1', businessId: 'b1', name: 'Основной филиал'),
      );

      await batch((b) {
        b.insertAll(staffMembers, [
          StaffMembersCompanion.insert(
              id: 'st1',
              businessId: 'b1',
              name: 'Ирина',
              role: const Value('Мастер')),
          StaffMembersCompanion.insert(
              id: 'st2',
              businessId: 'b1',
              name: 'Олег',
              role: const Value('Барбер')),
        ]);
        b.insertAll(services, [
          ServicesCompanion.insert(
              id: 'sv1',
              businessId: 'b1',
              name: 'Стрижка + укладка',
              durationMinutes: 60,
              price: 1200000),
          ServicesCompanion.insert(
              id: 'sv2',
              businessId: 'b1',
              name: 'Окрашивание',
              durationMinutes: 90,
              price: 2400000),
          ServicesCompanion.insert(
              id: 'sv3',
              businessId: 'b1',
              name: 'Мужская стрижка',
              durationMinutes: 45,
              price: 700000),
          ServicesCompanion.insert(
              id: 'sv4',
              businessId: 'b1',
              name: 'Маникюр',
              durationMinutes: 75,
              price: 900000),
        ]);
        b.insertAll(clients, [
          ClientsCompanion.insert(
              id: 'c1',
              businessId: 'b1',
              name: 'Анна Ковач',
              phone: '+7 700 111 22 33',
              visitsCount: const Value(12),
              totalSpent: const Value(21000000)),
          ClientsCompanion.insert(
              id: 'c2',
              businessId: 'b1',
              name: 'Мария Лунь',
              phone: '+7 700 222 33 44',
              visitsCount: const Value(4),
              totalSpent: const Value(6800000)),
          ClientsCompanion.insert(
              id: 'c3',
              businessId: 'b1',
              name: 'Игорь Дан',
              phone: '+7 700 333 44 55',
              visitsCount: const Value(1),
              totalSpent: const Value(700000)),
          ClientsCompanion.insert(
              id: 'c4',
              businessId: 'b1',
              name: 'Елена Мороз',
              phone: '+7 700 444 55 66',
              visitsCount: const Value(8),
              totalSpent: const Value(14200000)),
        ]);
      });

      final now = DateTime.now();
      DateTime at(int h, int m) => DateTime(now.year, now.month, now.day, h, m);
      await batch((b) {
        b.insertAll(appointments, [
          AppointmentsCompanion.insert(
              id: 'a1',
              businessId: 'b1',
              clientId: 'c1',
              serviceId: 'sv1',
              staffId: const Value('st1'),
              startAt: at(10, 0),
              status: 'confirmed'),
          AppointmentsCompanion.insert(
              id: 'a2',
              businessId: 'b1',
              clientId: 'c2',
              serviceId: 'sv2',
              staffId: const Value('st1'),
              startAt: at(11, 30),
              status: 'online'),
          AppointmentsCompanion.insert(
              id: 'a3',
              businessId: 'b1',
              clientId: 'c3',
              serviceId: 'sv3',
              staffId: const Value('st2'),
              startAt: at(13, 15),
              status: 'pending'),
          AppointmentsCompanion.insert(
              id: 'a4',
              businessId: 'b1',
              clientId: 'c4',
              serviceId: 'sv4',
              staffId: const Value('st1'),
              startAt: at(15, 0),
              status: 'confirmed'),
        ]);
      });
    });
  }
}
