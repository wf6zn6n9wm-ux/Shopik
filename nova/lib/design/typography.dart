import 'package:flutter/widgets.dart';
import 'package:google_fonts/google_fonts.dart';

/// Типографика Запис+ — Inter, веса 400–800. Пока TTF не забандлен, гарнитура
/// подтягивается в рантайме через google_fonts (на вебе — из браузера), что
/// даёт пиксель-в-пиксель типографику макетов. Размеры/веса не зависят от темы.
abstract final class AppTypography {
  static TextStyle _base({
    required double size,
    required double height,
    required FontWeight weight,
    required double tracking,
    Color? color,
  }) {
    return GoogleFonts.inter(
      fontSize: size,
      height: height / size,
      fontWeight: weight,
      letterSpacing: tracking,
      color: color,
    );
  }

  static TextStyle display([Color? c]) => _base(
      size: 34, height: 40, weight: FontWeight.w800, tracking: -1.0, color: c);

  static TextStyle title1([Color? c]) => _base(
      size: 28, height: 33, weight: FontWeight.w800, tracking: -0.84, color: c);

  static TextStyle title2([Color? c]) => _base(
      size: 20, height: 26, weight: FontWeight.w800, tracking: -0.4, color: c);

  static TextStyle title3([Color? c]) => _base(
      size: 17, height: 23, weight: FontWeight.w700, tracking: -0.2, color: c);

  static TextStyle body([Color? c]) => _base(
      size: 15, height: 22, weight: FontWeight.w400, tracking: 0, color: c);

  static TextStyle label([Color? c]) => _base(
      size: 13, height: 18, weight: FontWeight.w500, tracking: 0, color: c);

  static TextStyle caption([Color? c]) => _base(
      size: 11.5, height: 16, weight: FontWeight.w600, tracking: 0.8, color: c);

  /// Табличные цифры для денег/времени.
  static TextStyle tabular(TextStyle style) => style.copyWith(
        fontFeatures: const [FontFeature.tabularFigures()],
      );
}
