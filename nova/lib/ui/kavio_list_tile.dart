import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Строка списка/настроек: иконка + заголовок (+подзаголовок) + trailing/шеврон.
class KavioListTile extends StatelessWidget {
  const KavioListTile({
    super.key,
    this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  final IconData? icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Radii.md),
      child: Padding(
        padding:
            const EdgeInsets.symmetric(horizontal: Spacing.s4, vertical: 14),
        child: Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 20, color: kavio.ink2),
              const SizedBox(width: Spacing.s3),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppTypography.body(kavio.ink)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: AppTypography.label(kavio.ink3)),
                  ],
                ],
              ),
            ),
            if (trailing != null)
              trailing!
            else if (onTap != null)
              Icon(Icons.chevron_right, size: 20, color: kavio.ink3),
          ],
        ),
      ),
    );
  }
}
