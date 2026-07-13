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
  TextColumn get industry => text().withDefault(const Constant('other'))();
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

/// Универсальный ресурс: кабинет, кресло, авто, студия, печь, оборудование,
/// переговорная — что угодно. Одна модель для любой вертикали.
@DataClassName('ResourceRow')
class Resources extends Table {
  TextColumn get id => text()();
  TextColumn get businessId => text()();
  TextColumn get name => text()();
  TextColumn get type => text().withDefault(const Constant('room'))();
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
  // Универсальные измерения календаря: филиал и ресурс (кабинет/кресло/авто…).
  TextColumn get locationId => text().nullable()();
  TextColumn get resourceId => text().nullable()();
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
    Resources,
    Appointments
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'kavio'));
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

  domain.Resource _toResource(ResourceRow r) =>
      domain.Resource(id: r.id, name: r.name, type: r.type);

  domain.Appointment _toAppointment(
    AppointmentRow a,
    ClientRow c,
    ServiceRow s,
    StaffRow? st,
    ResourceRow? res,
  ) =>
      domain.Appointment(
        id: a.id,
        client: _toClient(c),
        service: _toService(s),
        staff: st == null ? null : _toStaff(st),
        resource: res == null ? null : _toResource(res),
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

  /// Полный join записи (клиент+услуга+мастер+ресурс) для одного ряда.
  List<Join> _appointmentJoins() => [
        innerJoin(clients, clients.id.equalsExp(appointments.clientId)),
        innerJoin(services, services.id.equalsExp(appointments.serviceId)),
        leftOuterJoin(
            staffMembers, staffMembers.id.equalsExp(appointments.staffId)),
        leftOuterJoin(
            resources, resources.id.equalsExp(appointments.resourceId)),
      ];

  domain.Appointment _rowToAppointment(TypedResult row) => _toAppointment(
        row.readTable(appointments),
        row.readTable(clients),
        row.readTable(services),
        row.readTableOrNull(staffMembers),
        row.readTableOrNull(resources),
      );

  Stream<List<domain.Appointment>> _watchBetween(DateTime start, DateTime end) {
    final query = select(appointments).join(_appointmentJoins())
      ..where(appointments.startAt.isBiggerOrEqualValue(start) &
          appointments.startAt.isSmallerThanValue(end))
      ..orderBy([OrderingTerm.asc(appointments.startAt)]);
    return query.watch().map((rows) => rows.map(_rowToAppointment).toList());
  }

  /// Все записи клиента (история/метрики карточки), новые сверху.
  Stream<List<domain.Appointment>> watchClientAppointments(String clientId) {
    final query = select(appointments).join(_appointmentJoins())
      ..where(appointments.clientId.equals(clientId))
      ..orderBy([OrderingTerm.desc(appointments.startAt)]);
    return query.watch().map((rows) => rows.map(_rowToAppointment).toList());
  }

  Stream<List<domain.Appointment>> watchDay(DateTime day) {
    final start = DateTime(day.year, day.month, day.day);
    return _watchBetween(start, start.add(const Duration(days: 1)));
  }

  /// Записи в полуоткрытом диапазоне [start, end) — для Недели/Месяца.
  Stream<List<domain.Appointment>> watchRange(DateTime start, DateTime end) =>
      _watchBetween(start, end);

  Future<void> addAppointment(domain.Appointment a,
      {String businessId = 'b1'}) {
    return into(appointments).insert(AppointmentsCompanion.insert(
      id: a.id,
      businessId: businessId,
      clientId: a.client.id,
      serviceId: a.service.id,
      staffId: Value(a.staff?.id),
      resourceId: Value(a.resource?.id),
      startAt: a.start,
      status: a.status.name,
    ));
  }

  Future<void> setAppointmentStatus(
      String id, domain.AppointmentStatus status) {
    return (update(appointments)..where((t) => t.id.equals(id)))
        .write(AppointmentsCompanion(status: Value(status.name)));
  }

  /// Перенос записи (Drag & Drop): меняет только время начала.
  Future<void> moveAppointment(String id, DateTime newStart) {
    return (update(appointments)..where((t) => t.id.equals(id)))
        .write(AppointmentsCompanion(startAt: Value(newStart)));
  }

  Future<void> deleteAppointment(String id) {
    return (delete(appointments)..where((t) => t.id.equals(id))).go();
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

  /// Базовое рабочее пространство при первом запуске: бизнес + филиал + один
  /// специалист. Нейтрально к сфере — услуги приходят из отраслевого шаблона на
  /// онбординге. Идемпотентно (по наличию бизнеса).
  Future<void> ensureSeeded() async {
    final has = await (select(businesses)..limit(1)).get();
    if (has.isNotEmpty) return;

    await transaction(() async {
      await into(businesses)
          .insert(BusinessesCompanion.insert(id: 'b1', name: 'Мой бизнес'));
      await into(locations).insert(
        LocationsCompanion.insert(id: 'l1', businessId: 'b1', name: 'Основной'),
      );
      await into(staffMembers).insert(
        StaffMembersCompanion.insert(
            id: 'st1',
            businessId: 'b1',
            name: 'Я',
            role: const Value('Специалист')),
      );
    });
  }

  /// Применяет отраслевой шаблон: задаёт индустрию бизнеса и наполняет каталог
  /// категориями и услугами. Идемпотентно — заменяет прежний каталог, поэтому
  /// смена сферы не плодит дубли. `seeds`: (категория, название, минуты, цена).
  Future<void> applyIndustryTemplate(
    String industryId,
    List<(String, String, int, int)> seeds, {
    String businessId = 'b1',
  }) async {
    await transaction(() async {
      await (update(businesses)..where((t) => t.id.equals(businessId)))
          .write(BusinessesCompanion(industry: Value(industryId)));
      await (delete(services)..where((t) => t.businessId.equals(businessId)))
          .go();
      await (delete(serviceCategories)
            ..where((t) => t.businessId.equals(businessId)))
          .go();

      final categoryIds = <String, String>{};
      var catIndex = 0;
      for (final seed in seeds) {
        final categoryName = seed.$1;
        if (!categoryIds.containsKey(categoryName)) {
          final id = '${businessId}_cat_$catIndex';
          categoryIds[categoryName] = id;
          await into(serviceCategories)
              .insert(ServiceCategoriesCompanion.insert(
            id: id,
            businessId: businessId,
            name: categoryName,
            sortOrder: Value(catIndex),
          ));
          catIndex++;
        }
      }

      var serviceIndex = 0;
      final rows = <ServicesCompanion>[
        for (final seed in seeds)
          ServicesCompanion.insert(
            id: '${businessId}_sv_${serviceIndex++}',
            businessId: businessId,
            categoryId: Value(categoryIds[seed.$1]),
            name: seed.$2,
            durationMinutes: seed.$3,
            price: seed.$4,
          ),
      ];
      await batch((b) => b.insertAll(services, rows));
    });
  }
}
