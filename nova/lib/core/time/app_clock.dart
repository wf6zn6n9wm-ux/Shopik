import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Часы приложения. Мультизональность: все временные метки храним в UTC,
/// а отображаем в таймзоне бизнеса (IANA id в `Business.timeZone`). Порт
/// позволяет подменять источник времени (тесты, серверное время) и подключить
/// полноценную конверсию таймзон (пакет `timezone`) без правок фич.
abstract interface class Clock {
  DateTime nowUtc();
}

class SystemClock implements Clock {
  const SystemClock();

  @override
  DateTime nowUtc() => DateTime.now().toUtc();
}

final clockProvider = Provider<Clock>((ref) => const SystemClock());
