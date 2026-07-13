import 'package:flutter/material.dart';

import '../design/theme.dart';
import '../domain/models.dart';
import 'format.dart';
import 'status_pill.dart';

/// Карточка записи: левый цветной rail по статусу, время, клиент, услуга.
class AppointmentCard extends StatelessWidget {
  const AppointmentCard(this.appointment, {super.key, this.onTap});

  final Appointment appointment;
  final VoidCallback? onTap;

  Color _railColor(NovaColors nova) => switch (appointment.status) {
        AppointmentStatus.online => nova.accent,
        AppointmentStatus.confirmed ||
        AppointmentStatus.completed =>
          nova.success,
        AppointmentStatus.pending ||
        AppointmentStatus.inProgress =>
          nova.warning,
        AppointmentStatus.noShow || AppointmentStatus.cancelled => nova.danger,
      };

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final a = appointment;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          color: nova.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: nova.line),
          boxShadow: context.shadows.e1,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 3,
              height: 40,
              margin: const EdgeInsets.only(right: 12, top: 1),
              decoration: BoxDecoration(
                  color: _railColor(nova),
                  borderRadius: BorderRadius.circular(3)),
            ),
            SizedBox(
              width: 44,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(Fmt.time(a.start),
                      style:
                          AppTypography.tabular(AppTypography.label(nova.ink2))
                              .copyWith(fontWeight: FontWeight.w600)),
                  Text("${a.service.durationMinutes}′",
                      style: AppTypography.caption(nova.ink3)
                          .copyWith(letterSpacing: 0)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.client.name,
                      style: AppTypography.title3(nova.ink)
                          .copyWith(fontSize: 15)),
                  const SizedBox(height: 2),
                  Text(
                    a.staff == null
                        ? a.service.name
                        : '${a.service.name} · ${a.staff!.name}',
                    style: AppTypography.label(nova.ink2),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            StatusPill(a.status),
          ],
        ),
      ),
    );
  }
}
