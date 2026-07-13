import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../core/industry/industry_templates.dart';
import '../../core/services/analytics/analytics_service.dart';
import '../../data/providers.dart';
import '../../design/theme.dart';
import '../../ui/nova_button.dart';

/// Онбординг: выбор сферы → готовое рабочее пространство за секунды.
/// Универсально для любой отрасли: набор берётся из IndustryCatalog (данные),
/// применяется к Business через WorkspaceRepository (Drift, offline-first).
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  String? _selected;
  bool _saving = false;

  Future<void> _create() async {
    final id = _selected;
    if (id == null || _saving) return;
    setState(() => _saving = true);
    final router = GoRouter.of(context);

    final template = IndustryCatalog.byId(id);
    final seeds = <(String, String, int, int)>[
      for (final e in template.flatServices)
        (e.category, e.service.name, e.service.durationMinutes, e.service.price),
    ];
    await ref.read(workspaceRepositoryProvider).applyIndustry(id, seeds);
    await ref
        .read(analyticsServiceProvider)
        .logEvent('business_created', params: {'industry': id});

    router.go(Routes.calendar);
  }

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
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
                childAspectRatio: 0.9,
                children: [
                  for (final t in IndustryCatalog.all)
                    _IndustryCard(
                      template: t,
                      selected: _selected == t.id,
                      onTap: () => setState(() => _selected = t.id),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  Spacing.s5, 0, Spacing.s5, Spacing.s5),
              child: NovaButton(
                'Создать рабочее пространство',
                expand: true,
                onPressed: _selected == null || _saving ? null : _create,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IndustryCard extends StatelessWidget {
  const _IndustryCard({
    required this.template,
    required this.selected,
    required this.onTap,
  });

  final IndustryTemplate template;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final accent = template.color;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: Motion.fast,
        curve: Motion.standard,
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.12) : nova.surface,
          borderRadius: BorderRadius.circular(Radii.md),
          border: Border.all(
            color: selected ? accent : nova.line,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(template.icon, size: 26, color: selected ? accent : nova.ink2),
            const SizedBox(height: Spacing.s2),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(
                template.title,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.label(selected ? accent : nova.ink),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
