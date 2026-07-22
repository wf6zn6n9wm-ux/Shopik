import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/time/demo_clock.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';
import '../create/create_appointment_sheet.dart';
import 'appointment_sheet.dart';

enum CalendarView { day, week, month }

/// Початковий режим можна задати через ?view=week|month у URL — це
/// використовується для знімків екранів у CI (кожен режим — окремим маршрутом).
CalendarView _initialView() {
  final frag = Uri.base.fragment;
  final qi = frag.indexOf('?');
  if (qi < 0) return CalendarView.day;
  final view = Uri.splitQueryString(frag.substring(qi + 1))['view'];
  return switch (view) {
    'week' => CalendarView.week,
    'month' => CalendarView.month,
    _ => CalendarView.day,
  };
}

final calendarViewProvider =
    StateProvider<CalendarView>((ref) => _initialView());

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
DateTime _weekStart(DateTime d) =>
    _dateOnly(d).subtract(Duration(days: d.weekday - 1));

/// Колір запису за послугою: манікюр — iris, педикюр — зелений, інше — бурштин.
Color apptColor(String serviceId) {
  if (serviceId.contains('gel') ||
      serviceId.contains('man') ||
      serviceId.contains('art')) {
    return const Color(0xFF9A9AF6);
  }
  if (serviceId.contains('spa') ||
      serviceId.contains('exp') ||
      serviceId.contains('ped')) {
    return const Color(0xFF46D08A);
  }
  return const Color(0xFFE6B24E);
}

/// Календар — серце продукту. День (лінія «зараз» + вільні вікна), Тиждень,
/// Місяць-пульс. Реактивні дані з Drift, тап по запису → картка.
class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(calendarViewProvider);
    return Container(
      color: context.kavio.canvas,
      child: SafeArea(
        bottom: false,
        child: switch (view) {
          CalendarView.day => const _DayView(),
          CalendarView.week => const _WeekView(),
          CalendarView.month => const _MonthView(),
        },
      ),
    );
  }
}

class _Seg extends ConsumerWidget {
  const _Seg();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final view = ref.watch(calendarViewProvider);
    return ZSegmented(
      items: const ['День', 'Тиждень', 'Місяць'],
      index: view.index,
      onChanged: (i) =>
          ref.read(calendarViewProvider.notifier).state = CalendarView.values[i],
    );
  }
}

// ─────────────────────────────────────────── День

class _DayView extends ConsumerWidget {
  const _DayView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final day = ref.watch(selectedDayProvider);
    final apptsAsync = ref.watch(dayAppointmentsProvider);
    final list = apptsAsync.value ?? const <Appointment>[];
    final now = demoNow();
    final isToday = _dateOnly(day) == _dateOnly(now);

    final completed = list
        .where((a) => a.status == AppointmentStatus.completed)
        .fold<int>(0, (s, a) => s + a.service.price);
    // Вільні години в межах 10:00–20:00.
    final freeMin = _freeMinutes(list, day);

    void shift(int d) => ref.read(selectedDayProvider.notifier).state =
        _dateOnly(day).add(Duration(days: d));

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(Fmt.weekday(day),
                      style: AppTypography.label(k.ink3).copyWith(fontSize: 12)),
                  Text(Fmt.dayMonth(day), style: AppTypography.title1(k.ink)),
                ],
              ),
            ),
            _RoundBtn(icon: Icons.chevron_left, onTap: () => shift(-1)),
            const SizedBox(width: 8),
            _RoundBtn(icon: Icons.chevron_right, onTap: () => shift(1)),
          ],
        ),
        const SizedBox(height: 14),
        const _Seg(),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
                child: ZStatCard(label: 'Записів', value: '${list.length}')),
            const SizedBox(width: 8),
            Expanded(
                child: ZStatCard(label: 'Виручка', value: Fmt.money(completed))),
            const SizedBox(width: 8),
            Expanded(
                child: ZStatCard(
                    label: 'Вільно', value: '${(freeMin / 60).round()} год')),
          ],
        ),
        const SizedBox(height: 16),
        if (list.isEmpty)
          _EmptyDay()
        else
          ..._timeline(context, list, now, isToday),
      ],
    );
  }

  int _freeMinutes(List<Appointment> list, DateTime day) {
    final open = DateTime(day.year, day.month, day.day, 10);
    final close = DateTime(day.year, day.month, day.day, 20);
    var busy = 0;
    for (final a in list) {
      final s = a.start.isBefore(open) ? open : a.start;
      final e = a.end.isAfter(close) ? close : a.end;
      if (e.isAfter(s)) busy += e.difference(s).inMinutes;
    }
    return (close.difference(open).inMinutes - busy).clamp(0, 600);
  }

  List<Widget> _timeline(
      BuildContext context, List<Appointment> list, DateTime now, bool isToday) {
    final items = [...list]..sort((a, b) => a.start.compareTo(b.start));
    final widgets = <Widget>[];
    var nowPlaced = !isToday;
    DateTime? prevEnd;
    var idx = 0;

    void maybeNow(DateTime before) {
      if (!nowPlaced && now.isBefore(before) &&
          (prevEnd == null || !now.isBefore(prevEnd!))) {
        widgets.add(StaggerReveal(index: idx++, child: _NowLine(time: now)));
        nowPlaced = true;
      }
    }

    for (final a in items) {
      maybeNow(a.start);
      if (prevEnd != null && a.start.difference(prevEnd!).inMinutes >= 40) {
        widgets.add(StaggerReveal(
          index: idx++,
          child: _TimelineRow(
            time: Fmt.time(prevEnd!),
            child: ZFreeSlot(
              duration: '${a.start.difference(prevEnd!).inMinutes} хв',
              onTap: () => showCreateAppointmentSheet(context),
            ),
          ),
        ));
      }
      widgets.add(StaggerReveal(
        index: idx++,
        child: _TimelineRow(
          time: Fmt.time(a.start),
          child: _ApptCard(a),
        ),
      ));
      prevEnd = a.end;
    }
    if (!nowPlaced) {
      widgets.add(StaggerReveal(index: idx++, child: _NowLine(time: now)));
    }
    return widgets;
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.time, required this.child});
  final String time;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Padding(
              padding: const EdgeInsets.only(top: 4, right: 6),
              child: Text(time,
                  textAlign: TextAlign.right,
                  style: AppTypography.tabular(AppTypography.label(k.ink3))
                      .copyWith(fontSize: 12)),
            ),
          ),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _ApptCard extends StatelessWidget {
  const _ApptCard(this.a);
  final Appointment a;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final c = apptColor(a.service.id);
    return GestureDetector(
      onTap: () => showAppointmentSheet(context, a),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: const Alignment(-0.8, -1),
                  end: const Alignment(0.8, 1),
                  colors: [c.withOpacity(0.18), c.withOpacity(0.07)],
                ),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: c.withOpacity(0.28), width: 1),
              ),
              padding: const EdgeInsets.fromLTRB(15, 12, 13, 12),
              child: Row(
                children: [
                  ZAvatar(
                      initials: a.client.initials,
                      size: 30,
                      color: c,
                      bg: c.withOpacity(0.18)),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(a.client.name,
                            style: AppTypography.title3(k.ink)
                                .copyWith(fontSize: 14)),
                        Text(
                            '${a.service.name} · ${Fmt.duration(a.service.durationMinutes)}',
                            style: AppTypography.label(k.ink2)
                                .copyWith(fontSize: 12)),
                      ],
                    ),
                  ),
                  Text(Fmt.money(a.service.price),
                      style: AppTypography.tabular(AppTypography.title3(k.ink))
                          .copyWith(fontSize: 13, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
            Positioned(
                left: 0, top: 0, bottom: 0, child: Container(width: 3, color: c)),
          ],
        ),
      ),
    );
  }
}

class _NowLine extends StatelessWidget {
  const _NowLine({required this.time});
  final DateTime time;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            child: Padding(
              padding: const EdgeInsets.only(right: 6),
              child: Text(Fmt.time(time),
                  textAlign: TextAlign.right,
                  style: AppTypography.tabular(AppTypography.label(k.accent))
                      .copyWith(fontSize: 11, fontWeight: FontWeight.w800)),
            ),
          ),
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(
              color: k.accent,
              shape: BoxShape.circle,
              boxShadow: const [BoxShadow(color: Color(0xBF8B8BF0), blurRadius: 10)],
            ),
          ),
          Expanded(
            child: Container(
              height: 2,
              margin: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                    colors: [k.accent, k.accent.withOpacity(0)]),
              ),
            ),
          ),
          Text('зараз',
              style: AppTypography.label(k.accent)
                  .copyWith(fontSize: 10, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _RoundBtn extends StatelessWidget {
  const _RoundBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
            color: k.surface2, borderRadius: BorderRadius.circular(11)),
        child: Icon(icon, size: 18, color: k.ink2),
      ),
    );
  }
}

class _EmptyDay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Padding(
      padding: const EdgeInsets.only(top: 60),
      child: Column(
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: k.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: k.line),
            ),
            child: Icon(Icons.event_available_outlined, size: 36, color: k.accent),
          ),
          const SizedBox(height: 16),
          Text('Вільний день', style: AppTypography.title2(k.ink)),
          const SizedBox(height: 8),
          SizedBox(
            width: 240,
            child: Text(
              'Жодного запису. Ідеальний час додати перший або поділитися онлайн-записом.',
              textAlign: TextAlign.center,
              style: AppTypography.body(k.ink2).copyWith(fontSize: 14),
            ),
          ),
          const SizedBox(height: 20),
          ZButton(
              label: '＋ Новий запис',
              expand: false,
              onTap: () => showCreateAppointmentSheet(context)),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────── Тиждень

class _WeekView extends ConsumerWidget {
  const _WeekView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final day = ref.watch(selectedDayProvider);
    final start = _weekStart(day);
    final end = start.add(const Duration(days: 7));
    final list =
        ref.watch(rangeAppointmentsProvider((start: start, end: end))).value ??
            const <Appointment>[];
    final today = _dateOnly(demoNow());

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      children: [
        Text('Тиждень', style: AppTypography.title1(k.ink)),
        const SizedBox(height: 14),
        const _Seg(),
        const SizedBox(height: 16),
        Row(
          children: [
            const SizedBox(width: 22),
            for (var i = 0; i < 7; i++)
              Expanded(child: _WeekHeadCell(date: start.add(Duration(days: i)), today: today)),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 430,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 22,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (final h in [10, 12, 14, 16, 18])
                      Text('$h',
                          style: AppTypography.tabular(AppTypography.label(k.ink3))
                              .copyWith(fontSize: 9)),
                  ],
                ),
              ),
              for (var i = 0; i < 7; i++)
                Expanded(
                  child: _WeekColumn(
                    date: start.add(Duration(days: i)),
                    today: today,
                    items: list
                        .where((a) => _dateOnly(a.start) == start.add(Duration(days: i)))
                        .toList(),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _WeekHeadCell extends StatelessWidget {
  const _WeekHeadCell({required this.date, required this.today});
  final DateTime date;
  final DateTime today;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final isToday = _dateOnly(date) == today;
    const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 2),
      padding: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(
        color: isToday ? k.accentTint : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(names[date.weekday - 1],
              style: AppTypography.label(isToday ? k.accent : k.ink3)
                  .copyWith(fontSize: 10)),
          Text('${date.day}',
              style: AppTypography.tabular(
                      AppTypography.title3(isToday ? k.accent : k.ink))
                  .copyWith(fontSize: 14, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _WeekColumn extends StatelessWidget {
  const _WeekColumn({required this.date, required this.today, required this.items});
  final DateTime date;
  final DateTime today;
  final List<Appointment> items;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final isToday = _dateOnly(date) == today;
    const topH = 10.0, botH = 18.0; // 10:00–18:00
    double frac(DateTime t) =>
        ((t.hour + t.minute / 60) - topH) / (botH - topH);
    return LayoutBuilder(builder: (context, box) {
      final h = box.maxHeight;
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        decoration: BoxDecoration(
          color: isToday ? k.accentTint.withOpacity(0.4) : k.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: k.line),
        ),
        child: Stack(
          children: [
            for (final a in items)
              Positioned(
                left: 3,
                right: 3,
                top: (frac(a.start).clamp(0.0, 1.0)) * h,
                height: ((a.service.durationMinutes / 60 / (botH - topH)) * h)
                    .clamp(10.0, h),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: const Alignment(-0.8, -1),
                              end: const Alignment(0.8, 1),
                              colors: [
                                apptColor(a.service.id).withOpacity(0.36),
                                apptColor(a.service.id).withOpacity(0.16),
                              ],
                            ),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                                color: apptColor(a.service.id).withOpacity(0.5),
                                width: 1),
                          ),
                        ),
                      ),
                      Positioned(
                          left: 0,
                          top: 0,
                          bottom: 0,
                          child: Container(width: 2.5, color: apptColor(a.service.id))),
                    ],
                  ),
                ),
              ),
          ],
        ),
      );
    });
  }
}

// ─────────────────────────────────────────── Місяць

class _MonthView extends ConsumerWidget {
  const _MonthView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final day = ref.watch(selectedDayProvider);
    final monthStart = DateTime(day.year, day.month, 1);
    final nextMonth = DateTime(day.year, day.month + 1, 1);
    final list = ref
            .watch(rangeAppointmentsProvider((start: monthStart, end: nextMonth)))
            .value ??
        const <Appointment>[];
    final counts = <int, int>{};
    for (final a in list) {
      counts[a.start.day] = (counts[a.start.day] ?? 0) + 1;
    }
    final maxCount = counts.values.fold<int>(1, (m, v) => v > m ? v : m);
    final daysInMonth = DateTime(day.year, day.month + 1, 0).day;
    final leading = monthStart.weekday - 1;
    final today = demoNow();
    const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

    final cells = <Widget>[];
    for (var i = 0; i < leading; i++) {
      cells.add(const SizedBox());
    }
    for (var dnum = 1; dnum <= daysInMonth; dnum++) {
      final count = counts[dnum] ?? 0;
      final intensity = count / maxCount;
      final isToday = dnum == today.day && day.month == today.month;
      cells.add(_MonthCell(
        day: dnum,
        intensity: intensity,
        isToday: isToday,
        onTap: () {
          ref.read(selectedDayProvider.notifier).state =
              DateTime(day.year, day.month, dnum);
          ref.read(calendarViewProvider.notifier).state = CalendarView.day;
        },
      ));
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(_monthName(day.month), style: AppTypography.title1(k.ink)),
            Text(Fmt.money(list
                    .where((a) => a.status == AppointmentStatus.completed)
                    .fold<int>(0, (s, a) => s + a.service.price)),
                style: AppTypography.label(k.ink2).copyWith(fontSize: 13)),
          ],
        ),
        const SizedBox(height: 14),
        const _Seg(),
        const SizedBox(height: 16),
        Row(
          children: [
            for (final l in labels)
              Expanded(
                child: Center(
                  child: Text(l,
                      style: AppTypography.label(k.ink3)
                          .copyWith(fontSize: 10, fontWeight: FontWeight.w700)),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        GridView.count(
          crossAxisCount: 7,
          mainAxisSpacing: 5,
          crossAxisSpacing: 5,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: cells,
        ),
        const SizedBox(height: 16),
        _MonthLegend(),
      ],
    );
  }

  String _monthName(int m) {
    const names = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ];
    return names[m - 1];
  }
}

class _MonthCell extends StatelessWidget {
  const _MonthCell({
    required this.day,
    required this.intensity,
    required this.isToday,
    required this.onTap,
  });
  final int day;
  final double intensity;
  final bool isToday;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final has = intensity > 0;
    return GestureDetector(
      onTap: onTap,
      child: AspectRatio(
        aspectRatio: 1,
        child: Container(
          decoration: BoxDecoration(
            color: has
                ? const Color(0xFF8B8BF0).withOpacity(0.1 + intensity * 0.55)
                : k.surface,
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: isToday ? k.accent : k.line),
            boxShadow: isToday
                ? const [BoxShadow(color: Color(0xBF8B8BF0), blurRadius: 12, spreadRadius: -4, offset: Offset(0, 4))]
                : null,
          ),
          child: Stack(
            children: [
              Positioned(
                top: 5,
                right: 5,
                child: Text('$day',
                    style: AppTypography.tabular(AppTypography.label(
                            intensity > 0.6 ? Colors.white : k.ink2))
                        .copyWith(
                            fontSize: 10,
                            fontWeight: isToday ? FontWeight.w800 : FontWeight.w600)),
              ),
              if (has)
                Positioned(
                  left: 5,
                  bottom: 5,
                  child: Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                        color: intensity > 0.75 ? Colors.white : k.accent,
                        shape: BoxShape.circle),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthLegend extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Row(
      children: [
        Text('тихо', style: AppTypography.label(k.ink3).copyWith(fontSize: 10)),
        const SizedBox(width: 8),
        for (final o in [0.16, 0.36, 0.58, 0.8, 1.0])
          Container(
            width: 16,
            height: 8,
            margin: const EdgeInsets.only(right: 4),
            decoration: BoxDecoration(
                color: const Color(0xFF8B8BF0).withOpacity(o),
                borderRadius: BorderRadius.circular(3)),
          ),
        const SizedBox(width: 4),
        Text('щільно', style: AppTypography.label(k.ink3).copyWith(fontSize: 10)),
      ],
    );
  }
}
