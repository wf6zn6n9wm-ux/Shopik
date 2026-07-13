import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/config/app_config.dart';
import '../../design/theme.dart';
import '../../ui/kavio_list_tile.dart';
import '../../ui/kavio_page_scaffold.dart';

/// Настройки. Значения валюты/таймзоны — из конфигурации бизнеса (мультиарендно).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cfg = ref.watch(appConfigProvider);

    return KavioPageScaffold(
      title: 'Настройки',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          _Card(children: [
            KavioListTile(
              icon: Icons.language_outlined,
              title: 'Язык',
              subtitle: 'Системный',
              onTap: () {},
            ),
            _divider(context),
            KavioListTile(
              icon: Icons.payments_outlined,
              title: 'Валюта',
              subtitle: cfg.defaultCurrencyCode,
              onTap: () {},
            ),
            _divider(context),
            KavioListTile(
              icon: Icons.schedule_outlined,
              title: 'Часовой пояс',
              subtitle: cfg.defaultTimeZone,
              onTap: () {},
            ),
          ]),
          const SizedBox(height: Spacing.s4),
          _Card(children: [
            KavioListTile(
              icon: Icons.workspace_premium_outlined,
              title: 'Подписка',
              onTap: () => context.push(Routes.subscription),
            ),
            _divider(context),
            KavioListTile(
              icon: Icons.link_outlined,
              title: 'Онлайн-запись',
              onTap: () => context.push(Routes.onlineBooking),
            ),
            _divider(context),
            KavioListTile(
              icon: Icons.person_outline,
              title: 'Профиль',
              onTap: () => context.push(Routes.profile),
            ),
          ]),
        ],
      ),
    );
  }

  Widget _divider(BuildContext context) =>
      Divider(height: 1, thickness: 1, color: context.kavio.line, indent: 52);
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Container(
      decoration: BoxDecoration(
        color: kavio.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
        border: Border.all(color: kavio.line),
      ),
      child: Column(children: children),
    );
  }
}
