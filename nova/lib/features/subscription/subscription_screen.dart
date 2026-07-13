import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/subscriptions/entitlements.dart';
import '../../design/theme.dart';
import '../../ui/nova_button.dart';
import '../../ui/nova_page_scaffold.dart';

/// Подписка. Текущий план — из SubscriptionService; покупка идёт через
/// BillingService (Apple IAP / Play / Stripe) на этапе функционала.
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  static const _plans = <(Plan, String, String, List<String>)>[
    (Plan.free, 'Free', '0', ['Онлайн-запись', 'Экспорт данных']),
    (
      Plan.pro,
      'Pro',
      '4 900',
      ['Всё из Free', 'Расширенная аналитика', 'Маркетинг и лояльность', 'AI-ассистент']
    ),
    (
      Plan.team,
      'Team',
      '9 900',
      ['Всё из Pro', 'Команда и филиалы', 'Роли и права', 'API интеграций']
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(entitlementProvider).value ?? Entitlement.free;

    return NovaPageScaffold(
      title: 'Подписка',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          for (final (plan, name, price, features) in _plans) ...[
            _PlanCard(
              name: name,
              price: price,
              features: features,
              current: current.plan == plan,
            ),
            const SizedBox(height: Spacing.s3),
          ],
        ],
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
  });

  final String name;
  final String price;
  final List<String> features;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      padding: const EdgeInsets.all(Spacing.s5),
      decoration: BoxDecoration(
        color: nova.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(
          color: current ? nova.accent : nova.line,
          width: current ? 1.5 : 1,
        ),
        boxShadow: current ? context.shadows.e1 : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(name, style: AppTypography.title2(nova.ink)),
              const Spacer(),
              Text('₸ $price',
                  style: AppTypography.tabular(AppTypography.title3(nova.ink))),
              Text(' / мес', style: AppTypography.label(nova.ink3)),
            ],
          ),
          const SizedBox(height: Spacing.s3),
          for (final f in features)
            Padding(
              padding: const EdgeInsets.only(bottom: Spacing.s2),
              child: Row(
                children: [
                  Icon(Icons.check, size: 16, color: nova.success),
                  const SizedBox(width: Spacing.s2),
                  Expanded(
                      child: Text(f, style: AppTypography.label(nova.ink2))),
                ],
              ),
            ),
          const SizedBox(height: Spacing.s2),
          NovaButton(
            current ? 'Текущий план' : 'Выбрать $name',
            expand: true,
            kind: current ? NovaButtonKind.secondary : NovaButtonKind.primary,
            onPressed: current ? null : () {},
          ),
        ],
      ),
    );
  }
}
