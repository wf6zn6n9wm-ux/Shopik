import 'package:flutter/material.dart';

import '../../design/theme.dart';

/// «Меню» — редкие, но важные разделы. В каркасе — навигационные строки.
class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  static const _items = <(IconData, String)>[
    (Icons.cut_outlined, 'Услуги и цены'),
    (Icons.people_alt_outlined, 'Сотрудники'),
    (Icons.point_of_sale_outlined, 'Касса и финансы'),
    (Icons.inventory_2_outlined, 'Склад'),
    (Icons.link_outlined, 'Онлайн-запись'),
    (Icons.campaign_outlined, 'Маркетинг'),
    (Icons.card_giftcard_outlined, 'Лояльность'),
    (Icons.star_outline, 'Отзывы'),
    (Icons.settings_outlined, 'Настройки'),
  ];

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            Spacing.s5, Spacing.s4, Spacing.s5, Spacing.s16),
        children: [
          Text('Меню', style: AppTypography.title1(nova.ink)),
          const SizedBox(height: Spacing.s5),
          Container(
            decoration: BoxDecoration(
              color: nova.surface,
              borderRadius: BorderRadius.circular(Radii.lg),
              border: Border.all(color: nova.line),
            ),
            child: Column(
              children: [
                for (var i = 0; i < _items.length; i++) ...[
                  if (i > 0)
                    Divider(
                        height: 1, thickness: 1, color: nova.line, indent: 52),
                  _MenuRow(icon: _items[i].$1, label: _items[i].$2),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return InkWell(
      onTap: () {},
      borderRadius: BorderRadius.circular(Radii.lg),
      child: Padding(
        padding:
            const EdgeInsets.symmetric(horizontal: Spacing.s4, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: nova.ink2),
            const SizedBox(width: Spacing.s3),
            Expanded(child: Text(label, style: AppTypography.body(nova.ink))),
            Icon(Icons.chevron_right, size: 20, color: nova.ink3),
          ],
        ),
      ),
    );
  }
}
