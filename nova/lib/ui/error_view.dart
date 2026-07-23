import 'package:flutter/material.dart';

import '../design/theme.dart';
import 'kavio_button.dart';

/// Спокойный экран ошибки: человеческий язык + путь вперёд (повторить).
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, this.message, this.onRetry});
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.s6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, color: kavio.ink3, size: 32),
            const SizedBox(height: Spacing.s3),
            Text(
              message ??
                  'Не удалось загрузить. Данные сохранены — попробуйте ещё раз.',
              textAlign: TextAlign.center,
              style: AppTypography.label(kavio.ink2),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: Spacing.s4),
              KavioButton('Повторить',
                  kind: KavioButtonKind.secondary,
                  small: true,
                  onPressed: onRetry),
            ],
          ],
        ),
      ),
    );
  }
}
