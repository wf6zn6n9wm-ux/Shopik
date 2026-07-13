import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../core/services/auth/auth_service.dart';
import '../../design/theme.dart';
import '../../ui/brand_mark.dart';
import '../../ui/nova_button.dart';
import '../../ui/nova_text_field.dart';

/// Вход. Телефон + код (без пароля-барьера), либо Apple / Google Sign In.
/// Спроектирован под мультиметодную авторизацию; реальные OTP/социальные
/// провайдеры подключаются адаптером AuthService (Supabase и т.п.).
class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _phone = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    final phone = _phone.text.trim();
    if (phone.isEmpty || _busy) return;
    setState(() => _busy = true);
    final router = GoRouter.of(context);
    await ref.read(authServiceProvider).requestOtp(phone: phone);
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.login('phone'));
    if (!mounted) return;
    setState(() => _busy = false);
    router.push(Routes.otp, extra: phone);
  }

  Future<void> _social(AuthMethod method) async {
    if (_busy) return;
    setState(() => _busy = true);
    final router = GoRouter.of(context);
    final auth = ref.read(authServiceProvider);
    if (method == AuthMethod.apple) {
      await auth.signInWithApple();
    } else {
      await auth.signInWithGoogle();
    }
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.login(method.name));
    router.go(Routes.onboarding);
  }

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
              NovaTextField(
                label: 'Телефон',
                hint: '+7 700 000 00 00',
                controller: _phone,
                keyboardType: TextInputType.phone,
                prefixIcon: Icons.phone_outlined,
              ),
              const SizedBox(height: Spacing.s4),
              NovaButton('Получить код',
                  expand: true, onPressed: _busy ? null : _requestCode),
              const SizedBox(height: Spacing.s5),
              const _Divider(),
              const SizedBox(height: Spacing.s5),
              NovaButton('Продолжить с Apple',
                  icon: Icons.apple,
                  kind: NovaButtonKind.secondary,
                  expand: true,
                  onPressed: _busy ? null : () => _social(AuthMethod.apple)),
              const SizedBox(height: Spacing.s3),
              NovaButton('Продолжить с Google',
                  icon: Icons.g_mobiledata,
                  kind: NovaButtonKind.secondary,
                  expand: true,
                  onPressed: _busy ? null : () => _social(AuthMethod.google)),
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

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Row(
      children: [
        Expanded(child: Divider(color: nova.line)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.s3),
          child: Text('или', style: AppTypography.caption(nova.ink3)),
        ),
        Expanded(child: Divider(color: nova.line)),
      ],
    );
  }
}
