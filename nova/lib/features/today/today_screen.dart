import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/appointment_card.dart';
import '../../ui/empty_state.dart';
import '../../ui/format.dart';
import '../../ui/stat_tile.dart';

/// Главный экран — «Сегодня». Календарь-сердце: сводка дня + лента записей.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nova = context.nova;
    final day = ref.watch(selectedDayProvider);
    final appts = ref.watch(dayAppointmentsProvider);
    final summary = ref.watch(daySummaryProvider);
    final dateLabel = DateFormat('EEEE · d MMMM', 'ru').format(day);

    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_cap(dateLabel), style: AppTypography.label(nova.ink2)),
                  const SizedBox(height: 2),
                  Text('Сегодня', style: AppTypography.title1(nova.ink)),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.s5, Spacing.s2, Spacing.s5, Spacing.s4),
              child: Row(
                children: [
                  Expanded(child: StatTile(label: 'выручка', value: Fmt.money(summary.revenue), compact: true)),
                  const SizedBox(width: Spacing.s2),
                  Expanded(child: StatTile(label: 'визитов', value: '${summary.visits}', compact: true)),
                  const SizedBox(width: Spacing.s2),
                  Expanded(child: StatTile(label: 'загрузка', value: '${summary.load}%', compact: true)),
                ],
              ),
            ),
          ),
          if (appts.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.calendar_today_outlined,
                title: 'Свободный день',
                message: 'Тап по ➕ — и вы записаны. Или поделитесь ссылкой на онлайн-запись.',
              ),
            )
          else
            SliverList.separated(
              itemCount: appts.length,
              separatorBuilder: (_, __) => const SizedBox(height: Spacing.s2),
              itemBuilder: (context, i) => Padding(
                padding: EdgeInsets.fromLTRB(
                  Spacing.s5,
                  i == 0 ? 0 : 0,
                  Spacing.s5,
                  i == appts.length - 1 ? Spacing.s16 : 0,
                ),
                child: AppointmentCard(
                  appts[i],
                  onTap: () => _showAppointment(context, ref, appts[i]),
                ),
              ),
            ),
        ],
      ),
    );
  }

  static String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  void _showAppointment(BuildContext context, WidgetRef ref, Appointment a) {
    final nova = context.nova;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: nova.surface,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(Spacing.s5, 0, Spacing.s5, Spacing.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(Fmt.range(a.start, a.end), style: AppTypography.label(nova.ink2)),
            const SizedBox(height: Spacing.s2),
            Text(a.client.name, style: AppTypography.title2(nova.ink)),
            const SizedBox(height: 2),
            Text('${a.service.name} · ${Fmt.money(a.service.price)}', style: AppTypography.body(nova.ink2)),
          ],
        ),
      ),
    );
  }
}
