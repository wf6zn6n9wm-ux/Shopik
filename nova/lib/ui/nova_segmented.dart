import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Сегмент-контрол (напр. День / 3 дня / Неделя). Плавный переход выделения.
class NovaSegmented extends StatelessWidget {
  const NovaSegmented({
    super.key,
    required this.segments,
    required this.selected,
    required this.onChanged,
  });

  final List<String> segments;
  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: nova.surface3,
        borderRadius: BorderRadius.circular(Radii.sm),
      ),
      child: Row(
        children: [
          for (var i = 0; i < segments.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(i),
                behavior: HitTestBehavior.opaque,
                child: AnimatedContainer(
                  duration: Motion.fast,
                  curve: Motion.standard,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: selected == i ? nova.surface : Colors.transparent,
                    borderRadius: BorderRadius.circular(Radii.xs),
                    boxShadow: selected == i ? context.shadows.e1 : null,
                  ),
                  child: Text(
                    segments[i],
                    textAlign: TextAlign.center,
                    style: AppTypography.label(selected == i ? nova.ink : nova.ink2)
                        .copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
