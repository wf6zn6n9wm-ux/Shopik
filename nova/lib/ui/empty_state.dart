import 'package:flutter/material.dart';

import '../design/theme.dart';
import 'kavio_button.dart';

/// Пустое состояние = точка входа, а не пустота. Иконка + заголовок +
/// спокойный текст + одно действие.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: Container(
          margin: const EdgeInsets.all(Spacing.s5),
          padding: const EdgeInsets.symmetric(
              horizontal: Spacing.s6, vertical: Spacing.s8),
          decoration: BoxDecoration(
            color: kavio.surface,
            borderRadius: BorderRadius.circular(Radii.lg),
            border: Border.all(color: kavio.line2, style: BorderStyle.solid),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                    color: kavio.accentTint,
                    borderRadius: BorderRadius.circular(Radii.md)),
                child: Icon(icon, color: kavio.accent, size: 22),
              ),
              const SizedBox(height: Spacing.s3),
              Text(title,
                  textAlign: TextAlign.center,
                  style: AppTypography.title3(kavio.ink)),
              const SizedBox(height: Spacing.s1),
              Text(message,
                  textAlign: TextAlign.center,
                  style: AppTypography.label(kavio.ink2)),
              if (actionLabel != null) ...[
                const SizedBox(height: Spacing.s4),
                KavioButton(actionLabel!, onPressed: onAction, small: true),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
