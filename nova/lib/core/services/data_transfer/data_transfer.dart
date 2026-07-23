import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// --- Экспорт данных ---

@immutable
class ExportBundle {
  const ExportBundle({required this.format, required this.data});
  final String format; // 'json' | 'csv'
  final String data;
}

/// Порт экспорта. Пользователь всегда может забрать свои данные (GDPR-friendly).
abstract interface class ExportService {
  Future<ExportBundle> exportAll();
}

/// DEFAULT: пустой JSON. Замена: DriftExportService (читает БД → JSON/CSV, файл).
class EmptyExportService implements ExportService {
  @override
  Future<ExportBundle> exportAll() async =>
      const ExportBundle(format: 'json', data: '{}');
}

/// --- Импорт данных из конкурентов ---

enum ImportSource { fresha, booksy, easyweek, visit, csv }

@immutable
class ImportResult {
  const ImportResult(
      {this.clients = 0, this.services = 0, this.appointments = 0});
  final int clients;
  final int services;
  final int appointments;
}

/// Порт импорта. Каждый конкурент — отдельный адаптер-парсер под общий контракт,
/// поэтому новые источники добавляются без правок ядра.
abstract interface class ImportService {
  List<ImportSource> supportedSources();
  Future<ImportResult> import(ImportSource source, String rawData);
}

/// DEFAULT: список источников объявлен, парсеры подключаются позже.
class RegistryImportService implements ImportService {
  @override
  List<ImportSource> supportedSources() => ImportSource.values;

  @override
  Future<ImportResult> import(ImportSource source, String rawData) async =>
      throw UnimplementedError(
          'Импорт из $source — адаптер подключается отдельно');
}

final exportServiceProvider =
    Provider<ExportService>((ref) => EmptyExportService());
final importServiceProvider =
    Provider<ImportService>((ref) => RegistryImportService());
