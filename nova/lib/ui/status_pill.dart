import 'package:flutter/material.dart';

import '../design/theme.dart';
import '../domain/models.dart';

/// Статус-пилюля: точка + текст. Цвет — по семантике статуса записи.
class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});

  final AppointmentStatus status;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final (fg, bg) = switch (status) {
      AppointmentStatus.online => (nova.accent, nova.accentTint),
      AppointmentStatus.confirmed || AppointmentStatus.completed => (nova.success, nova.successTint),
      AppointmentStatus.pending || AppointmentStatus.inProgress => (nova.warning, nova.warningTint),
      AppointmentStatus.noShow || AppointmentStatus.cancelled => (nova.danger, nova.dangerTint),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Radii.full)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 6, height: 6, decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(status.label, style: AppTypography.caption(fg).copyWith(letterSpacing: 0.2, fontSize: 11)),
        ],
      ),
    );
  }
}
