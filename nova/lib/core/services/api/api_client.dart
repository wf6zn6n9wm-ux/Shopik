import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';

/// Порт транспорта к бэкенду/публичному API интеграций. Реализация: HTTP-клиент
/// (dio/http) поверх [AppConfig.apiBaseUrl] с авторизацией. Держит фичи
/// независимыми от конкретного транспорта.
abstract interface class ApiClient {
  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query});
  Future<Map<String, dynamic>> post(String path, Object body);
}

/// DEFAULT: бэкенд не настроен. Замена: HttpApiClient(baseUrl, auth).
class UnconfiguredApiClient implements ApiClient {
  const UnconfiguredApiClient();

  Never _fail() =>
      throw StateError('API not configured (set AppConfig.apiBaseUrl)');

  @override
  Future<Map<String, dynamic>> get(String path,
          {Map<String, String>? query}) async =>
      _fail();

  @override
  Future<Map<String, dynamic>> post(String path, Object body) async => _fail();
}

final apiClientProvider = Provider<ApiClient>((ref) {
  // При заданном apiBaseUrl здесь создаётся реальный HttpApiClient.
  ref.watch(appConfigProvider);
  return const UnconfiguredApiClient();
});
