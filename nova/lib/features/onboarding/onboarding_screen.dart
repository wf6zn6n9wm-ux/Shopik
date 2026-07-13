import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../design/theme.dart';
import '../../ui/nova_button.dart';

/// Профессия/сфера бизнеса. Выбор задаёт `Business.industry` — из него позже
/// подставляются шаблоны услуг и терминология (мультиарендно). Здесь —
/// структура и навигация в приложение.
class Profession {
  const Profession(this.id, this.title, this.icon);
  final String id;
  final String title;
  final IconData icon;
}

const _professions = <Profession>[
  Profession('hair', 'Парикмахер', Icons.content_cut),
  Profession('barber', 'Барбер', Icons.face_retouching_natural),
  Profession('nails', 'Ногтевой сервис', Icons.back_hand_outlined),
  Profession('brows', 'Брови и ресницы', Icons.remove_red_eye_outlined),
  Profession('makeup', 'Визажист', Icons.brush_outlined),
  Profession('cosmet', 'Косметолог', Icons.spa_outlined),
  Profession('massage', 'Массаж', Icons.self_improvement_outlined),
  Profession('tattoo', 'Тату и пирсинг', Icons.gesture_outlined),
  Profession('other', 'Другое', Icons.more_horiz),
];

/// Выбранная сфера (позже → Business.industry при регистрации).
final selectedProfessionProvider = StateProvider<String?>((ref) => null);

class OnboardingScreen extends ConsumerWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nova = context.nova;
    final selected = ref.watch(selectedProfessionProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  Spacing.s5, Spacing.s6, Spacing.s5, Spacing.s2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Чем вы занимаетесь?',
                      style: AppTypography.title1(nova.ink)),
                  const SizedBox(height: Spacing.s2),
                  Text('Подберём готовые услуги и настройки под вашу сферу',
                      style: AppTypography.body(nova.ink2)),
                ],
              ),
            ),
            Expanded(
              child: GridView.count(
                padding: const EdgeInsets.all(Spacing.s5),
                crossAxisCount: 3,
                mainAxisSpacing: Spacing.s3,
                crossAxisSpacing: Spacing.s3,
                childAspectRatio: 0.92,
                children: [
                  for (final p in _professions)
                    _ProfessionCard(
                      profession: p,
                      selected: selected == p.id,
                      onTap: () => ref
                          .read(selectedProfessionProvider.notifier)
                          .state = p.id,
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  Spacing.s5, 0, Spacing.s5, Spacing.s5),
              child: NovaButton(
                'Создать студию',
                expand: true,
                onPressed:
                    selected == null ? null : () => context.go(Routes.calendar),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfessionCard extends StatelessWidget {
  const _ProfessionCard({
    required this.profession,
    required this.selected,
    required this.onTap,
  });

  final Profession profession;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: Motion.fast,
        curve: Motion.standard,
        decoration: BoxDecoration(
          color: selected ? nova.accentTint : nova.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(
            color: selected ? nova.accent : nova.line,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(profession.icon,
                size: 26, color: selected ? nova.accent : nova.ink2),
            const SizedBox(height: Spacing.s2),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(
                profession.title,
                textAlign: TextAlign.center,
                style: AppTypography.label(selected ? nova.accent : nova.ink),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
