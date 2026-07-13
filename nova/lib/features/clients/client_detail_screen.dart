import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/client_row.dart';
import '../../ui/format.dart';
import '../../ui/nova_page_scaffold.dart';
import '../../ui/status_pill.dart';
import '../calendar/appointment_sheet.dart';
import '../create/create_appointment_sheet.dart';

/// Карточка клиента: вся информация за 3 секунды, без переходов. Секции ленивы
/// (ListView), метрики выводятся из записей. Финансы/лояльность/вложения —
/// структурные секции под будущие данные; AI — место под подсказки (интерфейс).
class ClientDetailScreen extends ConsumerStatefulWidget {
  const ClientDetailScreen({super.key, required this.clientId});

  final String clientId;

  @override
  ConsumerState<ClientDetailScreen> createState() => _ClientDetailScreenState();
}

class _ClientDetailScreenState extends ConsumerState<ClientDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(analyticsServiceProvider).track(AnalyticsEvent.clientOpened);
    });
  }

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final client = ref.watch(clientByIdProvider(widget.clientId));
    final apptsAsync = ref.watch(clientAppointmentsProvider(widget.clientId));

    if (client == null) {
      return const NovaPageScaffold(
        title: 'Клиент',
        body: Center(child: Text('Клиент не найден')),
      );
    }

    final appts = apptsAsync.value ?? const <Appointment>[];
    final m = _Metrics.from(client, appts);

    return NovaPageScaffold(
      title: 'Клиент',
      body: ListView(
        padding:
            const EdgeInsets.fromLTRB(Spacing.s5, 0, Spacing.s5, Spacing.s16),
        children: [
          _Header(client: client, status: m.status),
          const SizedBox(height: Spacing.s4),
          _QuickActions(client: client),
          const SizedBox(height: Spacing.s6),
          _StatGrid(metrics: m),
          const SizedBox(height: Spacing.s6),
          _AiInsights(status: m.status, avgIntervalDays: m.avgIntervalDays),
          const SizedBox(height: Spacing.s6),
          _Section(
            label: 'История',
            child: appts.isEmpty
                ? _muted(context, 'Пока нет визитов')
                : Column(children: [for (final a in appts) _TimelineTile(a)]),
          ),
          const SizedBox(height: Spacing.s5),
          _Section(
            label: 'Финансы',
            child: Column(children: [
              _kv(context, 'Потрачено всего', Fmt.money(client.totalSpent)),
              _kv(context, 'Оплачено', Fmt.money(client.totalSpent)),
              _kv(context, 'Долг', Fmt.money(0)),
              _kv(context, 'Предоплаты', Fmt.money(0)),
              _kv(context, 'Возвраты', Fmt.money(0)),
            ]),
          ),
          const SizedBox(height: Spacing.s5),
          _Section(
            label: 'Лояльность',
            child: Column(children: [
              _kv(context, 'Бонусы', '0'),
              _kv(context, 'Сертификаты', 'нет'),
              _kv(context, 'Абонементы', 'нет'),
              _kv(context, 'Персональная скидка', '—'),
            ]),
          ),
          const SizedBox(height: Spacing.s5),
          _Section(
            label: 'Заметки',
            child: _muted(
                context,
                (client.note?.isNotEmpty ?? false)
                    ? client.note!
                    : 'Нет заметок'),
          ),
          const SizedBox(height: Spacing.s5),
          _Section(
            label: 'Вложения',
            child: _muted(context, 'Нет вложений'),
          ),
        ],
      ),
    );
  }
}

// ---------------- Метрики ----------------

class _Metrics {
  _Metrics({
    required this.status,
    required this.firstVisit,
    required this.lastVisit,
    required this.nextVisit,
    required this.visits,
    required this.avgCheck,
    required this.ltv,
    required this.avgIntervalDays,
  });

  final String status;
  final DateTime? firstVisit;
  final DateTime? lastVisit;
  final DateTime? nextVisit;
  final int visits;
  final int avgCheck;
  final int ltv;
  final int? avgIntervalDays;

  static _Metrics from(Client client, List<Appointment> appts) {
    final now = DateTime.now();
    final past = [
      for (final a in appts)
        if (a.start.isBefore(now)) a
    ];
    final future = [
      for (final a in appts)
        if (!a.start.isBefore(now)) a
    ];
    final lastVisit = past.isNotEmpty ? past.first.start : null;
    final firstVisit = past.isNotEmpty ? past.last.start : null;
    final nextVisit = future.isNotEmpty ? future.last.start : null;

    final visits = client.visitsCount;
    final ltv = client.totalSpent;
    final avgCheck = visits > 0 ? ltv ~/ visits : 0;

    final dates = [for (final a in past) a.start]..sort();
    int? avgInterval;
    if (dates.length >= 2) {
      var total = 0;
      for (var i = 1; i < dates.length; i++) {
        total += dates[i].difference(dates[i - 1]).inDays;
      }
      avgInterval = (total / (dates.length - 1)).round();
    }

    String status;
    if (visits <= 1) {
      status = 'Новый';
    } else if (lastVisit != null && now.difference(lastVisit).inDays > 60) {
      status = 'Давно не был';
    } else {
      status = 'Постоянный';
    }

    return _Metrics(
      status: status,
      firstVisit: firstVisit,
      lastVisit: lastVisit,
      nextVisit: nextVisit,
      visits: visits,
      avgCheck: avgCheck,
      ltv: ltv,
      avgIntervalDays: avgInterval,
    );
  }
}

// ---------------- Верхняя часть ----------------

class _Header extends StatelessWidget {
  const _Header({required this.client, required this.status});

  final Client client;
  final String status;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Avatar(client.initials, size: 64),
            const SizedBox(width: Spacing.s4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(client.name, style: AppTypography.title2(nova.ink)),
                  const SizedBox(height: 2),
                  Text(client.phone, style: AppTypography.label(nova.ink2)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: Spacing.s3),
        Wrap(
          spacing: Spacing.s2,
          runSpacing: Spacing.s2,
          children: [
            _Chip(status, accent: true),
            for (final t in client.tags) _Chip(t),
          ],
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, {this.accent = false});
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
      decoration: BoxDecoration(
        color: accent ? nova.accentTint : nova.surface3,
        borderRadius: BorderRadius.circular(Radii.full),
      ),
      child: Text(label,
          style: AppTypography.label(accent ? nova.accent : nova.ink2)
              .copyWith(fontSize: 12)),
    );
  }
}

// ---------------- Быстрые действия ----------------

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.client});
  final Client client;

  Future<void> _launch(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  String get _digits => client.phone.replaceAll(RegExp('[^0-9+]'), '');

  @override
  Widget build(BuildContext context) {
    void soon() => ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Скоро')));

    final actions = <(IconData, String, VoidCallback)>[
      (Icons.call_outlined, 'Позвонить', () => _launch('tel:$_digits')),
      (Icons.chat_bubble_outline, 'Написать', () => _launch('sms:$_digits')),
      (
        Icons.forum_outlined,
        'WhatsApp',
        () => _launch('https://wa.me/$_digits')
      ),
      (
        Icons.event_outlined,
        'Запись',
        () => showCreateAppointmentSheet(context)
      ),
      (Icons.shopping_bag_outlined, 'Товар', soon),
      (Icons.card_giftcard_outlined, 'Сертификат', soon),
    ];

    return SizedBox(
      height: 76,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: actions.length,
        separatorBuilder: (_, __) => const SizedBox(width: Spacing.s3),
        itemBuilder: (context, i) {
          final (icon, label, onTap) = actions[i];
          return _ActionButton(icon: icon, label: label, onTap: onTap);
        },
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 68,
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: nova.surface,
                borderRadius: BorderRadius.circular(Radii.md),
                border: Border.all(color: nova.line),
              ),
              child: Icon(icon, size: 22, color: nova.accent),
            ),
            const SizedBox(height: 6),
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.caption(nova.ink2)
                    .copyWith(letterSpacing: 0)),
          ],
        ),
      ),
    );
  }
}

// ---------------- Ключевые показатели ----------------

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.metrics});
  final _Metrics metrics;

  static String _date(DateTime? d) =>
      d == null ? '—' : DateFormat('d MMM yyyy', 'ru').format(d);

  @override
  Widget build(BuildContext context) {
    final m = metrics;
    final items = <(String, String)>[
      ('Первый визит', _date(m.firstVisit)),
      ('Последний визит', _date(m.lastVisit)),
      ('Следующий визит', _date(m.nextVisit)),
      ('Визитов', '${m.visits}'),
      ('Средний чек', Fmt.money(m.avgCheck)),
      ('LTV', Fmt.money(m.ltv)),
      ('Интервал', m.avgIntervalDays == null ? '—' : '${m.avgIntervalDays} дн'),
    ];
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: Spacing.s2,
      crossAxisSpacing: Spacing.s2,
      childAspectRatio: 2.6,
      children: [for (final it in items) _StatCell(label: it.$1, value: it.$2)],
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      padding: const EdgeInsets.all(Spacing.s3),
      decoration: BoxDecoration(
        color: nova.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: nova.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label,
              style:
                  AppTypography.caption(nova.ink3).copyWith(letterSpacing: 0)),
          const SizedBox(height: 2),
          Text(value,
              style: AppTypography.tabular(AppTypography.title3(nova.ink))
                  .copyWith(fontSize: 15)),
        ],
      ),
    );
  }
}

// ---------------- AI (место под подсказки) ----------------

class _AiInsights extends StatelessWidget {
  const _AiInsights({required this.status, required this.avgIntervalDays});
  final String status;
  final int? avgIntervalDays;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final hints = <String>[
      if (status == 'Давно не был')
        'Клиент давно не посещал — предложите вернуться со скидкой',
      if (avgIntervalDays != null)
        'Обычно приходит раз в $avgIntervalDays дн — предложите записаться',
      if (status == 'Постоянный') 'Вероятность повторной записи высокая',
    ];
    if (hints.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(Spacing.s4),
      decoration: BoxDecoration(
        color: nova.accentTint,
        borderRadius: BorderRadius.circular(Radii.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome_outlined, size: 16, color: nova.accent),
              const SizedBox(width: 6),
              Text('AI · превью', style: AppTypography.caption(nova.accent)),
            ],
          ),
          const SizedBox(height: Spacing.s2),
          for (final h in hints)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(h, style: AppTypography.label(nova.ink)),
            ),
        ],
      ),
    );
  }
}

// ---------------- Секции / строки ----------------

class _Section extends StatelessWidget {
  const _Section({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: AppTypography.caption(nova.ink3)),
        const SizedBox(height: Spacing.s2),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(Spacing.s4),
          decoration: BoxDecoration(
            color: nova.surface,
            borderRadius: BorderRadius.circular(Radii.lg),
            border: Border.all(color: nova.line),
          ),
          child: child,
        ),
      ],
    );
  }
}

Widget _kv(BuildContext context, String k, String v) {
  final nova = context.nova;
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      children: [
        Expanded(child: Text(k, style: AppTypography.label(nova.ink2))),
        Text(v,
            style: AppTypography.tabular(AppTypography.label(nova.ink))
                .copyWith(fontWeight: FontWeight.w600)),
      ],
    ),
  );
}

Widget _muted(BuildContext context, String text) =>
    Text(text, style: AppTypography.body(context.nova.ink2));

class _TimelineTile extends StatelessWidget {
  const _TimelineTile(this.appointment);
  final Appointment appointment;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final a = appointment;
    return InkWell(
      onTap: () => showAppointmentSheet(context, a),
      borderRadius: BorderRadius.circular(Radii.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Spacing.s2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(Icons.circle, size: 8, color: nova.accent),
            ),
            const SizedBox(width: Spacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.service.name, style: AppTypography.label(nova.ink)),
                  const SizedBox(height: 1),
                  Text(DateFormat('d MMM yyyy, HH:mm', 'ru').format(a.start),
                      style: AppTypography.caption(nova.ink3)
                          .copyWith(letterSpacing: 0)),
                ],
              ),
            ),
            StatusPill(a.status),
          ],
        ),
      ),
    );
  }
}
