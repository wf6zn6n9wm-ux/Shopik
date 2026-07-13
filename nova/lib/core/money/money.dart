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

  static const Currency kzt = Currency(code: 'KZT', symbol: '₸', decimalDigits: 0, locale: 'ru');
  static const Currency usd = Currency(code: 'USD', symbol: r'$', decimalDigits: 2, locale: 'en');
  static const Currency eur = Currency(code: 'EUR', symbol: '€', decimalDigits: 2, locale: 'de');
  static const Currency rub = Currency(code: 'RUB', symbol: '₽', decimalDigits: 2, locale: 'ru');
  static const Currency uah = Currency(code: 'UAH', symbol: '₴', decimalDigits: 2, locale: 'uk');

  static const List<Currency> all = [kzt, usd, eur, rub, uah];

  static Currency byCode(String code) =>
      all.firstWhere((c) => c.code == code, orElse: () => kzt);
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
