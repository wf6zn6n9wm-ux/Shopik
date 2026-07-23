import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../billing/billing_service.dart';

/// Тарифные планы собственной системы подписок.
enum Plan { free, pro, team }

/// Возможности, гейтящиеся подпиской. Экран спрашивает `has(Feature.x)`, а не
/// знает про цены/каналы оплаты.
enum Feature {
  onlineBooking,
  team,
  branches,
  marketplace,
  api,
  analyticsPro,
  aiAssistant,
  export,
  importData,
}

@immutable
class Entitlement {
  const Entitlement(this.plan, this.features);
  final Plan plan;
  final Set<Feature> features;

  bool has(Feature f) => features.contains(f);

  static const Entitlement free = Entitlement(Plan.free, {
    Feature.onlineBooking,
    Feature.export,
  });

  static const Entitlement pro = Entitlement(Plan.pro, {
    Feature.onlineBooking,
    Feature.analyticsPro,
    Feature.marketplace,
    Feature.aiAssistant,
    Feature.export,
    Feature.importData,
  });

  static Entitlement get team => Entitlement(Plan.team, Feature.values.toSet());
}

/// Порт подписок: резолвит текущие права из покупок биллинга + бэкенда.
abstract interface class SubscriptionService {
  Stream<Entitlement> watch();
  Entitlement get current;
}

/// DEFAULT: выводит план из купленных product id. Замена/расширение: сверка с
/// сервером (source of truth), гейс-периоды, командные seat'ы.
class DefaultSubscriptionService implements SubscriptionService {
  DefaultSubscriptionService(this._billing, {required Entitlement fallback})
      : _fallback = fallback;

  final BillingService _billing;
  final Entitlement _fallback;

  Entitlement _map(Set<String> ids) {
    if (ids.contains('kavio_team')) return Entitlement.team;
    if (ids.contains('kavio_pro')) return Entitlement.pro;
    return _fallback;
  }

  @override
  Stream<Entitlement> watch() => _billing.purchasedProductIds().map(_map);

  @override
  Entitlement get current => _fallback;
}

final subscriptionServiceProvider = Provider<SubscriptionService>((ref) {
  final cfg = ref.watch(appConfigProvider);
  final billing = ref.watch(billingServiceProvider);
  // В dev все возможности открыты для разработки; в prod — free до покупки.
  return DefaultSubscriptionService(
    billing,
    fallback: cfg.isDev ? Entitlement.team : Entitlement.free,
  );
});

final entitlementProvider = StreamProvider<Entitlement>(
    (ref) => ref.watch(subscriptionServiceProvider).watch());

/// Хелпер гейтинга: `ref.watch(hasFeatureProvider(Feature.marketplace))`.
final hasFeatureProvider = Provider.family<bool, Feature>((ref, feature) {
  final ent = ref.watch(entitlementProvider).value ?? Entitlement.free;
  return ent.has(feature);
});
