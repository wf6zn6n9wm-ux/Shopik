import 'package:intl/intl.dart';

/// Форматирование денег и времени. Цена хранится в минимальных единицах.
abstract final class Fmt {
  static final _time = DateFormat('HH:mm');

  static String money(int minor) {
    final major = minor ~/ 100;
    final s = NumberFormat.decimalPattern('ru').format(major);
    return '₸ $s';
  }

  static String time(DateTime dt) => _time.format(dt);

  static String range(DateTime start, DateTime end) => '${_time.format(start)} – ${_time.format(end)}';

  static String duration(int minutes) => "$minutes мин";
}
