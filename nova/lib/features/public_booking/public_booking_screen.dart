import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/boot_uri.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';
import '../calendar/calendar_screen.dart' show apptColor;

/// Публічна сторінка онлайн-запису (сторона клієнта). Гість обирає послугу →
/// день і час → вводить контакти → підтверджує. Запис реально створюється й
/// з'являється в календарі бізнесу. Без нав-бару — окрема поверхня.
class PublicBookingScreen extends ConsumerStatefulWidget {
  const PublicBookingScreen({super.key});
  @override
  ConsumerState<PublicBookingScreen> createState() => _State();
}

class _State extends ConsumerState<PublicBookingScreen> {
  int _step = 0; // 0 послуга · 1 час · 2 контакти · 3 готово
  Service? _service;
  DateTime? _day;
  DateTime? _slot;
  final _name = TextEditingController();
  final _phone = TextEditingController();

  @override
  void initState() {
    super.initState();
    _day = _dateOnly(DateTime.now());
    // Для знімків: ?step=time|confirm|done з передвибором.
    final f = bootFragment;
    if (f.contains('step=')) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _preset(f));
    }
  }

  void _preset(String f) {
    final services = ref.read(servicesProvider).value ?? const <Service>[];
    if (services.isEmpty) {
      Future.delayed(
          const Duration(milliseconds: 300), () => mounted ? _preset(f) : null);
      return;
    }
    setState(() {
      _service = services.firstWhere((s) => s.id == 'sv_gel',
          orElse: () => services.first);
      _slot = _day!.add(const Duration(hours: 11));
      _name.text = 'Оксана Петренко';
      _phone.text = '+380 67 123 45 67';
      if (f.contains('step=time')) _step = 1;
      if (f.contains('step=confirm')) _step = 2;
      if (f.contains('step=done')) _step = 3;
    });
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    HapticFeedback.mediumImpact();
    final svc = _service!, slot = _slot!;
    final id = 'g${slot.microsecondsSinceEpoch}';
    final client = Client(
        id: 'gc_$id',
        name: _name.text.trim().isEmpty ? 'Гість' : _name.text.trim(),
        phone: _phone.text.trim());
    try {
      await ref.read(clientsRepositoryProvider).add(client);
    } catch (_) {}
    await ref.read(appointmentsRepositoryProvider).add(Appointment(
          id: id,
          client: client,
          service: svc,
          start: slot,
          status: AppointmentStatus.online,
        ));
    if (mounted) setState(() => _step = 3);
  }

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 320),
          switchInCurve: const Cubic(0.16, 0.9, 0.3, 1),
          transitionBuilder: (child, anim) => FadeTransition(
            opacity: anim,
            child: SlideTransition(
              position: Tween(begin: const Offset(0.04, 0), end: Offset.zero)
                  .animate(anim),
              child: child,
            ),
          ),
          child: KeyedSubtree(
            key: ValueKey(_step),
            child: switch (_step) {
              0 => _servicesStep(k),
              1 => _timeStep(k),
              2 => _confirmStep(k),
              _ => _doneStep(k),
            },
          ),
        ),
      ),
    );
  }

  // ── Крок 0: послуги ───────────────────────────────────────────
  Widget _servicesStep(KavioColors k) {
    final services = ref.watch(servicesProvider).value ?? const <Service>[];
    final groups = <String, List<Service>>{};
    for (final s in services) {
      final cat = (s.id.contains('spa') || s.id.contains('exp'))
          ? 'Педикюр'
          : 'Манікюр';
      groups.putIfAbsent(cat, () => []).add(s);
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
      children: [
        _bizHeader(k),
        const SizedBox(height: 20),
        const ZLabel('Оберіть послугу'),
        const SizedBox(height: 10),
        for (final cat in groups.keys) ...[
          Padding(
            padding: const EdgeInsets.only(left: 2, top: 8, bottom: 8),
            child: Text(cat,
                style: AppTypography.label(k.ink2)
                    .copyWith(fontSize: 13, fontWeight: FontWeight.w700)),
          ),
          ZCard(
            padding: const EdgeInsets.all(4),
            child: Column(
              children: [
                for (var i = 0; i < groups[cat]!.length; i++)
                  _serviceRow(k, groups[cat]![i], i > 0),
              ],
            ),
          ),
          const SizedBox(height: 6),
        ],
      ],
    );
  }

  Widget _serviceRow(KavioColors k, Service s, bool divider) => GestureDetector(
        onTap: () {
          zTap();
          setState(() {
            _service = s;
            _step = 1;
          });
        },
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
          decoration: BoxDecoration(
            border: divider ? Border(top: BorderSide(color: k.line)) : null,
          ),
          child: Row(
            children: [
              Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                      color: apptColor(s.id),
                      borderRadius: BorderRadius.circular(4))),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.name,
                        style: AppTypography.label(k.ink).copyWith(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                    Text(Fmt.duration(s.durationMinutes),
                        style:
                            AppTypography.label(k.ink3).copyWith(fontSize: 12)),
                  ],
                ),
              ),
              Text(Fmt.money(s.price),
                  style: AppTypography.tabular(AppTypography.label(k.ink))
                      .copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, size: 18, color: k.ink3),
            ],
          ),
        ),
      );

  // ── Крок 1: час ───────────────────────────────────────────────
  Widget _timeStep(KavioColors k) {
    final day = _day!;
    final dayAppts = ref
            .watch(rangeAppointmentsProvider(
                (start: day, end: day.add(const Duration(days: 1)))))
            .value ??
        const <Appointment>[];
    final dur = _service!.durationMinutes;
    final slots = <DateTime>[];
    for (var h = 10; h <= 18; h++) {
      for (final m in const [0, 30]) {
        final start = DateTime(day.year, day.month, day.day, h, m);
        final end = start.add(Duration(minutes: dur));
        if (end.hour > 19) continue;
        final busy =
            dayAppts.any((a) => start.isBefore(a.end) && end.isAfter(a.start));
        slots.add(start);
        if (busy) slots.removeLast();
      }
    }
    return Column(
      children: [
        _topBar(k, 'Оберіть час', () => setState(() => _step = 0)),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
            children: [
              SizedBox(
                height: 74,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: 10,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final d = _dateOnly(DateTime.now()).add(Duration(days: i));
                    final on = d == _day;
                    return GestureDetector(
                      onTap: () {
                        zTap();
                        setState(() => _day = d);
                      },
                      child: Container(
                        width: 56,
                        decoration: BoxDecoration(
                          color: on ? null : k.surface,
                          gradient: on ? FX.brandButton : null,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                              color: on ? Colors.transparent : k.line),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(Fmt.weekday(d).substring(0, 2),
                                style: AppTypography.label(
                                        on ? Colors.white70 : k.ink3)
                                    .copyWith(fontSize: 11)),
                            const SizedBox(height: 2),
                            Text('${d.day}',
                                style: AppTypography.tabular(
                                        AppTypography.title3(
                                            on ? Colors.white : k.ink))
                                    .copyWith(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
              const ZLabel('Вільний час'),
              const SizedBox(height: 10),
              Wrap(
                spacing: 9,
                runSpacing: 9,
                children: [
                  for (final s in slots)
                    GestureDetector(
                      onTap: () {
                        zTap();
                        setState(() {
                          _slot = s;
                          _step = 2;
                        });
                      },
                      child: Container(
                        width: 80,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: k.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: k.line),
                        ),
                        child: Text(Fmt.time(s),
                            style: AppTypography.tabular(
                                    AppTypography.label(k.ink))
                                .copyWith(
                                    fontSize: 14, fontWeight: FontWeight.w700)),
                      ),
                    ),
                ],
              ),
              if (slots.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 30),
                  child: Center(
                    child: Text('На цей день вільних вікон немає',
                        style:
                            AppTypography.body(k.ink3).copyWith(fontSize: 14)),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Крок 2: контакти + підтвердження ─────────────────────────
  Widget _confirmStep(KavioColors k) {
    final svc = _service!, slot = _slot!;
    return Column(
      children: [
        _topBar(k, 'Ваші дані', () => setState(() => _step = 1)),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
            children: [
              ZCard(
                child: Column(
                  children: [
                    _summaryRow(k, Icons.design_services_outlined, svc.name,
                        Fmt.money(svc.price)),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Divider(height: 1, color: k.line),
                    ),
                    _summaryRow(
                        k,
                        Icons.calendar_today_outlined,
                        '${Fmt.weekday(slot)}, ${Fmt.dayMonth(slot)}',
                        Fmt.time(slot)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const ZLabel('Контакти'),
              const SizedBox(height: 8),
              _field(k, _name, "Ваше ім'я", Icons.person_outline),
              const SizedBox(height: 10),
              _field(k, _phone, 'Телефон', Icons.phone_outlined, phone: true),
              const SizedBox(height: 22),
              ZButton(label: 'Підтвердити запис', onTap: _confirm),
              const SizedBox(height: 10),
              Center(
                child: Text('Натискаючи, ви погоджуєтесь на нагадування',
                    style: AppTypography.label(k.ink3).copyWith(fontSize: 11)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Крок 3: готово ────────────────────────────────────────────
  Widget _doneStep(KavioColors k) {
    final svc = _service, slot = _slot;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                gradient: FX.brandButton,
                shape: BoxShape.circle,
                boxShadow: const [
                  BoxShadow(
                      color: Color(0xBF8B8BF0),
                      blurRadius: 40,
                      spreadRadius: -6,
                      offset: Offset(0, 16))
                ],
              ),
              child: const Icon(Icons.check, color: Colors.white, size: 42),
            ),
            const SizedBox(height: 20),
            Text('Вас записано!',
                style: AppTypography.title1(k.ink),
                textAlign: TextAlign.center),
            const SizedBox(height: 10),
            if (svc != null && slot != null)
              Text(
                  '${svc.name} · ${Fmt.weekday(slot)}, ${Fmt.dayMonth(slot)} о ${Fmt.time(slot)}',
                  textAlign: TextAlign.center,
                  style: AppTypography.body(k.ink2).copyWith(fontSize: 14)),
            const SizedBox(height: 8),
            Text('Ми надішлемо нагадування перед візитом',
                textAlign: TextAlign.center,
                style: AppTypography.label(k.ink3).copyWith(fontSize: 13)),
            const SizedBox(height: 26),
            SizedBox(
              width: 220,
              child: ZButtonSecondary(
                  label: 'Готово',
                  expand: true,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
            ),
          ],
        ),
      ),
    );
  }

  // ── дрібні блоки ──────────────────────────────────────────────
  Widget _bizHeader(KavioColors k) => ZHero(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            const ZAvatar(initials: 'СС', size: 54),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Манікюрна студія',
                      style:
                          AppTypography.title2(k.ink).copyWith(fontSize: 19)),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(Icons.location_on_outlined, size: 14, color: k.ink3),
                      const SizedBox(width: 3),
                      Text('Київ, центр · 4.9 ★',
                          style: AppTypography.label(k.ink2)
                              .copyWith(fontSize: 12.5)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _topBar(KavioColors k, String title, VoidCallback back) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 20, 8),
        child: Row(
          children: [
            GestureDetector(
              onTap: () {
                zTap();
                back();
              },
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                    color: k.surface2, borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.chevron_left, color: k.ink2),
              ),
            ),
            const SizedBox(width: 12),
            Text(title, style: AppTypography.title2(k.ink)),
          ],
        ),
      );

  Widget _summaryRow(
          KavioColors k, IconData icon, String title, String trail) =>
      Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
                color: k.accentTint, borderRadius: BorderRadius.circular(11)),
            child: Icon(icon, size: 17, color: k.accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(title,
                style: AppTypography.label(k.ink)
                    .copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
          Text(trail,
              style: AppTypography.tabular(AppTypography.label(k.ink))
                  .copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
        ],
      );

  Widget _field(
          KavioColors k, TextEditingController c, String hint, IconData icon,
          {bool phone = false}) =>
      Container(
        decoration: BoxDecoration(
            color: k.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: k.line)),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
          children: [
            Icon(icon, size: 18, color: k.ink3),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: c,
                keyboardType: phone ? TextInputType.phone : TextInputType.name,
                style: AppTypography.body(k.ink).copyWith(fontSize: 15),
                cursorColor: k.accent,
                decoration: InputDecoration(
                  isDense: true,
                  border: InputBorder.none,
                  hintText: hint,
                  hintStyle: AppTypography.body(k.ink3).copyWith(fontSize: 15),
                  contentPadding: const EdgeInsets.symmetric(vertical: 15),
                ),
              ),
            ),
          ],
        ),
      );
}
