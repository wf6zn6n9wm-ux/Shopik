import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../core/services/remote_config/remote_config_service.dart';
import '../../design/theme.dart';
import '../../ui/kavio_button.dart';
import '../../ui/kavio_page_scaffold.dart';

/// Онлайн-запись (бизнес-сторона): ссылка/QR для клиентов + шаринг. Гостевая
/// web-страница записи — отдельная поверхность (v1). Гейтинг FeatureFlag.
class OnlineBookingScreen extends ConsumerWidget {
  const OnlineBookingScreen({super.key});

  static const _link = 'https://kavio.app/@my-studio';

  Future<void> _copy(BuildContext context, WidgetRef ref) async {
    await Clipboard.setData(const ClipboardData(text: _link));
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.bookingLinkShared('copy'));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ссылка скопирована')),
      );
    }
  }

  Future<void> _share(WidgetRef ref) async {
    final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(_link)}');
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.bookingLinkShared('whatsapp'));
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kavio = context.kavio;
    final enabled = ref.watch(featureFlagProvider(FeatureFlag.onlineBooking));

    return KavioPageScaffold(
      title: 'Онлайн-запись',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          if (!enabled)
            Container(
              padding: const EdgeInsets.all(Spacing.s4),
              decoration: BoxDecoration(
                color: kavio.warningTint,
                borderRadius: BorderRadius.circular(Radii.md),
              ),
              child: Text('Онлайн-запись временно выключена',
                  style: AppTypography.label(kavio.warning)),
            ),
          if (!enabled) const SizedBox(height: Spacing.s5),
          Text('Ссылка для клиентов', style: AppTypography.title3(kavio.ink)),
          const SizedBox(height: Spacing.s2),
          Text(
            'Поделитесь ссылкой — клиенты запишутся сами, без установки приложения.',
            style: AppTypography.body(kavio.ink2),
          ),
          const SizedBox(height: Spacing.s5),
          GestureDetector(
            onTap: enabled ? () => _copy(context, ref) : null,
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: Spacing.s4, vertical: 14),
              decoration: BoxDecoration(
                color: kavio.surface3,
                borderRadius: BorderRadius.circular(Radii.sm),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(_link, style: AppTypography.label(kavio.ink)),
                  ),
                  Icon(Icons.copy_outlined, size: 18, color: kavio.ink2),
                ],
              ),
            ),
          ),
          const SizedBox(height: Spacing.s5),
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                color: kavio.surface,
                borderRadius: BorderRadius.circular(Radii.lg),
                border: Border.all(color: kavio.line),
              ),
              child: Center(
                child: Icon(Icons.qr_code_2, size: 96, color: kavio.ink3),
              ),
            ),
          ),
          const SizedBox(height: Spacing.s5),
          KavioButton('Поделиться ссылкой',
              icon: Icons.ios_share,
              expand: true,
              onPressed: enabled ? () => _share(ref) : null),
          const SizedBox(height: Spacing.s6),
          Text('ПРАВИЛА', style: AppTypography.caption(kavio.ink3)),
          const SizedBox(height: Spacing.s2),
          const _RuleRow(
              icon: Icons.schedule_outlined,
              label: 'Окна записи',
              value: 'Рабочие часы'),
          const _RuleRow(
              icon: Icons.payments_outlined,
              label: 'Предоплата',
              value: 'Выкл.'),
          const _RuleRow(
              icon: Icons.cancel_outlined, label: 'Отмена', value: 'За 2 часа'),
        ],
      ),
    );
  }
}

class _RuleRow extends StatelessWidget {
  const _RuleRow(
      {required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Spacing.s2),
      child: Row(
        children: [
          Icon(icon, size: 20, color: kavio.ink2),
          const SizedBox(width: Spacing.s3),
          Expanded(child: Text(label, style: AppTypography.body(kavio.ink))),
          Text(value, style: AppTypography.label(kavio.ink2)),
        ],
      ),
    );
  }
}
