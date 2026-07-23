import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/localization/app_text.dart';
import '../../design/theme.dart';
import '../../ui/client_row.dart';
import '../../ui/kavio_button.dart';
import '../../ui/kavio_page_scaffold.dart';

/// Профиль пользователя. Данные подтянутся из AuthService/бизнеса на этапе
/// функционала; здесь — структура и выход.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return KavioPageScaffold(
      title: t('Профіль'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          Row(
            children: [
              const Avatar('С', size: 56),
              const SizedBox(width: Spacing.s4),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Софія', style: AppTypography.title2(kavio.ink)),
                  const SizedBox(height: 2),
                  Text(t('Манікюрна студія · Майстриня'),
                      style: AppTypography.label(kavio.ink2)),
                ],
              ),
            ],
          ),
          const SizedBox(height: Spacing.s8),
          KavioButton(
            t('Вийти'),
            kind: KavioButtonKind.secondary,
            expand: true,
            onPressed: () => context.go(Routes.auth),
          ),
        ],
      ),
    );
  }
}
