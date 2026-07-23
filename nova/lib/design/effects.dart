import 'package:flutter/material.dart';

import 'colors.dart';

/// Материалы Запис+ (Flux-premium): фирменные градиенты, свечение, стекло,
/// глубина. Единственный источник «дорогих» поверхностей — экраны не собирают
/// декорации вручную, чтобы пиксель-в-пиксель совпадать с макетами v3.
abstract final class FX {
  // --- Бренд ---
  /// Иридий — единственный акцент. Кнопка/FAB: вертикальный градиент.
  static const Gradient brandButton = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFA6A6FC), Color(0xFF8686F2)],
  );

  static const Color accentGlow = Color(0xBF8B8BF0); // rgba(139,139,240,.75)
  static const Color accentSoft = Color(0x2E8B8BF0); // rgba(139,139,240,.18)

  // --- Свечение под акцентными элементами ---
  static List<BoxShadow> glow(
          {double y = 18, double blur = 38, double spread = -8}) =>
      [
        BoxShadow(
            color: accentGlow,
            blurRadius: blur,
            spreadRadius: spread,
            offset: Offset(0, y)),
      ];

  // --- Карточка: linear-gradient(180deg,#1A1A22,#151519), border line, r22 ---
  static BoxDecoration card(KavioColors c, {double radius = 22}) =>
      BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1A1A22), Color(0xFF151519)],
        ),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: c.line, width: 1),
        boxShadow: const [
          BoxShadow(
              color: Color(0xE6000000),
              blurRadius: 40,
              spreadRadius: -24,
              offset: Offset(0, 18)),
        ],
      );

  // --- Hero: iris-заливка 158deg + свечение + border accent .28 ---
  static BoxDecoration hero({double radius = 24}) => BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment(-0.8, -1),
          end: Alignment(0.8, 1),
          colors: [Color(0x3D8B8BF0), Color(0x0F8B8BF0), Color(0xFF16161E)],
          stops: [0, 0.55, 1],
        ),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0x478B8BF0), width: 1), // .28
        boxShadow: const [
          BoxShadow(
              color: Color(0x8C5A5AD8),
              blurRadius: 54,
              spreadRadius: -28,
              offset: Offset(0, 24)),
        ],
      );

  // --- Кнопка: градиент + свечение + тонкая обводка ---
  static BoxDecoration button({double radius = 17}) => BoxDecoration(
        gradient: brandButton,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0x598B8BF0), width: 1),
        boxShadow: const [
          BoxShadow(
              color: accentGlow,
              blurRadius: 38,
              spreadRadius: -8,
              offset: Offset(0, 18)),
        ],
      );

  static BoxDecoration buttonSecondary(KavioColors c, {double radius = 16}) =>
      BoxDecoration(
        color: c.surface2,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: c.line, width: 1),
      );

  // --- Вільне вікно: пунктир iris + мягкая заливка ---
  static BoxDecoration freeSlot({double radius = 16}) => BoxDecoration(
        color: const Color(0x0F8B8BF0), // rgba(139,139,240,.06)
        borderRadius: BorderRadius.circular(radius),
      );

  static const Color freeSlotBorder = Color(0x808B8BF0); // .50 dashed

  // --- Стекло (нав-бар, тосты, поиск): полупрозрачность + blur ---
  static const Color glassFill = Color(0x99101018); // rgba(16,16,24,.6)
  static const Color navFill = Color(0xA8121A1A); // rgba(18,18,26,.66)
  static const double glassBlur = 22;
  static const double navBlur = 24;
}

/// Радиальное «пятно света» под hero-карточками и в шапках.
class GlowOrb extends StatelessWidget {
  const GlowOrb({
    super.key,
    this.size = 160,
    this.color = const Color(0x4D8B8BF0),
  });
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
              colors: [color, color.withOpacity(0)], stops: const [0, 0.62]),
        ),
      ),
    );
  }
}
