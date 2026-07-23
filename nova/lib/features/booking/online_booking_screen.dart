import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../design/theme.dart';
import '../../ui/z.dart';

/// Онлайн-запис (сторона бізнесу): QR + посилання + шаринг + статистика +
/// прев'ю публічної сторінки. Клієнти записуються самі.
class OnlineBookingScreen extends ConsumerWidget {
  const OnlineBookingScreen({super.key});

  static const _link = 'zapys.plus/@sofia';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    var i = 0;
    Widget reveal(Widget c) => StaggerReveal(index: i++, child: c);

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TopBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 120),
                children: [
                  reveal(
                      Text('Онлайн-запис', style: AppTypography.title1(k.ink))),
                  const SizedBox(height: 14),
                  reveal(_HeroCard(link: _link)),
                  const SizedBox(height: 14),
                  reveal(const _Stats()),
                  const SizedBox(height: 16),
                  reveal(const ZLabel('Прев\'ю сторінки')),
                  const SizedBox(height: 8),
                  reveal(const _Preview()),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).maybePop(),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                  color: k.surface2, borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.chevron_left, color: k.ink2),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.link});
  final String link;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZHero(
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
                color: Colors.white, borderRadius: BorderRadius.circular(16)),
            padding: const EdgeInsets.all(7),
            child: CustomPaint(painter: _QrPainter()),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ZLabel('Ваше посилання', color: k.ink2),
                const SizedBox(height: 4),
                Text(link,
                    style: AppTypography.tabular(AppTypography.title3(k.ink))
                        .copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                ZButton(
                  label: 'Поділитися',
                  icon: Icons.ios_share,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: 'https://$link'));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Посилання скопійовано')),
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Stats extends StatelessWidget {
  const _Stats();
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    Widget tile(String label, String value, [Color? c]) => Expanded(
          child: ZCard(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 13),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: AppTypography.caption(k.ink3)
                        .copyWith(fontSize: 10, letterSpacing: 0.6)),
                const SizedBox(height: 3),
                Text(value,
                    style:
                        AppTypography.tabular(AppTypography.title1(c ?? k.ink))
                            .copyWith(fontSize: 19)),
              ],
            ),
          ),
        );
    return Row(
      children: [
        tile('Переглядів', '1 240'),
        const SizedBox(width: 8),
        tile('Бронювань', '86'),
        const SizedBox(width: 8),
        tile('Конверсія', '6.9%', k.success),
      ],
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview();
  static const services = [
    ('Гель-лак', '45 хв', '₴500'),
    ('Манікюр', '30 хв', '₴350'),
  ];
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const ZAvatar(initials: 'СС', size: 40),
              const SizedBox(width: 11),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Манікюрна студія',
                      style:
                          AppTypography.title3(k.ink).copyWith(fontSize: 15)),
                  Text('Київ · 4.9 ★',
                      style:
                          AppTypography.label(k.ink3).copyWith(fontSize: 12)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final s in services) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              margin: const EdgeInsets.only(bottom: 7),
              decoration: BoxDecoration(
                  color: k.surface2, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  Expanded(
                    child: Text(s.$1,
                        style: AppTypography.label(k.ink).copyWith(
                            fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                  Text(s.$2,
                      style: AppTypography.tabular(AppTypography.label(k.ink2))
                          .copyWith(fontSize: 12)),
                  const SizedBox(width: 10),
                  ZPill(s.$3, color: k.accent, bg: k.accentTint),
                ],
              ),
            ),
          ],
          const SizedBox(height: 2),
          Center(
            child: GestureDetector(
              onTap: () => context.push(Routes.publicBooking),
              child: Text('Відкрити сторінку запису →',
                  style: AppTypography.label(k.accent)
                      .copyWith(fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}

/// Псевдо-QR: три «ока» по кутах + детермінований візерунок модулів.
class _QrPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const n = 21;
    final cell = size.width / n;
    final black = Paint()..color = const Color(0xFF0B0B11);

    bool finder(int r, int c) {
      for (final o in const [
        [0, 0],
        [0, 14],
        [14, 0]
      ]) {
        final dr = r - o[0], dc = c - o[1];
        if (dr >= 0 && dr < 7 && dc >= 0 && dc < 7) {
          final edge = dr == 0 || dr == 6 || dc == 0 || dc == 6;
          final core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          return edge || core;
        }
      }
      return false;
    }

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        final inFinder =
            (r < 8 && c < 8) || (r < 8 && c > 12) || (r > 12 && c < 8);
        final on =
            inFinder ? finder(r, c) : ((r * 7 + c * 13 + r * c) % 3 == 0);
        if (on) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(c * cell, r * cell, cell, cell)
                  .deflate(cell * 0.08),
              Radius.circular(cell * 0.2),
            ),
            black,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_QrPainter oldDelegate) => false;
}
