import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_text.dart';
import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../core/services/notifications/notification_scheduler.dart';
import '../../core/services/remote_config/remote_config_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/kavio_sheet.dart';
import '../../ui/z.dart';
import '../calendar/calendar_screen.dart' show apptColor;

/// Новий запис — v3 bottom sheet: клієнт → послуга → день і час → «Записати».
/// Створює реальний запис (Drift) на обраний час і планує нагадування.
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
  DateTime _day =
      DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
  DateTime? _slot;

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final clients = ref.watch(clientsProvider).value ?? const <Client>[];
    final services = ref.watch(servicesProvider).value ?? const <Service>[];
    final ready = _client != null && _service != null && _slot != null;

    return KavioSheet(
      title: t('Новий запис'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ZLabel(t('Клієнт')),
          const SizedBox(height: 8),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: clients.take(8).length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final c = clients[i];
                final on = _client?.id == c.id;
                return _chip(k, on, () => setState(() => _client = c),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ZAvatar(initials: c.initials, size: 24),
                        const SizedBox(width: 7),
                        Text(c.name.split(' ').first,
                            style:
                                AppTypography.label(on ? Colors.white : k.ink)
                                    .copyWith(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600)),
                      ],
                    ));
              },
            ),
          ),
          const SizedBox(height: 18),
          ZLabel(t('Послуга')),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in services)
                _chip(
                    k,
                    _service?.id == s.id,
                    () => setState(() {
                          _service = s;
                          _slot = null;
                        }),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                                color: apptColor(s.id),
                                borderRadius: BorderRadius.circular(3))),
                        const SizedBox(width: 7),
                        Text('${s.name} · ${Fmt.money(s.price)}',
                            style: AppTypography.label(
                                    _service?.id == s.id ? Colors.white : k.ink)
                                .copyWith(
                                    fontSize: 13, fontWeight: FontWeight.w600)),
                      ],
                    )),
            ],
          ),
          const SizedBox(height: 18),
          ZLabel(t('Коли')),
          const SizedBox(height: 8),
          SizedBox(
            height: 62,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: 10,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final d = DateTime(DateTime.now().year, DateTime.now().month,
                        DateTime.now().day)
                    .add(Duration(days: i));
                final on = d == _day;
                return GestureDetector(
                  onTap: () => setState(() {
                    _day = d;
                    _slot = null;
                  }),
                  child: Container(
                    width: 50,
                    decoration: BoxDecoration(
                      color: on ? null : k.surface2,
                      gradient: on ? FX.brandButton : null,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(Fmt.weekday(d).substring(0, 2),
                            style: AppTypography.label(
                                    on ? Colors.white70 : k.ink3)
                                .copyWith(fontSize: 10)),
                        Text('${d.day}',
                            style: AppTypography.tabular(AppTypography.title3(
                                    on ? Colors.white : k.ink))
                                .copyWith(
                                    fontSize: 15, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          if (_service != null) ...[
            const SizedBox(height: 10),
            _slots(k),
          ],
          const SizedBox(height: 20),
          ZButton(
            label: ready
                ? tp('Записати на {time}', {'time': Fmt.time(_slot!)})
                : t('Оберіть клієнта, послугу і час'),
            onTap: ready ? () => _create(context) : null,
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  Widget _slots(KavioColors k) {
    final dayAppts = ref
            .watch(rangeAppointmentsProvider(
                (start: _day, end: _day.add(const Duration(days: 1)))))
            .value ??
        const <Appointment>[];
    final dur = _service!.durationMinutes;
    final slots = <DateTime>[];
    for (var h = 10; h <= 18; h++) {
      for (final m in const [0, 30]) {
        final start = DateTime(_day.year, _day.month, _day.day, h, m);
        final end = start.add(Duration(minutes: dur));
        if (end.hour > 19) continue;
        final busy =
            dayAppts.any((a) => start.isBefore(a.end) && end.isAfter(a.start));
        if (!busy) slots.add(start);
      }
    }
    if (slots.isEmpty) {
      return Text(t('На цей день вільних вікон немає'),
          style: AppTypography.label(k.ink3).copyWith(fontSize: 13));
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final s in slots)
          _chip(k, _slot == s, () => setState(() => _slot = s),
              child: Text(Fmt.time(s),
                  style: AppTypography.tabular(AppTypography.label(
                          _slot == s ? Colors.white : k.ink))
                      .copyWith(fontSize: 13, fontWeight: FontWeight.w700))),
      ],
    );
  }

  Widget _chip(KavioColors k, bool on, VoidCallback onTap,
          {required Widget child}) =>
      GestureDetector(
        onTap: () {
          zTap();
          onTap();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            color: on ? null : k.surface2,
            gradient: on ? FX.brandButton : null,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: on ? Colors.transparent : k.line),
          ),
          child: child,
        ),
      );

  Future<void> _create(BuildContext context) async {
    HapticFeedback.mediumImpact();
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final appt = Appointment(
      id: 'a${DateTime.now().microsecondsSinceEpoch}',
      client: _client!,
      service: _service!,
      start: _slot!,
      status: AppointmentStatus.confirmed,
    );
    await ref.read(appointmentsRepositoryProvider).add(appt);
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.appointmentCreated);
    await _scheduleReminders(appt);
    navigator.pop();
    messenger.showSnackBar(
      SnackBar(
          content: Text(tp('Записано {name} · {time}',
              {'name': _client!.name, 'time': Fmt.time(_slot!)}))),
    );
  }

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
          title: t('Нагадування про візит'),
          body:
              '${a.client.name} · ${a.service.name} ${t('о')} ${Fmt.time(a.start)}',
        ));
      }
    }
  }
}
