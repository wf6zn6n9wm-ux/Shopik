import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/kavio_button.dart';
import '../../ui/kavio_sheet.dart';
import '../../ui/status_pill.dart';

/// Карточка записи: детали + смена статуса + удаление (с аналитикой).
Future<void> showAppointmentSheet(BuildContext context, Appointment a) =>
    showKavioSheet<void>(context,
        builder: (_) => _AppointmentSheet(appointment: a));

class _AppointmentSheet extends ConsumerWidget {
  const _AppointmentSheet({required this.appointment});

  final Appointment appointment;

  Future<void> _setStatus(
      WidgetRef ref, BuildContext context, AppointmentStatus s) async {
    final navigator = Navigator.of(context);
    await ref
        .read(appointmentsRepositoryProvider)
        .updateStatus(appointment.id, s);
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.appointmentStatusChanged(s.name));
    navigator.pop();
  }

  Future<void> _delete(WidgetRef ref, BuildContext context) async {
    final navigator = Navigator.of(context);
    await ref.read(appointmentsRepositoryProvider).delete(appointment.id);
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.appointmentDeleted);
    navigator.pop();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kavio = context.kavio;
    final a = appointment;
    final meta = [
      if (a.staff != null) a.staff!.name,
      if (a.resource != null) a.resource!.name,
    ].join(' · ');

    return KavioSheet(
      title: a.client.name,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(Fmt.range(a.start, a.end),
                  style: AppTypography.label(kavio.ink2)),
              const Spacer(),
              StatusPill(a.status),
            ],
          ),
          const SizedBox(height: Spacing.s2),
          Text('${a.service.name} · ${Fmt.money(a.service.price)}',
              style: AppTypography.body(kavio.ink)),
          if (meta.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(meta, style: AppTypography.label(kavio.ink2)),
          ],
          const SizedBox(height: Spacing.s5),
          Row(
            children: [
              Expanded(
                child: KavioButton('Подтвердить',
                    small: true,
                    expand: true,
                    onPressed: () =>
                        _setStatus(ref, context, AppointmentStatus.confirmed)),
              ),
              const SizedBox(width: Spacing.s2),
              Expanded(
                child: KavioButton('Завершить',
                    small: true,
                    expand: true,
                    kind: KavioButtonKind.secondary,
                    onPressed: () =>
                        _setStatus(ref, context, AppointmentStatus.completed)),
              ),
            ],
          ),
          const SizedBox(height: Spacing.s2),
          Row(
            children: [
              Expanded(
                child: KavioButton('Неявка',
                    small: true,
                    expand: true,
                    kind: KavioButtonKind.secondary,
                    onPressed: () =>
                        _setStatus(ref, context, AppointmentStatus.noShow)),
              ),
              const SizedBox(width: Spacing.s2),
              Expanded(
                child: KavioButton('Удалить',
                    small: true,
                    expand: true,
                    kind: KavioButtonKind.danger,
                    onPressed: () => _delete(ref, context)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
