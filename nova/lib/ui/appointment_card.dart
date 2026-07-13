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

  Color _railColor(KavioColors kavio) => switch (appointment.status) {
        AppointmentStatus.online => kavio.accent,
        AppointmentStatus.confirmed ||
        AppointmentStatus.completed =>
          kavio.success,
        AppointmentStatus.pending ||
        AppointmentStatus.inProgress =>
          kavio.warning,
        AppointmentStatus.noShow || AppointmentStatus.cancelled => kavio.danger,
      };

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    final a = appointment;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          color: kavio.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: kavio.line),
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
                  color: _railColor(kavio),
                  borderRadius: BorderRadius.circular(3)),
            ),
            SizedBox(
              width: 44,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(Fmt.time(a.start),
                      style:
                          AppTypography.tabular(AppTypography.label(kavio.ink2))
                              .copyWith(fontWeight: FontWeight.w600)),
                  Text("${a.service.durationMinutes}′",
                      style: AppTypography.caption(kavio.ink3)
                          .copyWith(letterSpacing: 0)),
                ],
              ),
            ),
            const SizedBox(width: Spacing.s2),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.client.name,
                      style: AppTypography.title3(kavio.ink)
                          .copyWith(fontSize: 15)),
                  const SizedBox(height: 2),
                  Text(
                    a.staff == null
                        ? a.service.name
                        : '${a.service.name} · ${a.staff!.name}',
                    style: AppTypography.label(kavio.ink2),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: Spacing.s2),
            StatusPill(a.status),
          ],
        ),
      ),
    );
  }
}
