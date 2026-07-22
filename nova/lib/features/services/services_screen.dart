import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../domain/models.dart';
import '../../ui/format.dart';
import '../../ui/z.dart';
import '../calendar/calendar_screen.dart' show apptColor;
import 'create_service_sheet.dart';

/// Послуги: категорії, пошук, кольорові мітки, швидкі дії. Каталог реактивно з БД.
class ServicesScreen extends ConsumerWidget {
  const ServicesScreen({super.key});

  static String _cat(String id) =>
      (id.contains('spa') || id.contains('exp') || id.contains('ped'))
          ? 'Педикюр'
          : 'Манікюр';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final services = ref.watch(servicesProvider).value ?? const <Service>[];

    final groups = <String, List<Service>>{};
    for (final s in services) {
      groups.putIfAbsent(_cat(s.id), () => []).add(s);
    }
    final order = ['Манікюр', 'Педикюр'];
    final cats = [
      ...order.where(groups.containsKey),
      ...groups.keys.where((c) => !order.contains(c)),
    ];

    var idx = 0;
    Widget reveal(Widget c) => StaggerReveal(index: idx++, child: c);

    return Container(
      color: k.canvas,
      child: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
          children: [
            reveal(Row(
              children: [
                Expanded(
                    child: Text('Послуги', style: AppTypography.title1(k.ink))),
                GestureDetector(
                  onTap: () => showCreateServiceSheet(context),
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
            )),
            const SizedBox(height: 14),
            reveal(const _SearchBar()),
            const SizedBox(height: 16),
            for (final cat in cats) ...[
              reveal(Padding(
                padding: const EdgeInsets.only(left: 2, bottom: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    ZLabel(cat),
                    Text('${groups[cat]!.length} послуги',
                        style:
                            AppTypography.label(k.ink3).copyWith(fontSize: 12)),
                  ],
                ),
              )),
              reveal(_CategoryCard(items: groups[cat]!)),
              const SizedBox(height: 16),
            ],
          ],
        ),
      ),
    );
  }
}

class _SearchBar extends StatelessWidget {
  const _SearchBar();
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZGlass(
      radius: 14,
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      child: Row(
        children: [
          Icon(Icons.search, size: 18, color: k.ink3),
          const SizedBox(width: 10),
          Text('Пошук послуги',
              style: AppTypography.body(k.ink3).copyWith(fontSize: 14)),
        ],
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.items});
  final List<Service> items;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZCard(
      padding: const EdgeInsets.all(4),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(
                border: i == 0 ? null : Border(top: BorderSide(color: k.line)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                        color: apptColor(items[i].id),
                        borderRadius: BorderRadius.circular(4)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(items[i].name,
                            style: AppTypography.label(k.ink).copyWith(
                                fontSize: 14, fontWeight: FontWeight.w600)),
                        Text(Fmt.duration(items[i].durationMinutes),
                            style: AppTypography.label(k.ink3)
                                .copyWith(fontSize: 12)),
                      ],
                    ),
                  ),
                  Text(Fmt.money(items[i].price),
                      style: AppTypography.tabular(AppTypography.label(k.ink))
                          .copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 10),
                  Icon(Icons.more_horiz, size: 18, color: k.ink3),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
