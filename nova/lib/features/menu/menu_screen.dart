import '../../core/localization/app_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/services/subscriptions/entitlements.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/z.dart';

/// «Меню» — хаб розділів поза щоденною навігацією. Профіль, тариф, групи посилань.
class MenuScreen extends ConsumerWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final plan = ref.watch(currentPlanProvider);
    var i = 0;
    Widget reveal(Widget c) => StaggerReveal(index: i++, child: c);

    return Container(
      color: k.canvas,
      child: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
          children: [
            reveal(Text(t('Меню'), style: AppTypography.title1(k.ink))),
            const SizedBox(height: 16),
            reveal(GestureDetector(
              onTap: () => context.push(Routes.profile),
              child: ZHero(
                orb: false,
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const ZAvatar(initials: 'С', size: 52, ring: true),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Софія',
                              style: AppTypography.title3(k.ink)
                                  .copyWith(fontSize: 17)),
                          const SizedBox(height: 2),
                          Text(t('Манікюрна студія · Київ'),
                              style: AppTypography.label(k.ink2)
                                  .copyWith(fontSize: 13)),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, color: k.ink3),
                  ],
                ),
              ),
            )),
            const SizedBox(height: 12),
            reveal(_TariffCard(plan: plan)),
            const SizedBox(height: 20),
            reveal(ZLabel(t('Робота'))),
            const SizedBox(height: 8),
            reveal(_Group(items: [
              _Item(Icons.people_alt_outlined, t('Клієнти'),
                  () => context.push(Routes.clients)),
              _Item(Icons.design_services_outlined, t('Послуги та ціни'),
                  () => context.push(Routes.services)),
              _Item(Icons.auto_awesome_outlined, t('Розумні вікна'),
                  () => context.push(Routes.smartGaps)),
              _Item(Icons.link_outlined, t('Онлайн-запис'),
                  () => context.push(Routes.onlineBooking)),
            ])),
            const SizedBox(height: 20),
            reveal(ZLabel(t('Бізнес'))),
            const SizedBox(height: 8),
            reveal(_Group(items: [
              _Item(Icons.nightlight_round_outlined, t('Підсумок дня'),
                  () => context.push(Routes.recap)),
              _Item(Icons.workspace_premium_outlined, t('Підписка'),
                  () => context.push(Routes.subscription)),
              _Item(Icons.settings_outlined, t('Налаштування'),
                  () => context.push(Routes.settings)),
            ])),
          ],
        ),
      ),
    );
  }
}

class _TariffCard extends StatelessWidget {
  const _TariffCard({required this.plan});
  final Plan plan;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final name = switch (plan) {
      Plan.free => 'Старт',
      Plan.pro => 'Pro',
      Plan.team => 'Team',
    };
    final paid = plan != Plan.free;
    return GestureDetector(
      onTap: () => context.push(Routes.subscription),
      behavior: HitTestBehavior.opaque,
      child: ZCard(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                gradient: paid ? FX.brandButton : null,
                color: paid ? null : k.surface2,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.workspace_premium,
                  size: 20, color: paid ? Colors.white : k.ink3),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(tp('Тариф {name}', {'name': name}),
                          style: AppTypography.title3(k.ink)
                              .copyWith(fontSize: 15)),
                      const SizedBox(width: 8),
                      ZPill(paid ? t('Активний') : t('Безкоштовний'),
                          color: paid ? k.success : k.ink2,
                          bg: paid ? k.successTint : k.surface2),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                      paid
                          ? t('Продовжується 12 серпня')
                          : t('Оновіть до Pro — більше можливостей'),
                      style:
                          AppTypography.label(k.ink3).copyWith(fontSize: 12)),
                ],
              ),
            ),
            Text(paid ? t('Керувати') : t('Оновити'),
                style: AppTypography.label(k.accent)
                    .copyWith(fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _Item {
  const _Item(this.icon, this.title, this.onTap);
  final IconData icon;
  final String title;
  final VoidCallback onTap;
}

class _Group extends StatelessWidget {
  const _Group({required this.items});
  final List<_Item> items;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZCard(
      padding: const EdgeInsets.all(4),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            GestureDetector(
              onTap: items[i].onTap,
              behavior: HitTestBehavior.opaque,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                decoration: BoxDecoration(
                  border:
                      i == 0 ? null : Border(top: BorderSide(color: k.line)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                          color: k.accentTint,
                          borderRadius: BorderRadius.circular(11)),
                      child: Icon(items[i].icon, size: 18, color: k.accent),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(items[i].title,
                          style: AppTypography.body(k.ink).copyWith(
                              fontSize: 15, fontWeight: FontWeight.w600)),
                    ),
                    Icon(Icons.chevron_right, size: 18, color: k.ink3),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
