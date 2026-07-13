import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Крупный заголовок экрана (+опциональный надзаголовок).
class ScreenTitle extends StatelessWidget {
  const ScreenTitle(this.title, {super.key, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (subtitle != null) ...[
          Text(subtitle!, style: AppTypography.label(kavio.ink2)),
          const SizedBox(height: 2),
        ],
        Text(title, style: AppTypography.title1(kavio.ink)),
      ],
    );
  }
}

/// Метка секции (uppercase caption).
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(label, style: AppTypography.caption(context.kavio.ink3));
  }
}
