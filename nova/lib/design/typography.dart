import 'package:flutter/widgets.dart';

/// Типографика Nova — 8 ступеней на 4pt-ритме. Гарнитура Inter забандлена
/// локально (offline-first). Точные веса — через fontVariations вариативного
/// шрифта. Размеры/веса не зависят от темы; цвет передаётся при использовании.
abstract final class AppTypography {
  static const String _family = 'Inter';

  static TextStyle _base({
    required double size,
    required double height,
    required FontWeight weight,
    required double tracking,
    Color? color,
  }) {
    return TextStyle(
      fontFamily: _family,
      fontSize: size,
      height: height / size,
      fontWeight: weight,
      fontVariations: [FontVariation('wght', weight.value.toDouble())],
      letterSpacing: tracking,
      color: color,
    );
  }

  static TextStyle display([Color? c]) => _base(
      size: 34, height: 40, weight: FontWeight.w700, tracking: -0.75, color: c);

  static TextStyle title1([Color? c]) => _base(
      size: 27, height: 32, weight: FontWeight.w700, tracking: -0.54, color: c);

  static TextStyle title2([Color? c]) => _base(
      size: 21, height: 28, weight: FontWeight.w600, tracking: -0.29, color: c);

  static TextStyle title3([Color? c]) => _base(
      size: 17, height: 24, weight: FontWeight.w600, tracking: -0.14, color: c);

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
