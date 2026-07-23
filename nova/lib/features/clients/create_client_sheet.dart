import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_text.dart';
import '../../core/services/analytics/analytics_events.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/kavio_button.dart';
import '../../ui/kavio_sheet.dart';
import '../../ui/kavio_text_field.dart';

/// Создание клиента. Сохраняется в Drift (offline-first) → список обновляется
/// реактивно. Событие уходит в аналитику.
Future<void> showCreateClientSheet(BuildContext context) =>
    showKavioSheet<void>(context, builder: (_) => const _CreateClientSheet());

class _CreateClientSheet extends ConsumerStatefulWidget {
  const _CreateClientSheet();

  @override
  ConsumerState<_CreateClientSheet> createState() => _CreateClientSheetState();
}

class _CreateClientSheetState extends ConsumerState<_CreateClientSheet> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  bool get _valid => _name.text.trim().isNotEmpty;

  Future<void> _save() async {
    if (!_valid || _saving) return;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    final client = Client(
      id: 'c${DateTime.now().microsecondsSinceEpoch}',
      name: _name.text.trim(),
      phone: _phone.text.trim(),
    );
    await ref.read(clientsRepositoryProvider).add(client);
    await ref
        .read(analyticsServiceProvider)
        .track(AnalyticsEvent.clientCreated);

    navigator.pop();
    messenger.showSnackBar(
      SnackBar(content: Text(tp('Клієнта {name} додано', {'name': client.name}))),
    );
  }

  @override
  Widget build(BuildContext context) {
    return KavioSheet(
      title: t('Новий клієнт'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          KavioTextField(
            label: t("Ім'я"),
            hint: t('Як звати клієнта'),
            controller: _name,
            autofocus: true,
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.s4),
          KavioTextField(
            label: t('Телефон'),
            hint: '+1 555 123 4567',
            controller: _phone,
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: Spacing.s6),
          KavioButton(
            t('Зберегти'),
            expand: true,
            onPressed: _valid && !_saving ? _save : null,
          ),
        ],
      ),
    );
  }
}
