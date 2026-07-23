import 'package:intl/intl.dart';

import '../core/localization/app_text.dart';
import '../core/money/money.dart';

/// Форматирование денег и времени. Цена хранится в минимальных единицах.
/// Мировой продукт: валюта не захардкожена — задаётся дефолтом бизнеса
/// (устанавливается в bootstrap из AppConfig), суммы носят её символ.
abstract final class Fmt {
  static final _time = DateFormat('HH:mm');

  /// Валюта відображення. Дефолт — ₴ (UAH); встановлюється в bootstrap.
  static Currency currency = Currency.uah;

  /// Встановлюється в bootstrap із конфігурації бізнесу.
  static void useCurrency(Currency c) => currency = c;

  /// Гроші без копійок для великих сум на дашборді (₴2 400, а не ₴2 400,00).
  static String money(int minor) {
    final major = (minor / 100).round();
    final s = major.toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return '${currency.symbol}$buf';
  }

  static String moneyExact(int minor) => Money(minor, currency).format();

  static String time(DateTime dt) => _time.format(dt);

  static String range(DateTime start, DateTime end) =>
      '${_time.format(start)} – ${_time.format(end)}';

  static String duration(int minutes) =>
      '$minutes ${gLang == 'en' ? 'min' : gLang == 'ru' ? 'мин' : 'хв'}';

  static const _monthsUk = [
    'січня',
    'лютого',
    'березня',
    'квітня',
    'травня',
    'червня',
    'липня',
    'серпня',
    'вересня',
    'жовтня',
    'листопада',
    'грудня'
  ];
  static const _monthsEn = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  static const _monthsRu = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря'
  ];
  static const _weekdaysUk = [
    'Понеділок',
    'Вівторок',
    'Середа',
    'Четвер',
    "П'ятниця",
    'Субота',
    'Неділя'
  ];
  static const _weekdaysEn = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];
  static const _weekdaysRu = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье'
  ];

  static List<String> get _months => switch (gLang) {
        'en' => _monthsEn,
        'ru' => _monthsRu,
        _ => _monthsUk,
      };
  static List<String> get _weekdays => switch (gLang) {
        'en' => _weekdaysEn,
        'ru' => _weekdaysRu,
        _ => _weekdaysUk,
      };

  static String dayMonth(DateTime d) => gLang == 'en'
      ? '${_months[d.month - 1]} ${d.day}'
      : '${d.day} ${_months[d.month - 1]}';
  static String weekday(DateTime d) => _weekdays[d.weekday - 1];
}
