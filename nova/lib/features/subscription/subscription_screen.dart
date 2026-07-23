import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_text.dart';
import '../../core/services/subscriptions/entitlements.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/z.dart';

/// Підписка. Поточний тариф — з currentPlanProvider (демо: Pro). Оплата —
/// через BillingService на етапі функціоналу.
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  static const _plans = <(Plan, String, String, List<String>)>[
    (Plan.free, 'Старт', '3.99', ['Онлайн-запис', 'Експорт даних']),
    (
      Plan.pro,
      'Pro',
      '5.99',
      [
        'Все зі Старту',
        'Розширена аналітика',
        'Маркетинг і лояльність',
        'AI-асистент'
      ]
    ),
    (
      Plan.team,
      'Team',
      '7.99',
      ['Все з Pro', 'Команда й філії', 'Ролі та права', 'API інтеграцій']
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final current = ref.watch(currentPlanProvider);

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 20, 4),
              child: Row(
                children: [
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
                  const SizedBox(width: 10),
                  Text(t('Тарифи'), style: AppTypography.title1(k.ink)),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
                children: [
                  for (var i = 0; i < _plans.length; i++) ...[
                    StaggerReveal(
                      index: i,
                      child: _PlanCard(
                        name: _plans[i].$2,
                        price: _plans[i].$3,
                        features: _plans[i].$4,
                        current: _plans[i].$1 == current,
                        featured: _plans[i].$1 == Plan.pro,
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.name,
    required this.price,
    required this.features,
    required this.current,
    required this.featured,
  });
  final String name, price;
  final List<String> features;
  final bool current, featured;

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(t(name), style: AppTypography.title2(k.ink)),
            if (current) ...[
              const SizedBox(width: 8),
              ZPill(t('Активний'), color: k.success, bg: k.successTint),
            ],
            const Spacer(),
            Text('\$$price',
                style: AppTypography.tabular(AppTypography.title2(k.ink))),
            Text(t(' / міс'),
                style: AppTypography.label(k.ink3).copyWith(fontSize: 12)),
          ],
        ),
        const SizedBox(height: 14),
        for (final f in features)
          Padding(
            padding: const EdgeInsets.only(bottom: 9),
            child: Row(
              children: [
                Icon(Icons.check_circle, size: 17, color: k.success),
                const SizedBox(width: 9),
                Expanded(
                    child: Text(t(f),
                        style:
                            AppTypography.body(k.ink2).copyWith(fontSize: 14))),
              ],
            ),
          ),
        const SizedBox(height: 8),
        if (current)
          ZButtonSecondary(label: t('Поточний тариф'), expand: true)
        else
          ZButton(label: tp('Обрати {name}', {'name': t(name)})),
      ],
    );

    if (featured) {
      return ZHero(orb: false, padding: const EdgeInsets.all(18), child: body);
    }
    return ZCard(padding: const EdgeInsets.all(18), child: body);
  }
}
