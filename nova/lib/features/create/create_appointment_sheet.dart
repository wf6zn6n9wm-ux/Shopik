import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../core/services/notifications/notification_scheduler.dart';
import '../../core/services/remote_config/remote_config_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/client_row.dart';
import '../../ui/format.dart';
import '../../ui/kavio_button.dart';
import '../../ui/kavio_sheet.dart';

/// Быстрая запись — bottom sheet. Каркас: выбор клиента и услуги → «Записать».
/// (Умные слоты/предсказание услуги — AI-слой следующего этапа.)
Future<void> showCreateAppointmentSheet(BuildContext context) =>
    showKavioSheet<void>(context, builder: (_) => const _CreateSheet());

class _CreateSheet extends ConsumerStatefulWidget {
  const _CreateSheet();

  @override
  ConsumerState<_CreateSheet> createState() => _CreateSheetState();
}

class _CreateSheetState extends ConsumerState<_CreateSheet> {
  Client? _client;
  Service? _service;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    final clients = ref.watch(clientsProvider).value ?? const <Client>[];
    final services = ref.watch(servicesProvider).value ?? const <Service>[];
    final ready = _client != null && _service != null;

    return KavioSheet(
      title: 'Новий запис',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('КЛІЄНТ', style: AppTypography.caption(kavio.ink3)),
          const SizedBox(height: Spacing.s2),
          ...clients.take(3).map((c) => Padding(
                padding: const EdgeInsets.only(bottom: Spacing.s2),
                child: _Selectable(
                  selected: _client?.id == c.id,
                  onTap: () => setState(() => _client = c),
                  child: ClientRow(c),
                ),
              )),
          const SizedBox(height: Spacing.s4),
          Text('ПОСЛУГА', style: AppTypography.caption(kavio.ink3)),
          const SizedBox(height: Spacing.s2),
          Wrap(
            spacing: Spacing.s2,
            runSpacing: Spacing.s2,
            children: services
                .map((s) => _ServiceChip(
                      service: s,
                      selected: _service?.id == s.id,
                      onTap: () => setState(() => _service = s),
                    ))
                .toList(),
          ),
          const SizedBox(height: Spacing.s6),
          Align(
            alignment: Alignment.centerLeft,
            child: KavioButton(
              'Записати',
              icon: Icons.check,
              onPressed: ready ? () => _create(context) : null,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _create(BuildContext context) async {
    final day = ref.read(selectedDayProvider);
    final existing =
        ref.read(dayAppointmentsProvider).value ?? const <Appointment>[];
    final start = existing.isEmpty
        ? DateTime(day.year, day.month, day.day, 10, 0)
        : existing.last.end.add(const Duration(minutes: 15));

    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    final appt = Appointment(
      id: 'a${DateTime.now().microsecondsSinceEpoch}',
      client: _client!,
      service: _service!,
      start: start,
      status: AppointmentStatus.confirmed,
    );
    await ref.read(appointmentsRepositoryProvider).add(appt);
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.appointmentCreated);
    await _scheduleReminders(appt);

    navigator.pop();
    messenger.showSnackBar(
      SnackBar(content: Text('Записано ${_client!.name} · ${Fmt.time(start)}')),
    );
  }

  /// Напоминания клиенту (−24ч/−2ч). Гейтинг FeatureFlag.push; канал доставки —
  /// адаптер NotificationScheduler (по умолчанию no-op).
  Future<void> _scheduleReminders(Appointment a) async {
    if (!ref.read(featureFlagProvider(FeatureFlag.push))) return;
    final scheduler = ref.read(notificationSchedulerProvider);
    final now = DateTime.now();
    for (final off in ReminderPolicy.offsets) {
      final at = a.start.subtract(off);
      if (at.isAfter(now)) {
        await scheduler.schedule(ScheduledReminder(
          id: ReminderPolicy.reminderId(a.id, off),
          at: at,
          title: 'Нагадування про візит',
          body: '${a.client.name} · ${a.service.name} в ${Fmt.time(a.start)}',
        ));
      }
    }
  }
}

class _Selectable extends StatelessWidget {
  const _Selectable(
      {required this.child, required this.selected, required this.onTap});
  final Widget child;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(
              color: selected ? kavio.accent : Colors.transparent, width: 1.5),
        ),
        child: child,
      ),
    );
  }
}

class _ServiceChip extends StatelessWidget {
  const _ServiceChip(
      {required this.service, required this.selected, required this.onTap});
  final Service service;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? kavio.accent : kavio.surface3,
          borderRadius: BorderRadius.circular(Radii.full),
        ),
        child: Text(
          '${service.name} · ${service.durationMinutes}′',
          style: AppTypography.label(selected ? kavio.onAccent : kavio.ink2)
              .copyWith(fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}
