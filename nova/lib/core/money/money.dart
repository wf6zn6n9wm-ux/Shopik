import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

/// Валюта. Мультивалютность с первого дня: у бизнеса своя валюта, суммы носят
/// её с собой. Хранение — в минимальных единицах (тиын/копейки/центы).
@immutable
class Currency {
  const Currency({
    required this.code,
    required this.symbol,
    this.decimalDigits = 2,
    this.locale = 'en',
  });

  final String code;
  final String symbol;
  final int decimalDigits;
  final String locale;

  // Мировой продукт: любая валюта. Набор ниже — стартовый, легко расширяется.
  static const Currency usd =
      Currency(code: 'USD', symbol: r'$', decimalDigits: 2, locale: 'en');
  static const Currency eur =
      Currency(code: 'EUR', symbol: '€', decimalDigits: 2, locale: 'de');
  static const Currency gbp =
      Currency(code: 'GBP', symbol: '£', decimalDigits: 2, locale: 'en_GB');
  static const Currency uah =
      Currency(code: 'UAH', symbol: '₴', decimalDigits: 2, locale: 'uk');
  static const Currency pln =
      Currency(code: 'PLN', symbol: 'zł', decimalDigits: 2, locale: 'pl');
  static const Currency cad =
      Currency(code: 'CAD', symbol: r'C$', decimalDigits: 2, locale: 'en_CA');
  static const Currency aud =
      Currency(code: 'AUD', symbol: r'A$', decimalDigits: 2, locale: 'en_AU');
  static const Currency kzt =
      Currency(code: 'KZT', symbol: '₸', decimalDigits: 0, locale: 'kk');

  static const List<Currency> all = [usd, eur, gbp, uah, pln, cad, aud, kzt];

  static Currency byCode(String code) =>
      all.firstWhere((c) => c.code == code, orElse: () => usd);
}

/// Денежная сумма. Иммутабельна, привязана к валюте.
@immutable
class Money {
  const Money(this.minor, this.currency);

  final int minor;
  final Currency currency;

  double get major => minor / _pow10(currency.decimalDigits);

  String format() {
    final f = NumberFormat.currency(
      locale: currency.locale,
      symbol: currency.symbol,
      decimalDigits: currency.decimalDigits,
    );
    return f.format(major);
  }

  static int _pow10(int n) {
    var r = 1;
    for (var i = 0; i < n; i++) {
      r *= 10;
    }
    return r;
  }
}
