import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Плитка показателя: метка → большое число → дельта.
class StatTile extends StatelessWidget {
  const StatTile(
      {super.key,
      required this.label,
      required this.value,
      this.delta,
      this.compact = false});

  final String label;
  final String value;
  final String? delta;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Container(
      padding: EdgeInsets.all(compact ? Spacing.s3 : Spacing.s4),
      decoration: BoxDecoration(
        color: kavio.surface,
        borderRadius: BorderRadius.circular(compact ? Radii.sm : Radii.md),
        border: Border.all(color: kavio.line),
        boxShadow: compact ? null : context.shadows.e1,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: AppTypography.label(kavio.ink2)
                  .copyWith(fontSize: compact ? 10 : 12)),
          SizedBox(height: compact ? 2 : 3),
          Text(
            value,
            style: AppTypography.tabular(
              compact
                  ? AppTypography.title3(kavio.ink)
                  : AppTypography.title1(kavio.ink).copyWith(fontSize: 26),
            ),
          ),
          if (delta != null) ...[
            const SizedBox(height: 2),
            Text(delta!,
                style: AppTypography.label(kavio.success)
                    .copyWith(fontWeight: FontWeight.w600, fontSize: 12)),
          ],
        ],
      ),
    );
  }
}
