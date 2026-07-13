import 'package:flutter/material.dart';

import '../../design/theme.dart';
import '../../ui/nova_button.dart';
import '../../ui/nova_page_scaffold.dart';

/// Онлайн-запись: ссылка/QR для клиентов. В v1 — web-страница по ссылке;
/// генерация и правила подключаются на этапе функционала.
class OnlineBookingScreen extends StatelessWidget {
  const OnlineBookingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return NovaPageScaffold(
      title: 'Онлайн-запись',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          Text('Ссылка для клиентов',
              style: AppTypography.title3(nova.ink)),
          const SizedBox(height: Spacing.s2),
          Text('Поделитесь ссылкой — клиенты запишутся сами, без установки приложения.',
              style: AppTypography.body(nova.ink2)),
          const SizedBox(height: Spacing.s5),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: Spacing.s4, vertical: 14),
            decoration: BoxDecoration(
              color: nova.surface3,
              borderRadius: BorderRadius.circular(Radii.sm),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text('nova.app/@moya-studia',
                      style: AppTypography.label(nova.ink)),
                ),
                Icon(Icons.copy_outlined, size: 18, color: nova.ink2),
              ],
            ),
          ),
          const SizedBox(height: Spacing.s5),
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                color: nova.surface,
                borderRadius: BorderRadius.circular(Radii.lg),
                border: Border.all(color: nova.line),
              ),
              child: Center(
                child: Icon(Icons.qr_code_2, size: 96, color: nova.ink3),
              ),
            ),
          ),
          const SizedBox(height: Spacing.s5),
          NovaButton('Поделиться ссылкой',
              icon: Icons.ios_share, expand: true, onPressed: () {}),
        ],
      ),
    );
  }
}
