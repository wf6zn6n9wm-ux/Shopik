import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Знак бренда Запис+ — «Галочка+»: галочка (запис підтверджено) з маленьким
/// плюсом (запис додано / «+» у назві). Читається навіть у малому розмірі.
/// Єдине джерело знаку для splash, входу, шапок; рендериться з токенів.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 44, this.glow = true});

  final double size;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _CheckPlusPainter(glow: glow)),
    );
  }
}

class _CheckPlusPainter extends CustomPainter {
  const _CheckPlusPainter({required this.glow});
  final bool glow;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    // viewBox 0..100 → масштаб.
    double x(double v) => s * v / 100;

    final shader = const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFFB8B8FF), Color(0xFF7E7EEF)],
    ).createShader(Rect.fromLTWH(0, 0, s, s));

    final check = Path()
      ..moveTo(x(24), x(54))
      ..lineTo(x(43), x(72))
      ..lineTo(x(74), x(32));
    final plus = Path()
      ..moveTo(x(78), x(24))
      ..lineTo(x(78), x(40))
      ..moveTo(x(70), x(32))
      ..lineTo(x(86), x(32));

    if (glow) {
      final g = Paint()
        ..color = const Color(0x998B8BF0)
        ..style = PaintingStyle.stroke
        ..strokeWidth = x(9)
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, x(6));
      canvas.drawPath(check, g);
    }

    final pen = Paint()
      ..shader = shader
      ..style = PaintingStyle.stroke
      ..strokeWidth = x(9)
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(check, pen);

    final plusPen = Paint()
      ..color = const Color(0xFF9A9AF6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = x(6.5)
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(plus, plusPen);
  }

  @override
  bool shouldRepaint(_CheckPlusPainter old) => old.glow != glow;
}

/// Лого: знак + словесна марка «Запис+». Для splash, входу, порожніх станів.
class KavioWordmark extends StatelessWidget {
  const KavioWordmark({super.key, this.markSize = 32, this.fontSize = 28});

  final double markSize;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: markSize),
        SizedBox(width: markSize * 0.34),
        Text.rich(
          TextSpan(
            style: AppTypography.title1(k.ink).copyWith(fontSize: fontSize),
            children: [
              const TextSpan(text: 'Запис'),
              TextSpan(text: '+', style: TextStyle(color: k.accent)),
            ],
          ),
        ),
      ],
    );
  }
}
