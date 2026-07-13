import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/format.dart';
import '../../ui/stat_tile.dart';

/// Обзор бизнеса. В каркасе — сводка дня; период-дашборд — следующий шаг.
class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kavio = context.kavio;
    final s = ref.watch(daySummaryProvider);

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          Text('Обзор', style: AppTypography.title1(kavio.ink)),
          const SizedBox(height: Spacing.s5),
          StatTile(
              label: 'Выручка сегодня',
              value: Fmt.money(s.revenue),
              delta: '▲ 12% к среде'),
          const SizedBox(height: Spacing.s3),
          Row(
            children: [
              Expanded(child: StatTile(label: 'Визитов', value: '${s.visits}')),
              const SizedBox(width: Spacing.s3),
              Expanded(child: StatTile(label: 'Загрузка', value: '${s.load}%')),
            ],
          ),
          const SizedBox(height: Spacing.s6),
          Text('ЗА ПЕРИОД', style: AppTypography.caption(kavio.ink3)),
          const SizedBox(height: Spacing.s3),
          Container(
            height: 140,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: kavio.surface,
              borderRadius: BorderRadius.circular(Radii.lg),
              border: Border.all(color: kavio.line),
            ),
            child: Text('Период-дашборд — следующий шаг',
                style: AppTypography.label(kavio.ink3)),
          ),
        ],
      ),
    );
  }
}
