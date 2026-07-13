import 'package:flutter/material.dart';

import '../../features/analytics/analytics_screen.dart';
import '../../features/calendar/calendar_screen.dart';
import '../../features/clients/clients_screen.dart';
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
          label: 'Календарь',
          icon: Icons.calendar_today_outlined,
          activeIcon: Icons.calendar_today,
          builder: CalendarScreen.new,
        ),
        NavDestination(
          path: '/clients',
          label: 'Клиенты',
          icon: Icons.people_alt_outlined,
          activeIcon: Icons.people_alt,
          builder: ClientsScreen.new,
        ),
        NavDestination(
          path: '/analytics',
          label: 'Аналитика',
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
