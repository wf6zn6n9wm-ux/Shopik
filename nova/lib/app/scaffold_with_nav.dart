import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/theme.dart';
import '../features/create/create_appointment_sheet.dart';

/// Навигационный каркас: нижний бар (4 таба + центральная ➕), привязанный к
/// StatefulNavigationShell go_router. ➕ открывает модальный лист создания
/// (не маршрут — это действие, а не место назначения).
class ScaffoldWithNav extends StatelessWidget {
  const ScaffoldWithNav({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const _tabs = [
    _Tab(Icons.calendar_today_outlined, Icons.calendar_today, 'Календарь'),
    _Tab(Icons.people_alt_outlined, Icons.people_alt, 'Клиенты'),
    _Tab(Icons.bar_chart_outlined, Icons.bar_chart, 'Аналитика'),
    _Tab(Icons.menu, Icons.menu, 'Меню'),
  ];

  void _goBranch(int index) => navigationShell.goBranch(
        index,
        initialLocation: index == navigationShell.currentIndex,
      );

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final current = navigationShell.currentIndex;

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: nova.surface,
          border: Border(top: BorderSide(color: nova.line)),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 62,
            child: Row(
              children: [
                _NavItem(tab: _tabs[0], active: current == 0, onTap: () => _goBranch(0)),
                _NavItem(tab: _tabs[1], active: current == 1, onTap: () => _goBranch(1)),
                _CreateButton(onTap: () => showCreateAppointmentSheet(context)),
                _NavItem(tab: _tabs[2], active: current == 2, onTap: () => _goBranch(2)),
                _NavItem(tab: _tabs[3], active: current == 3, onTap: () => _goBranch(3)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab {
  const _Tab(this.icon, this.activeIcon, this.label);
  final IconData icon;
  final IconData activeIcon;
  final String label;
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.tab, required this.active, required this.onTap});
  final _Tab tab;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Expanded(
      child: InkResponse(
        onTap: onTap,
        radius: 40,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(active ? tab.activeIcon : tab.icon, size: 22, color: active ? nova.accent : nova.ink3),
            const SizedBox(height: 3),
            Text(
              tab.label,
              style: AppTypography.caption(active ? nova.accent : nova.ink3)
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
    final nova = context.nova;
    return SizedBox(
      width: 76,
      child: Center(
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: nova.accent,
              borderRadius: BorderRadius.circular(Radii.full),
              boxShadow: context.shadows.e2,
            ),
            child: Icon(Icons.add, color: nova.onAccent, size: 26),
          ),
        ),
      ),
    );
  }
}
