import 'package:flutter/material.dart';

import '../design/theme.dart';
import '../domain/models.dart';

/// Статус-пилюля: точка + текст. Цвет — по семантике статуса записи.
class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});

  final AppointmentStatus status;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    final (fg, bg) = switch (status) {
      AppointmentStatus.online => (kavio.accent, kavio.accentTint),
      AppointmentStatus.confirmed || AppointmentStatus.completed => (
          kavio.success,
          kavio.successTint
        ),
      AppointmentStatus.pending || AppointmentStatus.inProgress => (
          kavio.warning,
          kavio.warningTint
        ),
      AppointmentStatus.noShow || AppointmentStatus.cancelled => (
          kavio.danger,
          kavio.dangerTint
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
          color: bg, borderRadius: BorderRadius.circular(Radii.full)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(status.label,
              style: AppTypography.caption(fg)
                  .copyWith(letterSpacing: 0.2, fontSize: 11)),
        ],
      ),
    );
  }
}
