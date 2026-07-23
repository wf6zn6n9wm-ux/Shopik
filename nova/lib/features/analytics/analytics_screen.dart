import '../../core/localization/app_text.dart';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';

/// Аналітика рівня Stripe/Linear: великі числа з дельтою, ghost-лінія
/// порівняння, sparkline у KPI, теплова карта завантаженості, топ послуг.
class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});
  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen> {
  int _period = 0; // Сьогодні за замовчуванням

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final d = ref.watch(dashboardProvider);
    var i = 0;
    Widget reveal(Widget c) => StaggerReveal(index: i++, child: c);

    return Container(
      color: k.canvas,
      child: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
          children: [
            reveal(Row(
              children: [
                Expanded(
                    child:
                        Text(t('Аналітика'), style: AppTypography.title1(k.ink))),
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                      color: k.surface2,
                      borderRadius: BorderRadius.circular(12)),
                  child: Icon(Icons.tune, size: 18, color: k.ink2),
                ),
              ],
            )),
            const SizedBox(height: 14),
            reveal(ZSegmented(
              items: [t('Сьогодні'), t('Тиждень'), t('Місяць'), t('Рік')],
              index: _period,
              onChanged: (v) {
                zTap();
                setState(() => _period = v);
              },
            )),
            const SizedBox(height: 14),
            reveal(_RevenueHero(
              today: _period == 0,
              todayRevenue: d.revenue,
              todayVisits: d.visits,
              freeWindows: d.freeWindows.length,
            )),
            const SizedBox(height: 12),
            reveal(const _KpiGrid()),
            const SizedBox(height: 12),
            reveal(const _Heatmap()),
            const SizedBox(height: 12),
            reveal(const _TopServices()),
          ],
        ),
      ),
    );
  }
}

class _RevenueHero extends StatelessWidget {
  const _RevenueHero({
    required this.today,
    required this.todayRevenue,
    required this.todayVisits,
    required this.freeWindows,
  });
  final bool today;
  final int todayRevenue, todayVisits, freeWindows;

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZHero(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ZLabel(today ? t('Виручка · сьогодні') : t('Виручка · липень'),
              color: k.ink2),
          Text(today ? Fmt.money(todayRevenue) : '₴182 400',
              style: AppTypography.tabular(AppTypography.display(k.ink))
                  .copyWith(fontSize: 36, height: 1.05)),
          const SizedBox(height: 6),
          Row(
            children: [
              ZPill(today ? '▲ 12%' : '▲ 18%',
                  color: k.success, bg: k.successTint),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                    today
                        ? tp('{v} записів · {w} вільних вікон',
                            {'v': todayVisits, 'w': freeWindows})
                        : t('проти ₴154 600 у червні'),
                    style: AppTypography.label(k.ink3).copyWith(fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 96,
            child:
                CustomPaint(size: Size.infinite, painter: _AreaChartPainter()),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              _Legend(dashed: false, label: today ? t('сьогодні') : t('липень')),
              const SizedBox(width: 14),
              _Legend(dashed: true, label: today ? t('вчора') : t('червень')),
            ],
          ),
        ],
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.dashed, required this.label});
  final bool dashed;
  final String label;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Row(
      children: [
        SizedBox(
          width: 14,
          height: 3,
          child: CustomPaint(painter: _LineSwatch(dashed: dashed)),
        ),
        const SizedBox(width: 5),
        Text(label, style: AppTypography.label(k.ink3).copyWith(fontSize: 10)),
      ],
    );
  }
}

class _LineSwatch extends CustomPainter {
  _LineSwatch({required this.dashed});
  final bool dashed;
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = dashed ? Colors.white54 : Colors.white
      ..strokeWidth = 2;
    if (dashed) {
      var x = 0.0;
      while (x < size.width) {
        canvas.drawLine(Offset(x, 1.5), Offset(x + 3, 1.5), p);
        x += 6;
      }
    } else {
      canvas.drawLine(const Offset(0, 1.5), Offset(size.width, 1.5), p);
    }
  }

  @override
  bool shouldRepaint(_LineSwatch oldDelegate) => false;
}

class _AreaChartPainter extends CustomPainter {
  static const cur = [0.31, 0.4, 0.36, 0.58, 0.52, 0.73, 0.69, 0.9];
  static const prev = [0.25, 0.3, 0.23, 0.4, 0.38, 0.48, 0.44, 0.54];

  @override
  void paint(Canvas canvas, Size size) {
    Offset pt(List<double> s, int i) =>
        Offset(size.width * i / (s.length - 1), size.height * (1 - s[i]));

    final grid = Paint()
      ..color = Colors.white.withOpacity(0.05)
      ..strokeWidth = 1;
    for (var g = 1; g < 4; g++) {
      final y = size.height * g / 4;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    final ghost = Paint()
      ..color = Colors.white.withOpacity(0.28)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8;
    final gp = Path()..moveTo(pt(prev, 0).dx, pt(prev, 0).dy);
    for (var i = 1; i < prev.length; i++) {
      gp.lineTo(pt(prev, i).dx, pt(prev, i).dy);
    }
    _dash(canvas, gp, ghost);

    final fill = Path()..moveTo(0, size.height);
    for (var i = 0; i < cur.length; i++) {
      fill.lineTo(pt(cur, i).dx, pt(cur, i).dy);
    }
    fill.lineTo(size.width, size.height);
    fill.close();
    canvas.drawPath(
      fill,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x57B9B9FF), Color(0x00B9B9FF)],
        ).createShader(Offset.zero & size),
    );

    final line = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.8
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    final lp = Path()..moveTo(pt(cur, 0).dx, pt(cur, 0).dy);
    for (var i = 1; i < cur.length; i++) {
      lp.lineTo(pt(cur, i).dx, pt(cur, i).dy);
    }
    canvas.drawPath(lp, line);

    final end = pt(cur, cur.length - 1);
    canvas.drawCircle(end, 9, Paint()..color = Colors.white.withOpacity(0.18));
    canvas.drawCircle(end, 4.5, Paint()..color = Colors.white);
  }

  void _dash(Canvas canvas, Path path, Paint paint) {
    for (final m in path.computeMetrics()) {
      var d = 0.0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, d + 4), paint);
        d += 8;
      }
    }
  }

  @override
  bool shouldRepaint(_AreaChartPainter oldDelegate) => false;
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid();
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final tiles = <Widget>[
      _KpiTile(
          label: t('Прибуток'),
          value: '₴121 000',
          delta: '12%',
          up: true,
          spark: const [0.3, 0.34, 0.32, 0.4, 0.44, 0.5, 0.58],
          color: k.success),
      _KpiTile(
          label: t('Сер. чек'),
          value: '₴1 300',
          delta: '6%',
          up: true,
          spark: const [0.2, 0.22, 0.21, 0.26, 0.25, 0.3, 0.33],
          color: k.accent),
      _KpiTile(
          label: t('Записів'),
          value: '140',
          delta: '9%',
          up: true,
          spark: const [0.1, 0.14, 0.12, 0.18, 0.2, 0.22, 0.26],
          color: k.accent),
      _KpiTile(
          label: t('Скасувань'),
          value: '4%',
          delta: '2%',
          up: false,
          spark: const [0.4, 0.32, 0.34, 0.28, 0.24, 0.22, 0.18],
          color: k.danger),
    ];
    return Column(
      children: [
        Row(children: [
          Expanded(child: tiles[0]),
          const SizedBox(width: 10),
          Expanded(child: tiles[1])
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: tiles[2]),
          const SizedBox(width: 10),
          Expanded(child: tiles[3])
        ]),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile(
      {required this.label,
      required this.value,
      required this.delta,
      required this.up,
      required this.spark,
      required this.color});
  final String label, value, delta;
  final bool up;
  final List<double> spark;
  final Color color;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: ZLabel(label)),
              ZPill('${up ? '▲' : '▼'} $delta',
                  color: up ? k.success : k.danger,
                  bg: up ? k.successTint : k.dangerTint),
            ],
          ),
          const SizedBox(height: 4),
          Text(value,
              style: AppTypography.tabular(AppTypography.title1(k.ink))
                  .copyWith(fontSize: 22)),
          const SizedBox(height: 6),
          SizedBox(
            height: 26,
            child: CustomPaint(
                size: Size.infinite, painter: _SparkPainter(spark, color)),
          ),
        ],
      ),
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.data, this.color);
  final List<double> data;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final mn = data.reduce(math.min), mx = data.reduce(math.max);
    final rng = (mx - mn) == 0 ? 1.0 : (mx - mn);
    Offset pt(int i) => Offset(size.width * i / (data.length - 1),
        size.height * (1 - (data[i] - mn) / rng));
    final p = Path()..moveTo(pt(0).dx, pt(0).dy);
    for (var i = 1; i < data.length; i++) {
      p.lineTo(pt(i).dx, pt(i).dy);
    }
    canvas.drawPath(
      p,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_SparkPainter oldDelegate) => false;
}

class _Heatmap extends StatelessWidget {
  const _Heatmap();
  static const rows = [
    [0.2, 0.15, 0.18, 0.3, 0.5, 0.6, 0.1],
    [0.5, 0.25, 0.3, 0.55, 0.8, 0.85, 0.15],
    [0.7, 0.4, 0.45, 0.6, 0.9, 0.95, 0.2],
    [0.65, 0.5, 0.55, 0.7, 0.95, 0.9, 0.25],
    [0.4, 0.3, 0.35, 0.5, 0.75, 0.7, 0.12],
  ];
  static const hours = ['10', '12', '14', '16', '18'];
  static List<String> get days => [
        t('Пн'), t('Вт'), t('Ср'), t('Чт'), t('Пт'), t('Сб'), t('Нд')
      ];
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              ZLabel(t('Завантаженість по днях')),
              Row(
                children: [
                  const ZRing(
                      progress: 0.78, size: 30, stroke: 3.5, glow: false),
                  const SizedBox(width: 8),
                  Text('78%',
                      style: AppTypography.tabular(AppTypography.title3(k.ink))
                          .copyWith(fontSize: 16, fontWeight: FontWeight.w800)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  for (final h in hours) ...[
                    SizedBox(
                      height: 20,
                      child: Text(h,
                          style:
                              AppTypography.tabular(AppTypography.label(k.ink3))
                                  .copyWith(fontSize: 9)),
                    ),
                    const SizedBox(height: 4),
                  ],
                ],
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  children: [
                    for (final row in rows) ...[
                      Row(
                        children: [
                          for (final v in row)
                            Expanded(
                              child: Container(
                                height: 20,
                                margin: const EdgeInsets.only(right: 4),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF8B8BF0)
                                      .withOpacity(0.08 + v * 0.9),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                    ],
                    Row(
                      children: [
                        for (final d in days)
                          Expanded(
                            child: Text(d,
                                textAlign: TextAlign.center,
                                style: AppTypography.label(k.ink3)
                                    .copyWith(fontSize: 10)),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TopServices extends StatelessWidget {
  const _TopServices();
  static List<(String, double, String)> get items => [
        (t('Гель-лак'), 0.72, '₴54 000'),
        (t('Манікюр'), 0.48, '₴38 000'),
        (t('Педикюр'), 0.30, '₴27 000'),
        (t('Нейл-арт'), 0.20, '₴18 000'),
      ];
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ZLabel(t('Популярні послуги')),
          const SizedBox(height: 12),
          for (final it in items) ...[
            Row(
              children: [
                Expanded(
                  child: Text(it.$1,
                      style: AppTypography.label(k.ink)
                          .copyWith(fontSize: 13, fontWeight: FontWeight.w700)),
                ),
                Text(it.$3,
                    style: AppTypography.tabular(AppTypography.label(k.ink2))
                        .copyWith(fontSize: 12)),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: it.$2,
                minHeight: 7,
                backgroundColor: k.surface2,
                valueColor: const AlwaysStoppedAnimation(Color(0xFF9595F5)),
              ),
            ),
            const SizedBox(height: 11),
          ],
        ],
      ),
    );
  }
}
