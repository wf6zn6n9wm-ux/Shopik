import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart' show markBooted;
import '../../app/routes.dart';
import '../../design/theme.dart';

/// Splash з morph-логотипом «Галочка+»: галочка прокреслюється зі свіченням,
/// плюс спалахує, назва виринає. Через ~1.7 с → онбординг. WOW перших секунд.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void initState() {
    super.initState();
    _c.forward();
    // Для знімків екрана splash можна «заморозити» (?hold=1) — без автопереходу.
    if (Uri.base.fragment.contains('hold')) return;
    Future.delayed(const Duration(milliseconds: 1750), () {
      if (!mounted) return;
      markBooted();
      context.go(Routes.onboarding);
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Scaffold(
      backgroundColor: k.canvas,
      body: Stack(
        alignment: Alignment.center,
        children: [
          const Positioned(child: GlowOrb(size: 320)),
          AnimatedBuilder(
            animation: _c,
            builder: (context, _) {
              final t = _c.value;
              final wordT =
                  Curves.easeOut.transform((t - 0.45).clamp(0, 1) / 0.55);
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 110,
                    height: 110,
                    child: CustomPaint(painter: _AnimatedMark(t)),
                  ),
                  const SizedBox(height: 22),
                  Opacity(
                    opacity: wordT,
                    child: Transform.translate(
                      offset: Offset(0, (1 - wordT) * 10),
                      child: Text.rich(
                        TextSpan(
                          style: AppTypography.title1(k.ink)
                              .copyWith(fontSize: 34),
                          children: [
                            const TextSpan(text: 'Запис'),
                            TextSpan(
                                text: '+', style: TextStyle(color: k.accent)),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Opacity(
                    opacity: wordT,
                    child: Text('записуй. керуй. зростай.',
                        style:
                            AppTypography.label(k.ink3).copyWith(fontSize: 13)),
                  ),
                  const SizedBox(height: 40),
                  Opacity(
                    opacity: wordT,
                    child: SizedBox(
                      width: 26,
                      height: 26,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        valueColor: AlwaysStoppedAnimation(k.accent),
                        backgroundColor: k.surface3,
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Малює галочку за прогресом t (0..1) + плюс, що спалахує, зі свіченням.
class _AnimatedMark extends CustomPainter {
  _AnimatedMark(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    double x(double v) => s * v / 100;

    final checkT = Curves.easeOutCubic.transform((t / 0.7).clamp(0, 1));
    final plusT = Curves.elasticOut.transform((t - 0.55).clamp(0, 1) / 0.45);

    final check = Path()
      ..moveTo(x(24), x(54))
      ..lineTo(x(43), x(72))
      ..lineTo(x(74), x(32));

    // Витягуємо частину шляху за прогресом.
    final metric = check.computeMetrics().first;
    final drawn = metric.extractPath(0, metric.length * checkT);

    final shader = const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFFB8B8FF), Color(0xFF7E7EEF)],
    ).createShader(Rect.fromLTWH(0, 0, s, s));

    // Свічення.
    canvas.drawPath(
      drawn,
      Paint()
        ..color = const Color(0x998B8BF0)
        ..style = PaintingStyle.stroke
        ..strokeWidth = x(9)
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, x(6)),
    );
    canvas.drawPath(
      drawn,
      Paint()
        ..shader = shader
        ..style = PaintingStyle.stroke
        ..strokeWidth = x(9)
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    if (plusT > 0) {
      final cx = x(78), cy = x(32), len = x(8) * plusT.clamp(0.0, 1.0);
      final pen = Paint()
        ..color = const Color(0xFF9A9AF6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = x(6.5)
        ..strokeCap = StrokeCap.round;
      canvas.drawLine(Offset(cx, cy - len), Offset(cx, cy + len), pen);
      canvas.drawLine(Offset(cx - len, cy), Offset(cx + len, cy), pen);
    }
  }

  @override
  bool shouldRepaint(_AnimatedMark old) => old.t != t;
}
