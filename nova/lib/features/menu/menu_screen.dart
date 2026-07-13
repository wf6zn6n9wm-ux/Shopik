import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../design/theme.dart';
import '../../ui/nova_list_tile.dart';
import '../../ui/section_header.dart';

/// «Меню» — вход в разделы вне ежедневной навигации. MVP-разделы навигируют;
/// расширенные (лояльность/финансы/склад/маркетинг) — после MVP.
class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          const ScreenTitle('Меню'),
          const SizedBox(height: Spacing.s5),
          _card(nova, [
            NovaListTile(
              icon: Icons.cut_outlined,
              title: 'Услуги и цены',
              onTap: () => context.push(Routes.services),
            ),
            _div(nova),
            NovaListTile(
              icon: Icons.link_outlined,
              title: 'Онлайн-запись',
              onTap: () => context.push(Routes.onlineBooking),
            ),
          ]),
          const SizedBox(height: Spacing.s4),
          _card(nova, [
            NovaListTile(
              icon: Icons.workspace_premium_outlined,
              title: 'Подписка',
              onTap: () => context.push(Routes.subscription),
            ),
            _div(nova),
            NovaListTile(
              icon: Icons.person_outline,
              title: 'Профиль',
              onTap: () => context.push(Routes.profile),
            ),
            _div(nova),
            NovaListTile(
              icon: Icons.settings_outlined,
              title: 'Настройки',
              onTap: () => context.push(Routes.settings),
            ),
          ]),
        ],
      ),
    );
  }

  Widget _card(NovaColors nova, List<Widget> children) => Container(
        decoration: BoxDecoration(
          color: nova.surface,
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(color: nova.line),
        ),
        child: Column(children: children),
      );

  Widget _div(NovaColors nova) =>
      Divider(height: 1, thickness: 1, color: nova.line, indent: 52);
}
