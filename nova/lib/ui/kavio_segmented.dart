import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Сегмент-контрол (напр. День / 3 дня / Неделя). Плавный переход выделения.
class KavioSegmented extends StatelessWidget {
  const KavioSegmented({
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
    final kavio = context.kavio;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: kavio.surface3,
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
                  padding: const EdgeInsets.symmetric(vertical: Spacing.s2),
                  decoration: BoxDecoration(
                    color: selected == i ? kavio.surface : Colors.transparent,
                    borderRadius: BorderRadius.circular(Radii.xs),
                    boxShadow: selected == i ? context.shadows.e1 : null,
                  ),
                  child: Text(
                    segments[i],
                    textAlign: TextAlign.center,
                    style: AppTypography.label(
                            selected == i ? kavio.ink : kavio.ink2)
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
