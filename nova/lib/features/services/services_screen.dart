import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/empty_state.dart';
import '../../ui/error_view.dart';
import '../../ui/format.dart';
import '../../ui/kavio_list_tile.dart';
import '../../ui/kavio_page_scaffold.dart';
import '../../ui/skeleton.dart';
import 'create_service_sheet.dart';

/// Услуги и цены. Читает каталог реактивно; редактирование — этап функционала.
class ServicesScreen extends ConsumerWidget {
  const ServicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kavio = context.kavio;
    final servicesAsync = ref.watch(servicesProvider);

    return KavioPageScaffold(
      title: 'Услуги',
      actions: [
        IconButton(
          onPressed: () => showCreateServiceSheet(context),
          icon: Icon(Icons.add, color: kavio.accent),
          splashRadius: 22,
        ),
      ],
      body: servicesAsync.when(
        loading: () => const SkeletonList(),
        error: (e, _) =>
            ErrorView(onRetry: () => ref.invalidate(servicesProvider)),
        data: (services) => services.isEmpty
            ? EmptyState(
                icon: Icons.design_services_outlined,
                title: 'Пока нет услуг',
                message: 'Добавьте первую услугу — она появится при записи.',
                actionLabel: 'Новая услуга',
                onAction: () => showCreateServiceSheet(context),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(
                    Spacing.s5, Spacing.s2, Spacing.s5, Spacing.s16),
                itemCount: services.length,
                separatorBuilder: (_, __) => const SizedBox(height: Spacing.s2),
                itemBuilder: (context, i) {
                  final s = services[i];
                  return DecoratedBox(
                    decoration: BoxDecoration(
                      color: kavio.surface,
                      borderRadius: BorderRadius.circular(Radii.md),
                      border: Border.all(color: kavio.line),
                    ),
                    child: KavioListTile(
                      title: s.name,
                      subtitle: Fmt.duration(s.durationMinutes),
                      trailing: Text(
                        Fmt.money(s.price),
                        style: AppTypography.tabular(
                                AppTypography.label(kavio.ink))
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
