import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart' show markBooted;
import '../../app/routes.dart';
import '../../core/localization/app_text.dart';
import '../../design/theme.dart';
import '../../ui/z.dart';

/// WOW-онбординг: 3 екрани з живими прев'ю головних цінностей. Плавні переходи,
/// прогрес-крапки, фінальний «Почати» → головний екран.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pc = PageController();
  int _page = 0;

  void _finish() {
    markBooted();
    context.go(Routes.home);
  }

  void _next() {
    if (_page >= 2) {
      _finish();
    } else {
      _pc.nextPage(
          duration: const Duration(milliseconds: 420),
          curve: const Cubic(0.16, 0.9, 0.3, 1));
    }
  }

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final pages = <Widget>[
      _Page(
        orb: const Color(0x478B8BF0),
        preview: _DashboardPreview(),
        title: t('Весь день —\nна одному екрані'),
        subtitle: t(
            'Записи, виручка та наступний клієнт — щойно відкрив застосунок.'),
      ),
      _Page(
        orb: const Color(0x3846D08A),
        preview: _SmartPreview(),
        title: t('Вільний час\nсам себе заповнює'),
        subtitle: t(
            'Запис+ помічає вікна й підказує, кого з клієнтів запросити саме зараз.'),
      ),
      _Page(
        orb: const Color(0x478B8BF0),
        preview: _WinbackPreview(),
        title: t('Клієнти\nповертаються'),
        subtitle:
            t('Один тап — і застосунок нагадає тим, хто давно не заходив.'),
      ),
    ];

    return Scaffold(
      backgroundColor: k.canvas,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 16, 0),
                child: GestureDetector(
                  onTap: _finish,
                  child: Text(t('Пропустити'),
                      style:
                          AppTypography.label(k.ink3).copyWith(fontSize: 14)),
                ),
              ),
            ),
            Expanded(
              child: PageView(
                controller: _pc,
                onPageChanged: (i) {
                  zTap();
                  setState(() => _page = i);
                },
                children: pages,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(26, 0, 26, 22),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < 3; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 250),
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          width: i == _page ? 26 : 6,
                          height: 5,
                          decoration: BoxDecoration(
                            color: i == _page ? k.accent : k.surface3,
                            borderRadius: BorderRadius.circular(3),
                            boxShadow: i == _page
                                ? const [
                                    BoxShadow(
                                        color: Color(0xBF8B8BF0),
                                        blurRadius: 10)
                                  ]
                                : null,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  ZButton(
                      label: _page == 2 ? t('Почати →') : t('Далі'),
                      onTap: _next),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({
    required this.orb,
    required this.preview,
    required this.title,
    required this.subtitle,
  });
  final Color orb;
  final Widget preview;
  final String title, subtitle;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 26),
      child: Column(
        children: [
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                Positioned(top: 10, child: GlowOrb(size: 240, color: orb)),
                preview,
              ],
            ),
          ),
          Text(title,
              textAlign: TextAlign.center,
              style: AppTypography.title1(k.ink).copyWith(height: 1.1)),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(subtitle,
                textAlign: TextAlign.center,
                style: AppTypography.body(k.ink2)
                    .copyWith(fontSize: 15, height: 1.5)),
          ),
          const SizedBox(height: 30),
        ],
      ),
    );
  }
}

class _DashboardPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Transform.rotate(
      angle: -0.026,
      child: Container(
        width: 260,
        decoration: FX.card(k, radius: 20),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Text(t('Сьогодні'),
                    style: AppTypography.title3(k.ink).copyWith(fontSize: 15)),
                const Spacer(),
                const ZAvatar(initials: 'С', size: 26),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _mini(k, t('Записів'), '6')),
                const SizedBox(width: 8),
                Expanded(child: _mini(k, t('Виручка'), '₴2 400')),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              decoration: FX.hero(radius: 14),
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const ZAvatar(initials: 'ОК', size: 30),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Олена · ${t('Гель-лак')}',
                          style: AppTypography.label(k.ink).copyWith(
                              fontSize: 12, fontWeight: FontWeight.w700)),
                      Text(tp('за {n} хв', {'n': 25}),
                          style: AppTypography.label(k.ink3)
                              .copyWith(fontSize: 10)),
                    ],
                  ),
                  const Spacer(),
                  const ZRing(progress: 0.6, size: 30, stroke: 3, glow: false),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _mini(KavioColors k, String l, String v) => Container(
        decoration: FX.card(k, radius: 14),
        padding: const EdgeInsets.all(11),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.toUpperCase(),
                style: AppTypography.caption(k.ink3)
                    .copyWith(fontSize: 9, letterSpacing: 0.6)),
            const SizedBox(height: 3),
            Text(v,
                style: AppTypography.tabular(AppTypography.title2(k.ink))
                    .copyWith(fontSize: 18)),
          ],
        ),
      );
}

class _SmartPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return Transform.rotate(
      angle: 0.026,
      child: Container(
        width: 260,
        decoration: FX.card(k, radius: 20),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            ZLabel('${t('Розумне вікно')} · 15:30', color: k.accent),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: const Color(0x148B8BF0),
                borderRadius: BorderRadius.circular(13),
                border: Border.all(color: const Color(0x808B8BF0)),
              ),
              padding: const EdgeInsets.all(11),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                        color: k.accentTint,
                        borderRadius: BorderRadius.circular(10)),
                    child: Icon(Icons.auto_awesome, size: 15, color: k.accent),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t('Вільно 45 хв'),
                            style: AppTypography.label(k.ink).copyWith(
                                fontSize: 12, fontWeight: FontWeight.w700)),
                        Text(t('Марія давно не була'),
                            style: AppTypography.label(k.ink3)
                                .copyWith(fontSize: 10)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            ZButton(
                label: t('Надіслати запрошення'),
                padding: const EdgeInsets.symmetric(vertical: 10)),
          ],
        ),
      ),
    );
  }
}

class _WinbackPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    Widget row(String i, String n, String s) => Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
              color: k.surface2, borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
          child: Row(
            children: [
              ZAvatar(initials: i, size: 30),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(n,
                        style: AppTypography.label(k.ink).copyWith(
                            fontSize: 12, fontWeight: FontWeight.w700)),
                    Text(s,
                        style:
                            AppTypography.label(k.ink3).copyWith(fontSize: 10)),
                  ],
                ),
              ),
              ZPill('+₴500', color: k.success, bg: k.successTint),
            ],
          ),
        );
    return Container(
      width: 260,
      decoration: FX.card(k, radius: 20),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          ZLabel(t('Повернення клієнтів')),
          const SizedBox(height: 10),
          row('АБ', 'Андрій Б.', tp('останній візит {n} дні тому', {'n': 62})),
          row('МТ', 'Марія Т.', tp('останній візит {n} днів тому', {'n': 48})),
        ],
      ),
    );
  }
}
