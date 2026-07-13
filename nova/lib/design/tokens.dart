import 'package:flutter/animation.dart';

/// Токены, не зависящие от темы (одинаковы в light/dark).
/// Всё стоит на 4pt-сетке. Ноль случайных значений.

/// Отступы — 4pt grid.
abstract final class Spacing {
  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20; // экранное поле
  static const double s6 = 24;
  static const double s8 = 32;
  static const double s10 = 40;
  static const double s12 = 48;
  static const double s16 = 64;
}

/// Радиусы — растут вместе с площадью элемента.
abstract final class Radii {
  static const double xs = 8; // чипы, sm-кнопки
  static const double sm = 12; // кнопки, поля
  static const double md = 16; // карточки, строки
  static const double lg = 20; // крупные карточки, листы
  static const double xl = 28; // верх bottom sheet
  static const double full = 999; // пилюли, аватары, FAB
}

/// Motion — длительности и кривые. Никогда > 400 мс.
abstract final class Motion {
  static const Duration instant = Duration(milliseconds: 100);
  static const Duration fast = Duration(milliseconds: 180);
  static const Duration base = Duration(milliseconds: 250);
  static const Duration slow = Duration(milliseconds: 320);

  /// Появление: быстро → мягко.
  static const Cubic enter = Cubic(0.05, 0.7, 0.1, 1);

  /// Уход: быстро.
  static const Cubic exit = Cubic(0.3, 0, 0.8, 0.15);

  /// Общий переход.
  static const Cubic standard = Cubic(0.2, 0, 0, 1);
}
