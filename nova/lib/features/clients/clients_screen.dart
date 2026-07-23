import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';
import 'create_client_sheet.dart';

/// Клієнти — список з пошуком, «дорогі» рядки, тап → картка.
class ClientsScreen extends ConsumerStatefulWidget {
  const ClientsScreen({super.key});
  @override
  ConsumerState<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends ConsumerState<ClientsScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final all = ref.watch(clientsProvider).value ?? const <Client>[];
    final clients = _query.isEmpty
        ? all
        : all
            .where((c) =>
                c.name.toLowerCase().contains(_query.toLowerCase()) ||
                c.phone.contains(_query))
            .toList();

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 20, 4),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.of(context).maybePop(),
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                          color: k.surface2,
                          borderRadius: BorderRadius.circular(12)),
                      child: Icon(Icons.chevron_left, color: k.ink2),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                      child:
                          Text('Клієнти', style: AppTypography.title1(k.ink))),
                  GestureDetector(
                    onTap: () => showCreateClientSheet(context),
                    child: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                          color: k.surface2,
                          borderRadius: BorderRadius.circular(11)),
                      child: Icon(Icons.add, color: k.accent, size: 20),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              child: ZGlass(
                radius: 14,
                padding:
                    const EdgeInsets.symmetric(horizontal: 13, vertical: 4),
                child: Row(
                  children: [
                    Icon(Icons.search, size: 18, color: k.ink3),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        onChanged: (v) => setState(() => _query = v),
                        style: AppTypography.body(k.ink).copyWith(fontSize: 14),
                        cursorColor: k.accent,
                        decoration: InputDecoration(
                          isDense: true,
                          border: InputBorder.none,
                          hintText: 'Пошук клієнта',
                          hintStyle:
                              AppTypography.body(k.ink3).copyWith(fontSize: 14),
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 11),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: clients.isEmpty
                  ? _empty(k)
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
                      itemCount: clients.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, i) => StaggerReveal(
                        index: i,
                        child: _ClientTile(
                          client: clients[i],
                          onTap: () => context
                              .push(Routes.clientDetailPath(clients[i].id)),
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _empty(KavioColors k) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: k.surface,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: k.line),
              ),
              child: Icon(Icons.person_add_alt_1_outlined,
                  size: 34, color: k.success),
            ),
            const SizedBox(height: 16),
            Text("Тут з'являться клієнти", style: AppTypography.title2(k.ink)),
            const SizedBox(height: 8),
            SizedBox(
              width: 250,
              child: Text(
                'Вони додаються самі при першому записі. Або імпортуйте контакти — це швидко.',
                textAlign: TextAlign.center,
                style: AppTypography.body(k.ink2).copyWith(fontSize: 14),
              ),
            ),
            const SizedBox(height: 20),
            ZButton(
                label: 'Додати вручну',
                expand: false,
                onTap: () => showCreateClientSheet(context)),
          ],
        ),
      );
}

class _ClientTile extends StatelessWidget {
  const _ClientTile({required this.client, required this.onTap});
  final Client client;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: ZCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Hero(
              tag: 'client-${client.id}',
              child: ZAvatar(initials: client.initials, size: 44),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(client.name,
                      style:
                          AppTypography.title3(k.ink).copyWith(fontSize: 15)),
                  const SizedBox(height: 1),
                  Text('${client.visitsCount} візитів · ${client.phone}',
                      style:
                          AppTypography.label(k.ink3).copyWith(fontSize: 12)),
                ],
              ),
            ),
            Text(Fmt.money(client.totalSpent),
                style: AppTypography.tabular(AppTypography.title3(k.ink))
                    .copyWith(fontSize: 14, fontWeight: FontWeight.w800)),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, size: 18, color: k.ink3),
          ],
        ),
      ),
    );
  }
}
