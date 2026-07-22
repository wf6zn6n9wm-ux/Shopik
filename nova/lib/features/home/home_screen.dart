import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';
import '../create/create_appointment_sheet.dart';

/// Головний екран «Сьогодні» — дашборд дня. Відкривається з плавним stagger:
/// картки виринають знизу. Показує пульс дня: записи, виручку, наступного
/// клієнта з відліком, вільні вікна та інсайт повернення.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final d = ref.watch(dashboardProvider);
    final now = DateTime.now();

    var i = 0;
    Widget reveal(Widget child) => StaggerReveal(index: i++, child: child);

    return Container(
      color: k.canvas,
      child: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
          children: [
            // Шапка.
            reveal(Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${Fmt.weekday(now)}, ${Fmt.dayMonth(now)}',
                          style: AppTypography.label(k.ink3).copyWith(fontSize: 13)),
                      const SizedBox(height: 2),
                      Text('Привіт, Софіє 👋', style: AppTypography.title1(k.ink)),
                    ],
                  ),
                ),
                const ZAvatar(initials: 'С', size: 44, ring: true),
              ],
            )),
            const SizedBox(height: 16),

            // Три показники.
            reveal(Row(
              children: [
                Expanded(child: ZStatCard(label: 'Записів', value: '${d.visits}', sub: 'до 19:00')),
                const SizedBox(width: 10),
                Expanded(child: ZStatCard(label: 'Виручка', value: Fmt.money(d.revenue), sub: '▲ 12%', subColor: k.success)),
                const SizedBox(width: 10),
                Expanded(child: ZStatCard(label: 'Вікна', value: '${d.freeWindows.length}', sub: 'вільні')),
              ],
            )),
            const SizedBox(height: 12),

            // Наступний клієнт.
            reveal(_NextClientHero(next: d.next, minutes: d.minutesToNext)),
            const SizedBox(height: 16),

            // Вільні вікна.
            if (d.freeWindows.isNotEmpty) ...[
              reveal(const ZLabel('Вільні вікна')),
              const SizedBox(height: 8),
              reveal(Row(
                children: [
                  for (var w = 0; w < d.freeWindows.length; w++) ...[
                    if (w > 0) const SizedBox(width: 8),
                    Expanded(child: _FreeWindowChip(time: Fmt.time(d.freeWindows[w]))),
                  ],
                ],
              )),
              const SizedBox(height: 14),
            ],

            // Інсайт повернення.
            reveal(_InsightCard(count: d.lapsedCount)),
          ],
        ),
      ),
    );
  }
}

class _NextClientHero extends StatelessWidget {
  const _NextClientHero({required this.next, required this.minutes});
  final Appointment? next;
  final int minutes;

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    if (next == null) {
      return ZHero(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            const Text('🌙', style: TextStyle(fontSize: 26)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Записів більше немає', style: AppTypography.title3(k.ink)),
                  const SizedBox(height: 2),
                  Text('Гарний день — можна видихнути', style: AppTypography.label(k.ink2).copyWith(fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
      );
    }
    final a = next!;
    final progress = ((60 - minutes).clamp(0, 60)) / 60;
    return ZHero(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          ZAvatar(initials: a.client.initials, size: 48),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                ZLabel('Наступний клієнт · за $minutes хв', color: k.accent),
                const SizedBox(height: 2),
                Text(a.client.name, style: AppTypography.title3(k.ink).copyWith(fontSize: 17, fontWeight: FontWeight.w800)),
                const SizedBox(height: 1),
                Text('${a.service.name} · ${Fmt.time(a.start)} · ${Fmt.money(a.service.price)}',
                    style: AppTypography.label(k.ink2).copyWith(fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ZRing(
            progress: progress,
            size: 52,
            stroke: 4,
            center: Text('$minutes′',
                style: AppTypography.tabular(AppTypography.label(k.ink)).copyWith(fontSize: 11, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

class _FreeWindowChip extends StatelessWidget {
  const _FreeWindowChip({required this.time});
  final String time;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return GestureDetector(
      onTap: () => showCreateAppointmentSheet(context),
      child: CustomPaint(
        painter: _DashChipPainter(),
        child: Container(
          decoration: BoxDecoration(color: const Color(0x0F8B8BF0), borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.symmetric(vertical: 11),
          child: Column(
            children: [
              Text(time, style: AppTypography.tabular(AppTypography.title3(k.ink)).copyWith(fontSize: 14, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text('заповнити', style: AppTypography.label(k.accent).copyWith(fontSize: 10)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashChipPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(16));
    final path = Path()..addRRect(rrect);
    final paint = Paint()
      ..color = const Color(0x808B8BF0)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    for (final m in path.computeMetrics()) {
      var dist = 0.0;
      while (dist < m.length) {
        final len = (6.0).clamp(0, m.length - dist).toDouble();
        canvas.drawPath(m.extractPath(dist, dist + len), paint);
        dist += 11;
      }
    }
  }

  @override
  bool shouldRepaint(_DashChipPainter oldDelegate) => false;
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({required this.count});
  final int count;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x1A46D08A), Color(0xFF151519)],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: k.line, width: 1),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        children: [
          const Text('✨', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 11),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: AppTypography.body(k.ink).copyWith(fontSize: 13),
                children: [
                  TextSpan(text: '$count клієнти ', style: const TextStyle(fontWeight: FontWeight.w800)),
                  const TextSpan(text: 'давно не були — запросити?'),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text('Так', style: AppTypography.label(k.success).copyWith(fontSize: 13, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
