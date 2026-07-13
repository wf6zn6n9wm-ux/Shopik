import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Знак бренда Kavio (концепция Confirm): монограмма «K», нижний штрих которой
/// переходит в галочку — «запись подтверждена». Ядро продукта — подтверждённая
/// запись. Единый источник знака для иконки, сплэша и шапок; рендерится из
/// токенов и адаптируется к теме.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 44, this.onColor});

  final double size;

  /// Цвет монограммы; по умолчанию — onAccent (контраст к акцентной плитке).
  final Color? onColor;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: kavio.accent, // плоский акцент, без градиента (правило бренда)
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: context.shadows.e1,
      ),
      child: CustomPaint(
        painter: _KMarkPainter(color: onColor ?? kavio.onAccent),
      ),
    );
  }
}

class _KMarkPainter extends CustomPainter {
  const _KMarkPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.09
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // Геометрия совпадает с растровыми ассетами бренда (viewBox 0..1).
    Offset o(double x, double y) => Offset(s * (x + 0.015), s * (y + 0.01));

    // Вертикальный стержень «K».
    canvas.drawLine(o(0.36, 0.32), o(0.36, 0.68), p);
    // Верхний штрих «K».
    canvas.drawLine(o(0.36, 0.50), o(0.54, 0.33), p);
    // Нижний штрих переходит в галочку (подтверждение).
    final check = Path()
      ..moveTo(o(0.36, 0.50).dx, o(0.36, 0.50).dy)
      ..lineTo(o(0.50, 0.67).dx, o(0.50, 0.67).dy)
      ..lineTo(o(0.76, 0.29).dx, o(0.76, 0.29).dy);
    canvas.drawPath(check, p);
  }

  @override
  bool shouldRepaint(_KMarkPainter old) => old.color != color;
}

/// Лого: знак + словесная марка «Kavio». Для сплэша, экрана входа,
/// брендовых пустых состояний.
class KavioWordmark extends StatelessWidget {
  const KavioWordmark({super.key, this.markSize = 32});

  final double markSize;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: markSize),
        SizedBox(width: markSize * 0.34),
        Text(
          'Kavio',
          style: AppTypography.title1(kavio.ink).copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
      ],
    );
  }
}
