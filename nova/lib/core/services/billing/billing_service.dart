import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Канал оплаты. Выбирается по платформе: мобайл — нативные IAP, web — Stripe.
enum BillingPlatform { appStore, playStore, stripe, none }

@immutable
class BillingProduct {
  const BillingProduct(
      {required this.id, required this.title, required this.priceLabel});
  final String id;
  final String title;
  final String priceLabel;
}

@immutable
class PurchaseResult {
  const PurchaseResult({required this.success, this.productId, this.error});
  final bool success;
  final String? productId;
  final String? error;
}

/// Порт биллинга. Единый контракт поверх трёх каналов:
/// - Apple In-App Purchase (StoreKit)
/// - Google Play Billing
/// - Stripe (web)
/// Реализации-адаптеры подключаются без изменения фич — они читают только
/// [purchasedProductIds] через SubscriptionService.
abstract interface class BillingService {
  BillingPlatform get platform;
  Future<List<BillingProduct>> products();
  Future<PurchaseResult> purchase(String productId);
  Future<void> restore();

  /// Источник прав: множество купленных product id (реактивно).
  Stream<Set<String>> purchasedProductIds();
}

/// DEFAULT: без покупок. Замена: StoreKitBilling / PlayBilling / StripeBilling.
class NoopBillingService implements BillingService {
  @override
  BillingPlatform get platform => BillingPlatform.none;

  @override
  Future<List<BillingProduct>> products() async => const [];

  @override
  Future<PurchaseResult> purchase(String productId) async =>
      const PurchaseResult(success: false, error: 'billing_not_configured');

  @override
  Future<void> restore() async {}

  @override
  Stream<Set<String>> purchasedProductIds() => Stream.value(const <String>{});
}

final billingServiceProvider = Provider<BillingService>((ref) {
  // Выбор адаптера по платформе делается здесь (StoreKit / Play / Stripe).
  // Пока — no-op, чтобы приложение работало без настроенного биллинга.
  return NoopBillingService();
});
