import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/client_row.dart';
import '../../ui/empty_state.dart';
import '../../ui/error_view.dart';
import '../../ui/skeleton.dart';

class ClientsScreen extends ConsumerStatefulWidget {
  const ClientsScreen({super.key});

  @override
  ConsumerState<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends ConsumerState<ClientsScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final clientsAsync = ref.watch(clientsProvider);

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Клиенты', style: AppTypography.title1(nova.ink)),
                const SizedBox(height: Spacing.s3),
                _SearchField(onChanged: (v) => setState(() => _query = v)),
              ],
            ),
          ),
          Expanded(
            child: clientsAsync.when(
              loading: () => const SkeletonList(),
              error: (e, _) => ErrorView(onRetry: () => ref.invalidate(clientsProvider)),
              data: (all) {
                final clients = _query.isEmpty
                    ? all
                    : all
                        .where((c) =>
                            c.name.toLowerCase().contains(_query.toLowerCase()) || c.phone.contains(_query))
                        .toList();
                if (clients.isEmpty) {
                  return const EmptyState(
                    icon: Icons.person_add_alt,
                    title: 'Здесь появятся ваши клиенты',
                    message: 'Они добавляются сами при первой записи. Можно начать с импорта контактов.',
                    actionLabel: 'Импортировать контакты',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(Spacing.s5, 0, Spacing.s5, Spacing.s16),
                  itemCount: clients.length,
                  separatorBuilder: (_, __) => const SizedBox(height: Spacing.s2),
                  itemBuilder: (context, i) => ClientRow(clients[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.onChanged});
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      decoration: BoxDecoration(color: nova.surface3, borderRadius: BorderRadius.circular(Radii.full)),
      padding: const EdgeInsets.symmetric(horizontal: Spacing.s4),
      child: Row(
        children: [
          Icon(Icons.search, size: 18, color: nova.ink3),
          const SizedBox(width: 9),
          Expanded(
            child: TextField(
              onChanged: onChanged,
              style: AppTypography.body(nova.ink),
              cursorColor: nova.accent,
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                hintText: 'Поиск по клиентам',
                hintStyle: AppTypography.body(nova.ink3),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
