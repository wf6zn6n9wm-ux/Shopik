import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../core/services/auth/auth_service.dart';
import '../../design/theme.dart';
import '../../ui/kavio_button.dart';
import '../../ui/kavio_page_scaffold.dart';
import '../../ui/kavio_text_field.dart';

/// Ввод OTP-кода. Проверка идёт через AuthService (в дефолте офлайн — любой код;
/// реальная — в адаптере). Новый пользователь → онбординг.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.contact});

  final String contact;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  bool get _valid => _code.text.trim().length >= 4;

  Future<void> _verify() async {
    if (!_valid || _busy) return;
    setState(() => _busy = true);
    final router = GoRouter.of(context);
    final isNew =
        await ref.read(authServiceProvider).verifyOtp(_code.text.trim());
    await ref
        .read(analyticsServiceProvider)
        .track(isNew ? AnalyticsEvent.signUp : AnalyticsEvent.login('otp'));
    router.go(Routes.onboarding);
  }

  Future<void> _resend() =>
      ref.read(authServiceProvider).requestOtp(phone: widget.contact);

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return KavioPageScaffold(
      title: 'Підтвердження',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          Text('Введіть код із SMS', style: AppTypography.title3(kavio.ink)),
          const SizedBox(height: Spacing.s2),
          Text('Надіслано на ${widget.contact}',
              style: AppTypography.body(kavio.ink2)),
          const SizedBox(height: Spacing.s6),
          KavioTextField(
            label: 'Код',
            hint: '••••',
            controller: _code,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.s6),
          KavioButton('Підтвердити',
              expand: true, onPressed: _valid && !_busy ? _verify : null),
          const SizedBox(height: Spacing.s3),
          Center(
            child: TextButton(
              onPressed: _resend,
              child: Text('Надіслати код ще раз',
                  style: AppTypography.label(kavio.accent)),
            ),
          ),
        ],
      ),
    );
  }
}
