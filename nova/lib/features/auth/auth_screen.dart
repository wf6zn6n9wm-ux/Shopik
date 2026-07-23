import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../core/services/auth/auth_service.dart';
import '../../design/theme.dart';
import '../../ui/brand_mark.dart';
import '../../ui/kavio_button.dart';
import '../../ui/kavio_text_field.dart';

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
    final kavio = context.kavio;
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
              Text('Вхід у Запис+',
                  textAlign: TextAlign.center,
                  style: AppTypography.title1(kavio.ink)),
              const SizedBox(height: Spacing.s2),
              Text('Записи, клієнти й розклад — в одному місці',
                  textAlign: TextAlign.center,
                  style: AppTypography.body(kavio.ink2)),
              const SizedBox(height: Spacing.s8),
              KavioTextField(
                label: 'Телефон',
                hint: '+1 555 123 4567',
                controller: _phone,
                keyboardType: TextInputType.phone,
                prefixIcon: Icons.phone_outlined,
              ),
              const SizedBox(height: Spacing.s4),
              KavioButton('Отримати код',
                  expand: true, onPressed: _busy ? null : _requestCode),
              const SizedBox(height: Spacing.s5),
              const _Divider(),
              const SizedBox(height: Spacing.s5),
              KavioButton('Продовжити з Apple',
                  icon: Icons.apple,
                  kind: KavioButtonKind.secondary,
                  expand: true,
                  onPressed: _busy ? null : () => _social(AuthMethod.apple)),
              const SizedBox(height: Spacing.s3),
              KavioButton('Продовжити з Google',
                  icon: Icons.g_mobiledata,
                  kind: KavioButtonKind.secondary,
                  expand: true,
                  onPressed: _busy ? null : () => _social(AuthMethod.google)),
              const Spacer(),
              Center(
                child: Text('Продовжуючи, ви приймаєте умови сервісу',
                    textAlign: TextAlign.center,
                    style: AppTypography.caption(kavio.ink3)),
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
    final kavio = context.kavio;
    return Row(
      children: [
        Expanded(child: Divider(color: kavio.line)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.s3),
          child: Text('або', style: AppTypography.caption(kavio.ink3)),
        ),
        Expanded(child: Divider(color: kavio.line)),
      ],
    );
  }
}
