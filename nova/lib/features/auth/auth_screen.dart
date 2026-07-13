import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../design/theme.dart';
import '../../ui/brand_mark.dart';
import '../../ui/nova_button.dart';
import '../../ui/nova_text_field.dart';

/// Вход. Телефон + код (без пароля-барьера). Логика OTP подключается через
/// AuthService на этапе функционала; здесь — структура и навигация.
class AuthScreen extends StatelessWidget {
  const AuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Spacing.s5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Center(child: BrandMark(size: 56)),
              const SizedBox(height: Spacing.s6),
              Text('Вход в Nova',
                  textAlign: TextAlign.center,
                  style: AppTypography.title1(nova.ink)),
              const SizedBox(height: Spacing.s2),
              Text('Записи, клиенты и расписание — в одном месте',
                  textAlign: TextAlign.center,
                  style: AppTypography.body(nova.ink2)),
              const SizedBox(height: Spacing.s8),
              const NovaTextField(
                label: 'Телефон',
                hint: '+7 700 000 00 00',
                keyboardType: TextInputType.phone,
                prefixIcon: Icons.phone_outlined,
              ),
              const SizedBox(height: Spacing.s4),
              NovaButton(
                'Продолжить',
                expand: true,
                onPressed: () => context.go(Routes.onboarding),
              ),
              const Spacer(),
              Center(
                child: Text('Продолжая, вы принимаете условия сервиса',
                    textAlign: TextAlign.center,
                    style: AppTypography.caption(nova.ink3)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
