import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

@immutable
class PushMessage {
  const PushMessage({this.title, this.body, this.data = const {}});
  final String? title;
  final String? body;
  final Map<String, Object?> data;
}

/// Порт push-уведомлений. Реализация: Firebase Cloud Messaging (mobile/web),
/// APNs. Экраны/сервисы подписываются на [messages] и получают [token].
abstract interface class PushService {
  Future<void> initialize();
  Future<String?> token();
  Stream<PushMessage> messages();
}

/// DEFAULT: no-op (пуши выключены). Замена: FcmPushService.
class NoopPushService implements PushService {
  @override
  Future<void> initialize() async {}

  @override
  Future<String?> token() async => null;

  @override
  Stream<PushMessage> messages() => const Stream<PushMessage>.empty();
}

final pushServiceProvider = Provider<PushService>((ref) => NoopPushService());
