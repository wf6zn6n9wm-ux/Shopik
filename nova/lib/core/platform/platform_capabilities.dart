import 'package:flutter/foundation.dart';

/// Единая точка правды о платформе. Фичи спрашивают возможности, а не «какая
/// ОС» — так web/desktop/mobile обслуживаются одной кодовой базой.
abstract final class PlatformCapabilities {
  static bool get isWeb => kIsWeb;

  static bool get isDesktop =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.windows ||
          defaultTargetPlatform == TargetPlatform.macOS ||
          defaultTargetPlatform == TargetPlatform.linux);

  static bool get isMobile =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  static bool get isApple =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.macOS);

  /// Нативные покупки (StoreKit / Play Billing) доступны только на мобильных.
  static bool get supportsNativeIap => isMobile;

  /// На web оплата идёт через Stripe.
  static bool get prefersStripeCheckout => isWeb;
}
