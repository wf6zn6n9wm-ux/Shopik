import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Знак бренда Kavio: squircle-плитка с монограммой «K», где верхний штрих
/// уходит вверх-вправо — движение и рост (бизнес по записи, который набирает
/// обороты). Плейсхолдер-логотип: единый источник для иконки, сплэша, шапок.
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
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [kavio.accent, kavio.accentPress],
        ),
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
      ..strokeWidth = s * 0.115
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final left = s * 0.34;
    final top = s * 0.30;
    final bottom = s * 0.70;
    final right = s * 0.70;
    final mid = s * 0.52; // точка встречи штрихов чуть ниже центра

    // Вертикальный стержень.
    canvas.drawLine(Offset(left, top), Offset(left, bottom), p);
    // Нижний штрих.
    canvas.drawLine(Offset(left, mid), Offset(right, bottom), p);
    // Верхний штрих — уходит выше правого края (жест роста/движения).
    canvas.drawLine(Offset(left, mid), Offset(s * 0.74, s * 0.24), p);
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
