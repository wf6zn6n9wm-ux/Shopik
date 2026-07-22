import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/time/demo_clock.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';
import '../calendar/calendar_screen.dart' show apptColor;
import '../create/create_appointment_sheet.dart';

/// Картка клієнта — «дороге» відчуття: аватар зі свіченням, теги, наступний
/// запис, швидкі дії, LTV-hero, улюблені послуги, історія, нотатки.
class ClientDetailScreen extends ConsumerWidget {
  const ClientDetailScreen({super.key, required this.clientId});
  final String clientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final client = ref.watch(clientByIdProvider(clientId));
    final appts = ref.watch(clientAppointmentsProvider(clientId)).value ??
        const <Appointment>[];

    if (client == null) {
      return Scaffold(
        backgroundColor: k.canvas,
        appBar: AppBar(backgroundColor: k.canvas, elevation: 0),
        body: Center(
            child:
                Text('Клієнта не знайдено', style: AppTypography.body(k.ink2))),
      );
    }

    final now = demoNow();
    final past = appts.where((a) => a.start.isBefore(now)).toList()
      ..sort((a, b) => b.start.compareTo(a.start));
    Appointment? next;
    for (final a in appts) {
      if (!a.start.isBefore(now)) {
        if (next == null || a.start.isBefore(next.start)) next = a;
      }
    }
    final avg =
        client.visitsCount > 0 ? client.totalSpent ~/ client.visitsCount : 0;

    // Улюблені послуги: топ-3 за кількістю.
    final byService = <String, (String, int)>{};
    for (final a in appts) {
      final e = byService[a.service.id];
      byService[a.service.id] = (a.service.name, (e?.$2 ?? 0) + 1);
    }
    final favs = byService.entries.toList()
      ..sort((a, b) => b.value.$2.compareTo(a.value.$2));

    var i = 0;
    Widget reveal(Widget c) => StaggerReveal(index: i++, child: c);

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TopBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 120),
                children: [
                  reveal(_Header(client: client)),
                  const SizedBox(height: 14),
                  if (next != null) ...[
                    reveal(_NextChip(next: next, now: now)),
                    const SizedBox(height: 14),
                  ],
                  reveal(_QuickActions(client: client)),
                  const SizedBox(height: 14),
                  reveal(_LtvHero(
                      ltv: client.totalSpent,
                      visits: client.visitsCount,
                      avg: avg)),
                  const SizedBox(height: 16),
                  if (favs.isNotEmpty) ...[
                    reveal(const ZLabel('Улюблені послуги')),
                    const SizedBox(height: 8),
                    reveal(_Favorites(favs: favs)),
                    const SizedBox(height: 16),
                  ],
                  reveal(const ZLabel('Історія')),
                  const SizedBox(height: 8),
                  reveal(_History(past: past)),
                  const SizedBox(height: 16),
                  reveal(const ZLabel('Нотатки')),
                  const SizedBox(height: 8),
                  reveal(_Notes(note: client.note)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).maybePop(),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                  color: k.surface2, borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.chevron_left, color: k.ink2),
            ),
          ),
          const Spacer(),
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
                color: k.surface2, borderRadius: BorderRadius.circular(12)),
            child: Icon(Icons.more_horiz, color: k.ink2),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.client});
  final Client client;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final vip = client.totalSpent >= 1000000;
    final regular = client.visitsCount >= 5;
    return Row(
      children: [
        ZAvatar(initials: client.initials, size: 62, ring: true),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(client.name,
                  style: AppTypography.title2(k.ink).copyWith(fontSize: 20)),
              const SizedBox(height: 6),
              Row(
                children: [
                  if (regular)
                    ZPill('Постійна', color: k.success, bg: k.successTint),
                  if (regular) const SizedBox(width: 6),
                  if (vip) ZPill('VIP', color: k.accent, bg: k.accentTint),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _NextChip extends StatelessWidget {
  const _NextChip({required this.next, required this.now});
  final Appointment next;
  final DateTime now;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final d = DateTime(next.start.year, next.start.month, next.start.day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = d.difference(today).inDays;
    final when = diff == 0
        ? 'сьогодні'
        : diff == 1
            ? 'завтра'
            : Fmt.dayMonth(next.start);
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x248B8BF0), Color(0xFF151519)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: k.line),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
                color: k.accentTint, borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.event, size: 17, color: k.accent),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Text.rich(TextSpan(
              style: AppTypography.body(k.ink2).copyWith(fontSize: 13),
              children: [
                const TextSpan(text: 'Наступний запис · '),
                TextSpan(
                    text: '$when ${Fmt.time(next.start)}',
                    style:
                        TextStyle(color: k.ink, fontWeight: FontWeight.w700)),
              ],
            )),
          ),
          Text('Відкрити',
              style: AppTypography.label(k.accent).copyWith(fontSize: 12)),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.client});
  final Client client;
  String get _digits => client.phone.replaceAll(RegExp('[^0-9+]'), '');
  Future<void> _launch(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final actions = <(IconData, String, VoidCallback)>[
      (Icons.call_outlined, 'Дзвінок', () => _launch('tel:$_digits')),
      (Icons.chat_bubble_outline, 'Написати', () => _launch('sms:$_digits')),
      (Icons.add, 'Запис', () => showCreateAppointmentSheet(context)),
    ];
    return Row(
      children: [
        for (var i = 0; i < actions.length; i++) ...[
          if (i > 0) const SizedBox(width: 9),
          Expanded(child: _ActionTile(actions[i])),
        ],
      ],
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile(this.a);
  final (IconData, String, VoidCallback) a;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return GestureDetector(
      onTap: a.$3,
      child: ZCard(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                  color: k.accentTint, borderRadius: BorderRadius.circular(11)),
              child: Icon(a.$1, size: 17, color: k.accent),
            ),
            const SizedBox(height: 5),
            Text(a.$2,
                style: AppTypography.label(k.ink2)
                    .copyWith(fontSize: 11, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _LtvHero extends StatelessWidget {
  const _LtvHero({required this.ltv, required this.visits, required this.avg});
  final int ltv, visits, avg;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZHero(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ZLabel('Витрачено (LTV)', color: k.accent),
                const SizedBox(height: 2),
                Text(Fmt.money(ltv),
                    style: AppTypography.tabular(AppTypography.title1(k.ink))),
              ],
            ),
          ),
          _MiniStat(value: '$visits', label: 'візитів'),
          const SizedBox(width: 16),
          _MiniStat(value: Fmt.money(avg), label: 'сер. чек'),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.value, required this.label});
  final String value, label;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(value,
            style: AppTypography.tabular(AppTypography.title3(k.ink))
                .copyWith(fontSize: 15, fontWeight: FontWeight.w700)),
        Text(label, style: AppTypography.label(k.ink3).copyWith(fontSize: 10)),
      ],
    );
  }
}

class _Favorites extends StatelessWidget {
  const _Favorites({required this.favs});
  final List<MapEntry<String, (String, int)>> favs;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final f in favs.take(3))
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
                color: k.surface2, borderRadius: BorderRadius.circular(999)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                      color: apptColor(f.key), shape: BoxShape.circle),
                ),
                const SizedBox(width: 7),
                Text(f.value.$1,
                    style: AppTypography.label(k.ink).copyWith(fontSize: 12.5)),
                const SizedBox(width: 5),
                Text('×${f.value.$2}',
                    style: AppTypography.tabular(AppTypography.label(k.ink))
                        .copyWith(fontSize: 12.5, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
      ],
    );
  }
}

class _History extends StatelessWidget {
  const _History({required this.past});
  final List<Appointment> past;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    if (past.isEmpty) {
      return ZCard(
        child: Text('Поки немає візитів',
            style: AppTypography.body(k.ink2).copyWith(fontSize: 13)),
      );
    }
    return ZCard(
      padding: const EdgeInsets.all(4),
      child: Column(
        children: [
          for (var i = 0; i < past.take(4).length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                border: i == 0 ? null : Border(top: BorderSide(color: k.line)),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 54,
                    child: Text(
                        Fmt.dayMonth(past[i].start)
                            .split(' ')
                            .take(2)
                            .join(' '),
                        style:
                            AppTypography.tabular(AppTypography.label(k.ink3))
                                .copyWith(fontSize: 12.5)),
                  ),
                  Expanded(
                    child: Text(past[i].service.name,
                        style: AppTypography.label(k.ink).copyWith(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                  ),
                  Text(Fmt.money(past[i].service.price),
                      style: AppTypography.tabular(AppTypography.label(k.ink))
                          .copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Notes extends StatelessWidget {
  const _Notes({required this.note});
  final String? note;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZCard(
      child: Text(
        (note?.isNotEmpty ?? false) ? note! : 'Нотаток поки немає',
        style: AppTypography.body(k.ink2).copyWith(fontSize: 13, height: 1.5),
      ),
    );
  }
}
