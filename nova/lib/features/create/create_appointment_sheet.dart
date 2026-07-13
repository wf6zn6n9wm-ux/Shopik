import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/client_row.dart';
import '../../ui/format.dart';
import '../../ui/nova_button.dart';

/// Быстрая запись — bottom sheet. Каркас: выбор клиента и услуги → «Записать».
/// (Умные слоты/предсказание услуги — AI-слой следующего этапа.)
Future<void> showCreateAppointmentSheet(BuildContext context) {
  final nova = context.nova;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: nova.surface,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl)),
    ),
    builder: (_) => const _CreateSheet(),
  );
}

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
    final nova = context.nova;
    final clients = ref.watch(clientsProvider).value ?? const <Client>[];
    final services = ref.watch(servicesProvider).value ?? const <Service>[];
    final ready = _client != null && _service != null;

    return Padding(
      padding: EdgeInsets.only(
        left: Spacing.s5,
        right: Spacing.s5,
        bottom: MediaQuery.of(context).viewInsets.bottom + Spacing.s6,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Новая запись', style: AppTypography.title2(nova.ink)),
            const SizedBox(height: Spacing.s4),
            Text('КЛИЕНТ', style: AppTypography.caption(nova.ink3)),
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
            Text('УСЛУГА', style: AppTypography.caption(nova.ink3)),
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
              child: NovaButton(
                'Записать',
                icon: Icons.check,
                onPressed: ready ? () => _create(context) : null,
              ),
            ),
          ],
        ),
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

    await ref.read(appointmentsRepositoryProvider).add(
          Appointment(
            id: 'a${DateTime.now().microsecondsSinceEpoch}',
            client: _client!,
            service: _service!,
            start: start,
            status: AppointmentStatus.confirmed,
          ),
        );

    navigator.pop();
    messenger.showSnackBar(
      SnackBar(content: Text('Записан ${_client!.name} · ${Fmt.time(start)}')),
    );
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
    final nova = context.nova;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(
              color: selected ? nova.accent : Colors.transparent, width: 1.5),
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
    final nova = context.nova;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? nova.accent : nova.surface3,
          borderRadius: BorderRadius.circular(Radii.full),
        ),
        child: Text(
          '${service.name} · ${service.durationMinutes}′',
          style: AppTypography.label(selected ? nova.onAccent : nova.ink2)
              .copyWith(fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}
