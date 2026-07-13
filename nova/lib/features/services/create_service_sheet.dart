import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/services/analytics/analytics_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/nova_button.dart';
import '../../ui/nova_sheet.dart';
import '../../ui/nova_text_field.dart';

/// Создание услуги. Цена вводится в основных единицах и хранится в минорных
/// (×100). Сохраняется в Drift → каталог обновляется реактивно.
Future<void> showCreateServiceSheet(BuildContext context) =>
    showNovaSheet<void>(context, builder: (_) => const _CreateServiceSheet());

class _CreateServiceSheet extends ConsumerStatefulWidget {
  const _CreateServiceSheet();

  @override
  ConsumerState<_CreateServiceSheet> createState() =>
      _CreateServiceSheetState();
}

class _CreateServiceSheetState extends ConsumerState<_CreateServiceSheet> {
  final _name = TextEditingController();
  final _duration = TextEditingController(text: '60');
  final _price = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _duration.dispose();
    _price.dispose();
    super.dispose();
  }

  bool get _valid => _name.text.trim().isNotEmpty;

  Future<void> _save() async {
    if (!_valid || _saving) return;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    final service = Service(
      id: 's${DateTime.now().microsecondsSinceEpoch}',
      name: _name.text.trim(),
      durationMinutes: int.tryParse(_duration.text.trim()) ?? 60,
      price: ((double.tryParse(_price.text.trim()) ?? 0) * 100).round(),
    );
    await ref.read(servicesRepositoryProvider).add(service);
    await ref.read(analyticsServiceProvider).logEvent('service_created');

    navigator.pop();
    messenger.showSnackBar(
      SnackBar(content: Text('Услуга «${service.name}» добавлена')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return NovaSheet(
      title: 'Новая услуга',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NovaTextField(
            label: 'Название',
            hint: 'Напр. Стрижка + укладка',
            controller: _name,
            autofocus: true,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Spacing.s4),
          Row(
            children: [
              Expanded(
                child: NovaTextField(
                  label: 'Длительность, мин',
                  hint: '60',
                  controller: _duration,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
              ),
              const SizedBox(width: Spacing.s3),
              Expanded(
                child: NovaTextField(
                  label: 'Цена',
                  hint: '0',
                  controller: _price,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.s6),
          NovaButton(
            'Сохранить',
            expand: true,
            onPressed: _valid && !_saving ? _save : null,
          ),
        ],
      ),
    );
  }
}
