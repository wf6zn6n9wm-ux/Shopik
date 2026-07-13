import 'package:flutter/material.dart';

import '../design/theme.dart';
import '../domain/models.dart';
import 'format.dart';

class Avatar extends StatelessWidget {
  const Avatar(this.initials, {super.key, this.size = 40});
  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: nova.accentTint, shape: BoxShape.circle),
      child: Text(initials,
          style: AppTypography.label(nova.accent)
              .copyWith(fontWeight: FontWeight.w600, fontSize: size * 0.35)),
    );
  }
}

/// Строка клиента: аватар + имя/подзаголовок + правая величина.
class ClientRow extends StatelessWidget {
  const ClientRow(this.client, {super.key, this.onTap});

  final Client client;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: nova.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(color: nova.line),
        ),
        child: Row(
          children: [
            Avatar(client.initials),
            const SizedBox(width: Spacing.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(client.name,
                      style: AppTypography.title3(nova.ink)
                          .copyWith(fontSize: 14)),
                  const SizedBox(height: 1),
                  Text(
                    '${client.visitsCount} визитов · ${client.phone}',
                    style:
                        AppTypography.label(nova.ink2).copyWith(fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: Spacing.s2),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(Fmt.money(client.totalSpent),
                    style: AppTypography.tabular(AppTypography.label(nova.ink))
                        .copyWith(fontWeight: FontWeight.w600, fontSize: 14)),
                Text('всего',
                    style: AppTypography.caption(nova.ink3)
                        .copyWith(letterSpacing: 0, fontSize: 11)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
