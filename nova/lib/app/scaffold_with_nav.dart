import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/theme.dart';
import '../features/create/create_appointment_sheet.dart';
import '../modules/app_module.dart';

/// Навигационный каркас: нижний бар строится из destinations модулей
/// (+ центральная ➕ по центру). ➕ открывает лист создания — это действие, а не
/// маршрут. Добавление/перестановка вкладок — через реестр модулей.
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
    final kavio = context.kavio;
    final current = navigationShell.currentIndex;
    final mid = destinations.length ~/ 2;

    final items = <Widget>[];
    for (var i = 0; i < destinations.length; i++) {
      if (i == mid) {
        items.add(
            _CreateButton(onTap: () => showCreateAppointmentSheet(context)));
      }
      items.add(_NavItem(
        destination: destinations[i],
        active: current == i,
        onTap: () => _goBranch(i),
      ));
    }

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: kavio.surface,
          border: Border(top: BorderSide(color: kavio.line)),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(height: 62, child: Row(children: items)),
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
    final kavio = context.kavio;
    return Expanded(
      child: InkResponse(
        onTap: onTap,
        radius: 40,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(active ? destination.activeIcon : destination.icon,
                size: 22, color: active ? kavio.accent : kavio.ink3),
            const SizedBox(height: 3),
            Text(
              destination.label,
              style: AppTypography.caption(active ? kavio.accent : kavio.ink3)
                  .copyWith(letterSpacing: 0, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}

class _CreateButton extends StatelessWidget {
  const _CreateButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return SizedBox(
      width: 76,
      child: Center(
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: kavio.accent,
              borderRadius: BorderRadius.circular(Radii.full),
              boxShadow: context.shadows.e2,
            ),
            child: Icon(Icons.add, color: kavio.onAccent, size: 26),
          ),
        ),
      ),
    );
  }
}
