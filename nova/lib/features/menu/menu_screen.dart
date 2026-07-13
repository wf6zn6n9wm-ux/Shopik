import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../design/theme.dart';
import '../../ui/kavio_list_tile.dart';
import '../../ui/section_header.dart';

/// «Меню» — вход в разделы вне ежедневной навигации. MVP-разделы навигируют;
/// расширенные (лояльность/финансы/склад/маркетинг) — после MVP.
class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          const ScreenTitle('Меню'),
          const SizedBox(height: Spacing.s5),
          _card(kavio, [
            KavioListTile(
              icon: Icons.cut_outlined,
              title: 'Услуги и цены',
              onTap: () => context.push(Routes.services),
            ),
            _div(kavio),
            KavioListTile(
              icon: Icons.link_outlined,
              title: 'Онлайн-запись',
              onTap: () => context.push(Routes.onlineBooking),
            ),
          ]),
          const SizedBox(height: Spacing.s4),
          _card(kavio, [
            KavioListTile(
              icon: Icons.workspace_premium_outlined,
              title: 'Подписка',
              onTap: () => context.push(Routes.subscription),
            ),
            _div(kavio),
            KavioListTile(
              icon: Icons.person_outline,
              title: 'Профиль',
              onTap: () => context.push(Routes.profile),
            ),
            _div(kavio),
            KavioListTile(
              icon: Icons.settings_outlined,
              title: 'Настройки',
              onTap: () => context.push(Routes.settings),
            ),
          ]),
        ],
      ),
    );
  }

  Widget _card(KavioColors kavio, List<Widget> children) => Container(
        decoration: BoxDecoration(
          color: kavio.surface,
          borderRadius: BorderRadius.circular(Radii.lg),
          border: Border.all(color: kavio.line),
        ),
        child: Column(children: children),
      );

  Widget _div(KavioColors kavio) =>
      Divider(height: 1, thickness: 1, color: kavio.line, indent: 52);
}
