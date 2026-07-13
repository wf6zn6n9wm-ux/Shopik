import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../core/services/remote_config/remote_config_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/appointment_card.dart';
import '../../ui/empty_state.dart';
import '../../ui/error_view.dart';
import '../../ui/kavio_segmented.dart';
import '../../ui/skeleton.dart';
import '../create/create_appointment_sheet.dart';
import 'appointment_sheet.dart';

enum CalendarView { day, week, month }

final calendarViewProvider =
    StateProvider<CalendarView>((ref) => CalendarView.day);

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
DateTime _weekStart(DateTime d) =>
    _dateOnly(d).subtract(Duration(days: d.weekday - 1));

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Календарь — сердце продукта. Режимы День/Неделя/Месяц, мгновенное
/// переключение, реактивные данные из Drift, тап по записи → карточка.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(analyticsServiceProvider).track(AnalyticsEvent.calendarOpened);
    });
  }

  void _setView(CalendarView v) {
    ref.read(calendarViewProvider.notifier).state = v;
    ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.calendarViewChanged(v.name));
  }

  String _title(CalendarView view, DateTime day) {
    switch (view) {
      case CalendarView.day:
        return _cap(DateFormat('EEEE, d MMMM', 'ru').format(day));
      case CalendarView.week:
        final s = _weekStart(day);
        final e = s.add(const Duration(days: 6));
        return '${DateFormat('d MMM', 'ru').format(s)} – '
            '${DateFormat('d MMM', 'ru').format(e)}';
      case CalendarView.month:
        return _cap(DateFormat('LLLL yyyy', 'ru').format(day));
    }
  }

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    final view = ref.watch(calendarViewProvider);
    final day = ref.watch(selectedDayProvider);

    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Календарь', style: AppTypography.title1(kavio.ink)),
                const SizedBox(height: 2),
                Text(_title(view, day), style: AppTypography.label(kavio.ink2)),
                const SizedBox(height: Spacing.s3),
                KavioSegmented(
                  segments: const ['День', 'Неделя', 'Месяц'],
                  selected: view.index,
                  onChanged: (i) => _setView(CalendarView.values[i]),
                ),
              ],
            ),
          ),
          Expanded(
            child: switch (view) {
              CalendarView.day => const _DayView(),
              CalendarView.week => const _WeekView(),
              CalendarView.month => const _MonthView(),
            },
          ),
        ],
      ),
    );
  }
}

// ---------------- День ----------------

class _DayView extends ConsumerWidget {
  const _DayView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appts = ref.watch(dayAppointmentsProvider);
    return appts.when(
      loading: () => const SkeletonList(),
      error: (e, _) =>
          ErrorView(onRetry: () => ref.invalidate(dayAppointmentsProvider)),
      data: (list) {
        if (list.isEmpty) {
          return EmptyState(
            icon: Icons.event_available_outlined,
            title: 'Свободный день',
            message: 'Тап по ➕ — и вы записаны.',
            actionLabel: 'Новая запись',
            onAction: () => showCreateAppointmentSheet(context),
          );
        }
        return ListView.separated(
          padding:
              const EdgeInsets.fromLTRB(Spacing.s5, 0, Spacing.s5, Spacing.s16),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: Spacing.s2),
          itemBuilder: (context, i) => AppointmentCard(
            list[i],
            onTap: () => showAppointmentSheet(context, list[i]),
          ),
        );
      },
    );
  }
}

// ---------------- Неделя ----------------

class _WeekView extends ConsumerWidget {
  const _WeekView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = ref.watch(selectedDayProvider);
    final start = _weekStart(day);
    final end = start.add(const Duration(days: 7));
    final appts =
        ref.watch(rangeAppointmentsProvider((start: start, end: end)));

    return appts.when(
      loading: () => const SkeletonList(),
      error: (e, _) => ErrorView(
          onRetry: () => ref
              .invalidate(rangeAppointmentsProvider((start: start, end: end)))),
      data: (list) {
        final byDay = <int, List<Appointment>>{};
        for (final a in list) {
          final k = _dateOnly(a.start).difference(start).inDays;
          byDay.putIfAbsent(k, () => []).add(a);
        }
        final dnd = ref.watch(featureFlagProvider(FeatureFlag.dragAndDrop));
        return ListView.builder(
          padding:
              const EdgeInsets.fromLTRB(Spacing.s5, 0, Spacing.s5, Spacing.s16),
          itemCount: 7,
          itemBuilder: (context, i) => _DaySection(
              date: start.add(Duration(days: i)), items: byDay[i], dnd: dnd),
        );
      },
    );
  }
}

class _DaySection extends ConsumerWidget {
  const _DaySection(
      {required this.date, required this.items, required this.dnd});

  final DateTime date;
  final List<Appointment>? items;
  final bool dnd;

  Future<void> _move(WidgetRef ref, Appointment a) async {
    if (_dateOnly(a.start) == _dateOnly(date)) return; // тот же день — пропуск
    final newStart =
        DateTime(date.year, date.month, date.day, a.start.hour, a.start.minute);
    await ref.read(appointmentsRepositoryProvider).move(a.id, newStart);
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.appointmentMoved);
  }

  Widget _card(BuildContext context, Appointment a) {
    final card =
        AppointmentCard(a, onTap: () => showAppointmentSheet(context, a));
    if (!dnd) return card;
    return LongPressDraggable<Appointment>(
      data: a,
      feedback: Material(
        color: Colors.transparent,
        child: Opacity(opacity: 0.9, child: SizedBox(width: 320, child: card)),
      ),
      childWhenDragging: Opacity(opacity: 0.4, child: card),
      child: card,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kavio = context.kavio;
    final list = items ?? const <Appointment>[];

    Widget content(bool hovered) => Container(
          margin: const EdgeInsets.only(bottom: Spacing.s4),
          padding: dnd ? const EdgeInsets.all(Spacing.s2) : EdgeInsets.zero,
          decoration: dnd
              ? BoxDecoration(
                  color: hovered ? kavio.accentTint : Colors.transparent,
                  borderRadius: BorderRadius.circular(Radii.md),
                )
              : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_cap(DateFormat('EEEE, d MMM', 'ru').format(date)),
                  style: AppTypography.label(kavio.ink2)),
              const SizedBox(height: Spacing.s2),
              if (list.isEmpty)
                Text('Нет записей', style: AppTypography.label(kavio.ink3))
              else
                for (final a in list)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Spacing.s2),
                    child: _card(context, a),
                  ),
            ],
          ),
        );

    if (!dnd) return content(false);
    return DragTarget<Appointment>(
      onAcceptWithDetails: (d) => _move(ref, d.data),
      builder: (context, candidate, rejected) => content(candidate.isNotEmpty),
    );
  }
}

// ---------------- Месяц ----------------

class _MonthView extends ConsumerWidget {
  const _MonthView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kavio = context.kavio;
    final day = ref.watch(selectedDayProvider);
    final monthStart = DateTime(day.year, day.month, 1);
    final nextMonth = DateTime(day.year, day.month + 1, 1);
    final appts = ref
        .watch(rangeAppointmentsProvider((start: monthStart, end: nextMonth)));

    return appts.when(
      loading: () => const SkeletonList(),
      error: (e, _) => ErrorView(
          onRetry: () => ref.invalidate(
              rangeAppointmentsProvider((start: monthStart, end: nextMonth)))),
      data: (list) {
        final counts = <int, int>{};
        for (final a in list) {
          counts[a.start.day] = (counts[a.start.day] ?? 0) + 1;
        }
        final daysInMonth = DateTime(day.year, day.month + 1, 0).day;
        final leading = monthStart.weekday - 1; // Пн = 0
        const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: Spacing.s5),
          child: Column(
            children: [
              Row(
                children: [
                  for (final l in labels)
                    Expanded(
                      child: Center(
                        child:
                            Text(l, style: AppTypography.caption(kavio.ink3)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: Spacing.s2),
              Expanded(
                child: GridView.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    mainAxisSpacing: Spacing.s1,
                    crossAxisSpacing: Spacing.s1,
                  ),
                  itemCount: leading + daysInMonth,
                  itemBuilder: (context, idx) {
                    if (idx < leading) return const SizedBox();
                    final dnum = idx - leading + 1;
                    final cellDate = DateTime(day.year, day.month, dnum);
                    return _MonthCell(
                      day: dnum,
                      count: counts[dnum] ?? 0,
                      selected: dnum == day.day,
                      onTap: () {
                        ref.read(selectedDayProvider.notifier).state = cellDate;
                        ref.read(calendarViewProvider.notifier).state =
                            CalendarView.day;
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MonthCell extends StatelessWidget {
  const _MonthCell({
    required this.day,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final int day;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: selected ? kavio.accentTint : kavio.surface,
          borderRadius: BorderRadius.circular(Radii.sm),
          border: Border.all(color: selected ? kavio.accent : kavio.line),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$day',
                style:
                    AppTypography.label(selected ? kavio.accent : kavio.ink)),
            const SizedBox(height: 4),
            if (count > 0)
              Container(
                width: 5,
                height: 5,
                decoration:
                    BoxDecoration(color: kavio.accent, shape: BoxShape.circle),
              )
            else
              const SizedBox(height: 5),
          ],
        ),
      ),
    );
  }
}
