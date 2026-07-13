import 'package:intl/intl.dart';

import '../core/money/money.dart';

/// Форматирование денег и времени. Цена хранится в минимальных единицах.
/// Мировой продукт: валюта не захардкожена — задаётся дефолтом бизнеса
/// (устанавливается в bootstrap из AppConfig), суммы носят её символ.
abstract final class Fmt {
  static final _time = DateFormat('HH:mm');

  /// Валюта по умолчанию для отображения (мировой дефолт — USD).
  static Currency currency = Currency.usd;

  /// Устанавливается в bootstrap из конфигурации бизнеса.
  static void useCurrency(Currency c) => currency = c;

  static String money(int minor) => Money(minor, currency).format();

  static String time(DateTime dt) => _time.format(dt);

  static String range(DateTime start, DateTime end) =>
      '${_time.format(start)} – ${_time.format(end)}';

  static String duration(int minutes) => "$minutes мин";
}
