import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../design/theme.dart';
import '../../ui/client_row.dart';
import '../../ui/nova_button.dart';
import '../../ui/nova_page_scaffold.dart';

/// Профиль пользователя. Данные подтянутся из AuthService/бизнеса на этапе
/// функционала; здесь — структура и выход.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return NovaPageScaffold(
      title: 'Профиль',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          Row(
            children: [
              const Avatar('И', size: 56),
              const SizedBox(width: Spacing.s4),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Ирина', style: AppTypography.title2(nova.ink)),
                  const SizedBox(height: 2),
                  Text('Моя студия · Мастер',
                      style: AppTypography.label(nova.ink2)),
                ],
              ),
            ],
          ),
          const SizedBox(height: Spacing.s8),
          NovaButton(
            'Выйти',
            kind: NovaButtonKind.secondary,
            expand: true,
            onPressed: () => context.go(Routes.auth),
          ),
        ],
      ),
    );
  }
}
