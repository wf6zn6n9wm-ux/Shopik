import '../../core/localization/app_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/localization/locale_controller.dart';
import '../../design/theme.dart';
import '../../ui/z.dart';

/// Налаштування. Перемикач мови (Українська / English / Русский), валюта та
/// часовий пояс бізнесу, розділи.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const _langs = [
    ('uk', 'Українська', '🇺🇦'),
    ('en', 'English', '🇬🇧'),
    ('ru', 'Русский', '🌐'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final locale = ref.watch(localeProvider);
    final current = locale?.languageCode ?? 'uk';

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TopBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
                children: [
                  Text(t('Налаштування'), style: AppTypography.title1(k.ink)),
                  const SizedBox(height: 20),
                  ZLabel(t('Мова')),
                  const SizedBox(height: 8),
                  ZCard(
                    padding: const EdgeInsets.all(4),
                    child: Column(
                      children: [
                        for (var i = 0; i < _langs.length; i++)
                          _LangRow(
                            emoji: _langs[i].$3,
                            label: _langs[i].$2,
                            selected: current == _langs[i].$1,
                            divider: i > 0,
                            onTap: () => ref
                                .read(localeProvider.notifier)
                                .state = Locale(_langs[i].$1),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  ZLabel(t('Бізнес')),
                  const SizedBox(height: 8),
                  ZCard(
                    padding: const EdgeInsets.all(4),
                    child: Column(
                      children: [
                        _InfoRow(
                            icon: Icons.payments_outlined,
                            title: t('Валюта'),
                            value: '₴ UAH'),
                        _InfoRow(
                            icon: Icons.schedule_outlined,
                            title: t('Часовий пояс'),
                            value: 'Europe/Kyiv',
                            divider: true),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  ZLabel(t('Розділи')),
                  const SizedBox(height: 8),
                  ZCard(
                    padding: const EdgeInsets.all(4),
                    child: Column(
                      children: [
                        _LinkRow(
                            icon: Icons.workspace_premium_outlined,
                            title: t('Підписка'),
                            onTap: () => context.push(Routes.subscription)),
                        _LinkRow(
                            icon: Icons.link_outlined,
                            title: t('Онлайн-запис'),
                            divider: true,
                            onTap: () => context.push(Routes.onlineBooking)),
                        _LinkRow(
                            icon: Icons.person_outline,
                            title: t('Профіль'),
                            divider: true,
                            onTap: () => context.push(Routes.profile)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).maybePop(),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                  color: k.surface2, borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.chevron_left, color: k.ink2),
            ),
          ),
        ],
      ),
    );
  }
}

class _LangRow extends StatelessWidget {
  const _LangRow(
      {required this.emoji,
      required this.label,
      required this.selected,
      required this.onTap,
      this.divider = false});
  final String emoji, label;
  final bool selected, divider;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          border: divider ? Border(top: BorderSide(color: k.line)) : null,
        ),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label,
                  style: AppTypography.body(k.ink)
                      .copyWith(fontSize: 15, fontWeight: FontWeight.w600)),
            ),
            if (selected)
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                    gradient: FX.brandButton, shape: BoxShape.circle),
                child: const Icon(Icons.check, size: 14, color: Colors.white),
              )
            else
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: k.line2, width: 1.5),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(
      {required this.icon,
      required this.title,
      required this.value,
      this.divider = false});
  final IconData icon;
  final String title, value;
  final bool divider;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        border: divider ? Border(top: BorderSide(color: k.line)) : null,
      ),
      child: Row(
        children: [
          Icon(icon, size: 19, color: k.ink2),
          const SizedBox(width: 12),
          Expanded(
            child: Text(title,
                style: AppTypography.body(k.ink).copyWith(fontSize: 15)),
          ),
          Text(value,
              style: AppTypography.tabular(AppTypography.label(k.ink2))
                  .copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow(
      {required this.icon,
      required this.title,
      required this.onTap,
      this.divider = false});
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final bool divider;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          border: divider ? Border(top: BorderSide(color: k.line)) : null,
        ),
        child: Row(
          children: [
            Icon(icon, size: 19, color: k.accent),
            const SizedBox(width: 12),
            Expanded(
              child: Text(title,
                  style: AppTypography.body(k.ink).copyWith(fontSize: 15)),
            ),
            Icon(Icons.chevron_right, size: 18, color: k.ink3),
          ],
        ),
      ),
    );
  }
}
