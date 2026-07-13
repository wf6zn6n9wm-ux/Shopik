import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Флаги фич — включают/выключают функциональность удалённо и постепенно
/// (staged rollout, kill switch). Значения приходят из Remote Config.
enum FeatureFlag {
  onlineBooking,
  push,
  aiAssistant,
  teams,
  finances,
  analytics,
  marketplace,
  integrations,
  dragAndDrop,
  publicPages,
  dataImport,
}

/// Порт Remote Config + Feature Flags. Реализации: Firebase Remote Config,
/// собственный конфиг-эндпоинт. Экраны читают флаги, не зная об источнике.
abstract interface class RemoteConfigService {
  Future<void> initialize();
  bool flag(FeatureFlag f);
  bool getBool(String key, {bool? fallback});
  String getString(String key, {String? fallback});
  int getInt(String key, {int? fallback});
}

/// DEFAULT: компайл-тайм значения. Замена: FirebaseRemoteConfigService и т.п.
class LocalRemoteConfigService implements RemoteConfigService {
  // Дефолты для постепенного раскатывания. Реальные значения приходят из
  // Remote Config (адаптер), позволяя включать фичи без релиза.
  static const Map<FeatureFlag, bool> _defaults = {
    FeatureFlag.onlineBooking: true,
    FeatureFlag.push: false,
    FeatureFlag.aiAssistant: false,
    FeatureFlag.teams: false,
    FeatureFlag.finances: false,
    FeatureFlag.analytics: true,
    FeatureFlag.marketplace: false,
    FeatureFlag.integrations: false,
    FeatureFlag.dragAndDrop: true,
    FeatureFlag.publicPages: false,
    FeatureFlag.dataImport: false,
  };

  @override
  Future<void> initialize() async {}

  @override
  bool flag(FeatureFlag f) => _defaults[f] ?? false;

  @override
  bool getBool(String key, {bool? fallback}) => fallback ?? false;

  @override
  String getString(String key, {String? fallback}) => fallback ?? '';

  @override
  int getInt(String key, {int? fallback}) => fallback ?? 0;
}

final remoteConfigServiceProvider =
    Provider<RemoteConfigService>((ref) => LocalRemoteConfigService());

/// `ref.watch(featureFlagProvider(FeatureFlag.marketplace))`.
final featureFlagProvider = Provider.family<bool, FeatureFlag>(
  (ref, f) => ref.watch(remoteConfigServiceProvider).flag(f),
);
