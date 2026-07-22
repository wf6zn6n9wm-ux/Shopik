import 'package:flutter/material.dart';

import '../../features/analytics/analytics_screen.dart';
import '../../features/calendar/calendar_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/menu/menu_screen.dart';
import '../app_module.dart';

/// Базовый модуль CRM: календарь, клиенты, аналитика, меню. Задаёт четыре
/// основные вкладки. Будущие модули (Marketplace, PublicPages, Booking,
/// Billing…) регистрируются рядом в реестре и добавляют свои маршруты/вкладки.
class CrmModule extends AppModule {
  @override
  String get id => 'crm';

  @override
  List<NavDestination> get destinations => const [
        NavDestination(
          path: '/',
          label: 'Сьогодні',
          icon: Icons.home_outlined,
          activeIcon: Icons.home_rounded,
          builder: HomeScreen.new,
        ),
        NavDestination(
          path: '/calendar',
          label: 'Календар',
          icon: Icons.calendar_today_outlined,
          activeIcon: Icons.calendar_today,
          builder: CalendarScreen.new,
        ),
        NavDestination(
          path: '/analytics',
          label: 'Аналітика',
          icon: Icons.bar_chart_outlined,
          activeIcon: Icons.bar_chart,
          builder: AnalyticsScreen.new,
        ),
        NavDestination(
          path: '/menu',
          label: 'Меню',
          icon: Icons.menu,
          activeIcon: Icons.menu,
          builder: MenuScreen.new,
        ),
      ];
}
