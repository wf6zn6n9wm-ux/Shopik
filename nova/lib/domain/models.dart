import 'package:flutter/foundation.dart';

/// Доменные модели Nova. Иммутабельные, с copyWith.
/// Appointment — центральный узел (клиент + мастер + услуга + время + статус).

enum AppointmentStatus { online, confirmed, pending, inProgress, completed, noShow, cancelled }

extension AppointmentStatusX on AppointmentStatus {
  String get label => switch (this) {
        AppointmentStatus.online => 'онлайн',
        AppointmentStatus.confirmed => 'подтв.',
        AppointmentStatus.pending => 'ждём',
        AppointmentStatus.inProgress => 'идёт',
        AppointmentStatus.completed => 'завершён',
        AppointmentStatus.noShow => 'неявка',
        AppointmentStatus.cancelled => 'отменён',
      };
}

@immutable
class Client {
  const Client({
    required this.id,
    required this.name,
    required this.phone,
    this.visitsCount = 0,
    this.totalSpent = 0,
    this.note,
    this.tags = const [],
  });

  final String id;
  final String name;
  final String phone;
  final int visitsCount;
  final int totalSpent; // в минимальных единицах валюты
  final String? note;
  final List<String> tags;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }

  Client copyWith({int? visitsCount, int? totalSpent, String? note, List<String>? tags}) => Client(
        id: id,
        name: name,
        phone: phone,
        visitsCount: visitsCount ?? this.visitsCount,
        totalSpent: totalSpent ?? this.totalSpent,
        note: note ?? this.note,
        tags: tags ?? this.tags,
      );
}

@immutable
class Service {
  const Service({
    required this.id,
    required this.name,
    required this.durationMinutes,
    required this.price,
    this.category,
  });

  final String id;
  final String name;
  final int durationMinutes;
  final int price;
  final String? category;
}

@immutable
class Staff {
  const Staff({required this.id, required this.name, this.role = 'Мастер'});
  final String id;
  final String name;
  final String role;
}

@immutable
class Appointment {
  const Appointment({
    required this.id,
    required this.client,
    required this.service,
    required this.start,
    required this.status,
    this.staff,
  });

  final String id;
  final Client client;
  final Service service;
  final DateTime start;
  final AppointmentStatus status;
  final Staff? staff;

  DateTime get end => start.add(Duration(minutes: service.durationMinutes));

  Appointment copyWith({AppointmentStatus? status, DateTime? start}) => Appointment(
        id: id,
        client: client,
        service: service,
        start: start ?? this.start,
        status: status ?? this.status,
        staff: staff,
      );
}
