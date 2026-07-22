import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/theme.dart';
import '../features/clients/create_client_sheet.dart';
import '../features/create/create_appointment_sheet.dart';
import '../features/services/create_service_sheet.dart';
import '../modules/app_module.dart';

/// Плаваючий скляний нав-бар + центральний FAB. FAB розкриває меню створення
/// (морф з розмиттям тла). Вкладки будуються з destinations модулів.
class ScaffoldWithNav extends StatelessWidget {
  const ScaffoldWithNav({
    super.key,
    required this.navigationShell,
    required this.destinations,
  });

  final StatefulNavigationShell navigationShell;
  final List<NavDestination> destinations;

  void _goBranch(int index) => navigationShell.goBranch(
        index,
        initialLocation: index == navigationShell.currentIndex,
      );

  @override
  Widget build(BuildContext context) {
    final current = navigationShell.currentIndex;
    final mid = destinations.length ~/ 2;

    final items = <Widget>[];
    for (var i = 0; i < destinations.length; i++) {
      if (i == mid) {
        items.add(_Fab(onTap: () => showCreateMenu(context)));
      }
      items.add(_NavItem(
        destination: destinations[i],
        active: current == i,
        onTap: () => _goBranch(i),
      ));
    }

    return Scaffold(
      extendBody: true,
      backgroundColor: context.kavio.canvas,
      body: navigationShell,
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: SafeArea(
          top: false,
          child: _FloatingBar(children: items),
        ),
      ),
    );
  }
}

class _FloatingBar extends StatelessWidget {
  const _FloatingBar({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
          decoration: BoxDecoration(
            color: FX.navFill,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: k.line, width: 1),
            boxShadow: const [
              BoxShadow(
                  color: Color(0xD9000000),
                  blurRadius: 46,
                  spreadRadius: -14,
                  offset: Offset(0, 22)),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: children,
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem(
      {required this.destination, required this.active, required this.onTap});
  final NavDestination destination;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: 44,
        height: 42,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(active ? destination.activeIcon : destination.icon,
                size: 25, color: active ? k.accent : k.ink3),
            const SizedBox(height: 5),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 5,
              height: 5,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? k.accent : Colors.transparent,
                boxShadow: active
                    ? const [BoxShadow(color: Color(0xBF8B8BF0), blurRadius: 8)]
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Fab extends StatefulWidget {
  const _Fab({required this.onTap});
  final VoidCallback onTap;
  @override
  State<_Fab> createState() => _FabState();
}

class _FabState extends State<_Fab> {
  bool _down = false;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _down ? 0.92 : 1,
        duration: const Duration(milliseconds: 110),
        child: Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            gradient: FX.brandButton,
            borderRadius: BorderRadius.circular(18),
            boxShadow: const [
              BoxShadow(
                  color: Color(0xBF8B8BF0),
                  blurRadius: 30,
                  spreadRadius: -6,
                  offset: Offset(0, 14))
            ],
          ),
          child: const Icon(Icons.add, color: Colors.white, size: 26),
        ),
      ),
    );
  }
}

// ─────────────────────────────── FAB-меню створення (морф з blur)

class _MenuAction {
  const _MenuAction(this.icon, this.label, this.onTap);
  final IconData icon;
  final String label;
  final void Function(BuildContext) onTap;
}

Future<void> showCreateMenu(BuildContext context) {
  final actions = <_MenuAction>[
    _MenuAction(Icons.event_available_outlined, 'Новий запис',
        (c) => showCreateAppointmentSheet(c)),
    _MenuAction(Icons.person_add_alt_1_outlined, 'Новий клієнт',
        (c) => showCreateClientSheet(c)),
    _MenuAction(Icons.design_services_outlined, 'Нова послуга',
        (c) => showCreateServiceSheet(c)),
    _MenuAction(Icons.shopping_bag_outlined, 'Продаж товару',
        (c) => showCreateAppointmentSheet(c)),
  ];
  return showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'menu',
    barrierColor: Colors.transparent,
    transitionDuration: const Duration(milliseconds: 320),
    pageBuilder: (_, __, ___) => const SizedBox.shrink(),
    transitionBuilder: (context, anim, _, __) =>
        _CreateMenu(anim: anim, actions: actions),
  );
}

class _CreateMenu extends StatelessWidget {
  const _CreateMenu({required this.anim, required this.actions});
  final Animation<double> anim;
  final List<_MenuAction> actions;

  @override
  Widget build(BuildContext context) {
    final k = context.kavio;
    final curved =
        CurvedAnimation(parent: anim, curve: const Cubic(0.16, 0.9, 0.3, 1));
    return AnimatedBuilder(
      animation: curved,
      builder: (context, _) {
        final t = curved.value;
        return Stack(
          children: [
            Positioned.fill(
              child: GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: BackdropFilter(
                  filter: ui.ImageFilter.blur(sigmaX: 18 * t, sigmaY: 18 * t),
                  child: Container(color: Colors.black.withOpacity(0.5 * t)),
                ),
              ),
            ),
            Positioned(
              left: 20,
              right: 20,
              bottom: 108,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  for (var i = 0; i < actions.length; i++)
                    _MenuRow(
                        action: actions[i],
                        t: _stagger(t, i, actions.length),
                        color: k),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 32,
              child: Center(
                child: Transform.rotate(
                  angle: t * 0.785398, // 45°
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        gradient: FX.brandButton,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: const [
                          BoxShadow(
                              color: Color(0xBF8B8BF0),
                              blurRadius: 34,
                              spreadRadius: -6,
                              offset: Offset(0, 14))
                        ],
                      ),
                      child:
                          const Icon(Icons.add, color: Colors.white, size: 28),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  double _stagger(double t, int i, int n) {
    final start = (n - 1 - i) * 0.12;
    return ((t - start) / (1 - start)).clamp(0.0, 1.0);
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.action, required this.t, required this.color});
  final _MenuAction action;
  final double t;
  final KavioColors color;
  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: t,
      child: Transform.translate(
        offset: Offset(0, (1 - t) * 24),
        child: Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              GestureDetector(
                onTap: () {
                  Navigator.of(context).pop();
                  action.onTap(context);
                },
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: BackdropFilter(
                    filter: ui.ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 13),
                      decoration: BoxDecoration(
                        color: FX.glassFill,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: color.line, width: 1),
                        boxShadow: const [
                          BoxShadow(
                              color: Color(0x99000000),
                              blurRadius: 24,
                              spreadRadius: -12,
                              offset: Offset(0, 10))
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                                color: color.accentTint,
                                borderRadius: BorderRadius.circular(11)),
                            child: Icon(action.icon,
                                size: 18, color: color.accent),
                          ),
                          const SizedBox(width: 12),
                          Text(action.label,
                              style: AppTypography.title3(color.ink).copyWith(
                                  fontSize: 15, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
