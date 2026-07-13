import 'package:flutter/material.dart';

import '../design/theme.dart';
import '../features/analytics/analytics_screen.dart';
import '../features/clients/clients_screen.dart';
import '../features/create/create_appointment_sheet.dart';
import '../features/menu/menu_screen.dart';
import '../features/today/today_screen.dart';

/// Каркас навигации: 4 таба + центральная ➕. Точно под дизайн-систему.
/// (Deep-links через go_router — слой следующего этапа.)
class NovaShell extends StatefulWidget {
  const NovaShell({super.key});

  @override
  State<NovaShell> createState() => _NovaShellState();
}

class _NovaShellState extends State<NovaShell> {
  int _index = 0;

  static const _tabs = [
    _Tab(Icons.calendar_today_outlined, Icons.calendar_today, 'Календарь'),
    _Tab(Icons.people_alt_outlined, Icons.people_alt, 'Клиенты'),
    _Tab(Icons.bar_chart_outlined, Icons.bar_chart, 'Аналитика'),
    _Tab(Icons.menu, Icons.menu, 'Меню'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [TodayScreen(), ClientsScreen(), AnalyticsScreen(), MenuScreen()],
      ),
      bottomNavigationBar: _BottomBar(
        index: _index,
        tabs: _tabs,
        onSelect: (i) => setState(() => _index = i),
        onCreate: () => showCreateAppointmentSheet(context),
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

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.index,
    required this.tabs,
    required this.onSelect,
    required this.onCreate,
  });

  final int index;
  final List<_Tab> tabs;
  final ValueChanged<int> onSelect;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    // 2 таба · ➕ · 2 таба
    return Container(
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
              _item(context, 0),
              _item(context, 1),
              _CreateButton(onTap: onCreate),
              _item(context, 2),
              _item(context, 3),
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(BuildContext context, int i) {
    final nova = context.nova;
    final active = index == i;
    final tab = tabs[i];
    return Expanded(
      child: InkResponse(
        onTap: () => onSelect(i),
        radius: 40,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(active ? tab.activeIcon : tab.icon, size: 22, color: active ? nova.accent : nova.ink3),
            const SizedBox(height: 3),
            Text(
              tab.label,
              style: AppTypography.caption(active ? nova.accent : nova.ink3).copyWith(letterSpacing: 0, fontSize: 10),
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
