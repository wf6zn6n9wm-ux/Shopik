import 'package:flutter_riverpod/flutter_riverpod.dart';

enum SyncStatus { idle, syncing, offline, error }

/// Порт синхронизации. Local-first: Drift на устройстве — источник для UI;
/// синк с сервером идёт фоново (outbox/очередь изменений, разрешение
/// конфликтов). Репозитории и экраны не меняются при включении синка.
abstract interface class SyncService {
  Stream<SyncStatus> status();
  Future<void> sync();

  /// Поставить изменение в очередь отправки (outbox).
  Future<void> enqueue(String entity, String id, Map<String, Object?> payload);
}

/// DEFAULT: только локально (без сервера) — офлайн-режим. Замена:
/// BackendSyncService (outbox → API/Supabase, pull-подписки, конфликты).
class LocalOnlySyncService implements SyncService {
  @override
  Stream<SyncStatus> status() => Stream.value(SyncStatus.idle);

  @override
  Future<void> sync() async {}

  @override
  Future<void> enqueue(
      String entity, String id, Map<String, Object?> payload) async {}
}

final syncServiceProvider =
    Provider<SyncService>((ref) => LocalOnlySyncService());
