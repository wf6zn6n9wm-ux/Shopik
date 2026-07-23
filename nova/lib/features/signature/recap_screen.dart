import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_text.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';

/// Фішка «Підсумок дня»: щовечірній момент гордості — скільки зароблено,
/// клієнтів, оцінка, і що на завтра. Live-дані сьогодні + шаринг.
class RecapScreen extends ConsumerWidget {
  const RecapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final d = ref.watch(dashboardProvider);
    var i = 0;
    Widget reveal(Widget c) => StaggerReveal(index: i++, child: c);

    return Scaffold(
      backgroundColor: k.canvas,
      body: Stack(
        children: [
          const Positioned(
            top: -40,
            left: 0,
            right: 0,
            child: Center(child: GlowOrb(size: 320)),
          ),
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                  child: Row(children: [
                    GestureDetector(
                      onTap: () => Navigator.of(context).maybePop(),
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                            color: k.surface2,
                            borderRadius: BorderRadius.circular(12)),
                        child: Icon(Icons.chevron_left, color: k.ink2),
                      ),
                    ),
                  ]),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                    children: [
                      reveal(Column(
                        children: [
                          const Text('🌙', style: TextStyle(fontSize: 34)),
                          const SizedBox(height: 8),
                          Text(t('Гарний день, Софіє!'),
                              style: AppTypography.title1(k.ink)),
                          const SizedBox(height: 6),
                          Text(t('Ось як він пройшов'),
                              style: AppTypography.label(k.ink2)
                                  .copyWith(fontSize: 13)),
                        ],
                      )),
                      const SizedBox(height: 16),
                      reveal(ZHero(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          children: [
                            ZLabel(t('Зароблено сьогодні'), color: k.ink2),
                            const SizedBox(height: 2),
                            Text(Fmt.money(d.revenue),
                                style: AppTypography.tabular(
                                        AppTypography.display(k.ink))
                                    .copyWith(fontSize: 40)),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                ZPill('▲ 12%',
                                    color: k.success, bg: k.successTint),
                                const SizedBox(width: 8),
                                Text(t('кращий вівторок місяця'),
                                    style: AppTypography.label(k.ink3)
                                        .copyWith(fontSize: 12)),
                              ],
                            ),
                          ],
                        ),
                      )),
                      const SizedBox(height: 12),
                      reveal(Row(
                        children: [
                          _tile(k, '${d.visits}', t('клієнтів')),
                          const SizedBox(width: 10),
                          _tile(k, '4.9★', t('сер. оцінка')),
                          const SizedBox(width: 10),
                          _tile(k, '2', t('нові')),
                        ],
                      )),
                      const SizedBox(height: 12),
                      reveal(ZCard(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 15, vertical: 14),
                        child: Row(
                          children: [
                            const Text('☀️', style: TextStyle(fontSize: 20)),
                            const SizedBox(width: 11),
                            Expanded(
                              child: Text.rich(TextSpan(
                                style: AppTypography.body(k.ink)
                                    .copyWith(fontSize: 13, height: 1.4),
                                children: [
                                  TextSpan(
                                      text: '${t('Завтра')}: ',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800)),
                                  TextSpan(
                                      text: t('5 записів, перший о 09:00. ')),
                                  TextSpan(
                                      text: t('1 вікно вільне.'),
                                      style: TextStyle(color: k.accent)),
                                ],
                              )),
                            ),
                          ],
                        ),
                      )),
                      const SizedBox(height: 18),
                      reveal(ZButtonSecondary(
                          label: t('Поділитися підсумком'),
                          expand: true,
                          padding: const EdgeInsets.symmetric(vertical: 14))),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _tile(KavioColors k, String v, String l) => Expanded(
        child: ZCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Text(v,
                  style: AppTypography.tabular(AppTypography.title1(k.ink))
                      .copyWith(fontSize: 24)),
              const SizedBox(height: 2),
              Text(l,
                  style: AppTypography.label(k.ink3).copyWith(fontSize: 11)),
            ],
          ),
        ),
      );
}
