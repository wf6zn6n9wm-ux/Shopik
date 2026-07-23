import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_text.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/z.dart';

/// Фішка «Розумні вікна»: застосунок сам ранжує, кого з клієнтів запросити у
/// вільний час, з готовим текстом і ймовірністю приходу.
class SmartGapsScreen extends ConsumerWidget {
  const SmartGapsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final k = context.kavio;
    final windows = ref.watch(dashboardProvider).freeWindows;
    final freeMin = windows.length * 45;
    var idx = 0;
    Widget reveal(Widget c) => StaggerReveal(index: idx++, child: c);

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _TopBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 120),
                children: [
                  reveal(Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                            color: k.accentTint,
                            borderRadius: BorderRadius.circular(11)),
                        child:
                            Icon(Icons.auto_awesome, size: 17, color: k.accent),
                      ),
                      const SizedBox(width: 10),
                      Text(t('Розумні вікна'),
                          style: AppTypography.title1(k.ink)),
                    ],
                  )),
                  const SizedBox(height: 10),
                  reveal(Text.rich(TextSpan(
                    style: AppTypography.body(k.ink3).copyWith(fontSize: 13),
                    children: [
                      TextSpan(
                          text: tp('Сьогодні {n} вільні вікна на ',
                              {'n': windows.length})),
                      TextSpan(
                          text: tp('{n} хв', {'n': freeMin}),
                          style: TextStyle(
                              color: k.ink2, fontWeight: FontWeight.w700)),
                      TextSpan(text: t('. Ось хто найімовірніше прийде.')),
                    ],
                  ))),
                  const SizedBox(height: 16),
                  reveal(_TopCandidateHero()),
                  const SizedBox(height: 16),
                  reveal(ZLabel(t('Ще кандидати'))),
                  const SizedBox(height: 8),
                  reveal(_Candidates()),
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
      child: Row(children: [
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
      ]),
    );
  }
}

class _TopCandidateHero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ZHero(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ZLabel('${t('Вікно')} · 15:30–16:15', color: k.accent),
          const SizedBox(height: 12),
          Row(
            children: [
              const ZAvatar(initials: 'МТ', size: 44),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Марія Ткаченко',
                        style: AppTypography.title3(k.ink).copyWith(
                            fontSize: 15, fontWeight: FontWeight.w800)),
                    Text(t('Манікюр кожні 3 тижні · не була 24 дні'),
                        style:
                            AppTypography.label(k.ink2).copyWith(fontSize: 12)),
                  ],
                ),
              ),
              Column(
                children: [
                  Text('92%',
                      style:
                          AppTypography.tabular(AppTypography.title3(k.success))
                              .copyWith(
                                  fontSize: 16, fontWeight: FontWeight.w800)),
                  Text(t('прийде'),
                      style: AppTypography.label(k.ink3).copyWith(fontSize: 9)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          ZGlass(
            radius: 14,
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
            child: Text(
              t('«Маріє, вітаю! 🌸 Є віконце сьогодні о 15:30 на манікюр. Записати?»'),
              style: AppTypography.body(k.ink2)
                  .copyWith(fontSize: 12.5, height: 1.45),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                  child: ZButton(
                      label: t('Надіслати'),
                      padding: const EdgeInsets.symmetric(vertical: 12))),
              const SizedBox(width: 9),
              Container(
                width: 50,
                height: 46,
                decoration: FX.buttonSecondary(k),
                child: Icon(Icons.edit_outlined, size: 18, color: k.ink2),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Candidates extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final rows = [
      ('АБ', 'Андрій Б.', t('Стрижка · 31 день'), '88%'),
      ('ОК', 'Олена К.', t('Гель-лак · 19 днів'), '74%'),
    ];
    return ZCard(
      padding: const EdgeInsets.all(4),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
              decoration: BoxDecoration(
                border: i == 0 ? null : Border(top: BorderSide(color: k.line)),
              ),
              child: Row(
                children: [
                  ZAvatar(initials: rows[i].$1, size: 34),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rows[i].$2,
                            style: AppTypography.label(k.ink).copyWith(
                                fontSize: 13.5, fontWeight: FontWeight.w700)),
                        Text(rows[i].$3,
                            style: AppTypography.label(k.ink3)
                                .copyWith(fontSize: 11)),
                      ],
                    ),
                  ),
                  Text(rows[i].$4,
                      style:
                          AppTypography.tabular(AppTypography.label(k.success))
                              .copyWith(
                                  fontSize: 13, fontWeight: FontWeight.w800)),
                  const SizedBox(width: 10),
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                        color: k.accentTint,
                        borderRadius: BorderRadius.circular(9)),
                    child: Icon(Icons.arrow_forward, size: 16, color: k.accent),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
