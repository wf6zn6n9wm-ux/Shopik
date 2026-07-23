import 'package:flutter/material.dart';

import '../../core/localization/app_text.dart';
import '../../design/theme.dart';
import '../../ui/z.dart';

/// Фішка «Магічний перезапис»: на касі, після оплати, застосунок ловить
/// наступний візит («ходить кожні 3 тижні → записати наперед?»).
class MagicRebookScreen extends StatelessWidget {
  const MagicRebookScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    var i = 0;
    Widget reveal(Widget c) => StaggerReveal(index: i++, child: c);

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
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
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
                children: [
                  reveal(Text(t('Візит завершено'),
                      style: AppTypography.title1(k.ink))),
                  const SizedBox(height: 6),
                  reveal(Text('Олена · ${t('Гель-лак')} · ₴500',
                      style:
                          AppTypography.label(k.ink3).copyWith(fontSize: 13))),
                  const SizedBox(height: 16),
                  reveal(_PaidCard()),
                  const SizedBox(height: 14),
                  reveal(_RebookHero()),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaidCard extends StatelessWidget {
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
        border: Border.all(color: const Color(0x4046D08A)),
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
                color: k.successTint, borderRadius: BorderRadius.circular(16)),
            child: Icon(Icons.check, color: k.success, size: 26),
          ),
          const SizedBox(height: 12),
          Text(t('Оплату отримано'),
              style: AppTypography.title3(k.ink).copyWith(fontSize: 17)),
          const SizedBox(height: 2),
          Text('+₴500',
              style: AppTypography.tabular(AppTypography.title3(k.success))
                  .copyWith(fontSize: 15, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _RebookHero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZHero(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ZLabel('✦ ${t('Магічний перезапис')}', color: k.accent),
          const SizedBox(height: 8),
          Text(t('Олена ходить кожні\n3 тижні. Записати наперед?'),
              style: AppTypography.title3(k.ink)
                  .copyWith(fontSize: 16, height: 1.35)),
          const SizedBox(height: 14),
          Container(
            decoration: BoxDecoration(
                color: k.surface2, borderRadius: BorderRadius.circular(14)),
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                      color: k.accentTint,
                      borderRadius: BorderRadius.circular(11)),
                  child: Icon(Icons.calendar_today, size: 17, color: k.accent),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t('Вівторок, 12 серпня'),
                          style: AppTypography.label(k.ink).copyWith(
                              fontSize: 13.5, fontWeight: FontWeight.w700)),
                      Text('10:30 · ${t('вільно')}',
                          style: AppTypography.label(k.ink3)
                              .copyWith(fontSize: 11)),
                    ],
                  ),
                ),
                Text('₴500',
                    style: AppTypography.tabular(AppTypography.label(k.ink))
                        .copyWith(fontSize: 13, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                  child: ZButton(
                      label: t('Записати на 12 серп'),
                      padding: const EdgeInsets.symmetric(vertical: 12))),
              const SizedBox(width: 9),
              ZButtonSecondary(
                  label: t('Інший'),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 13)),
            ],
          ),
        ],
      ),
    );
  }
}
