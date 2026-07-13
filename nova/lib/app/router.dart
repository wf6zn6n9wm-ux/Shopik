import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/analytics/analytics_screen.dart';
import '../features/clients/clients_screen.dart';
import '../features/menu/menu_screen.dart';
import '../features/today/today_screen.dart';
import 'scaffold_with_nav.dart';

/// Официальная навигация Flutter (go_router): deep links + web + масштаб.
/// StatefulShellRoute сохраняет состояние каждой вкладки. Маршруты именованы
/// как URL — основа веб-версии и диплинков (онлайн-запись, карточки).
final GoRouter appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) => ScaffoldWithNav(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/', builder: (context, state) => const TodayScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/clients', builder: (context, state) => const ClientsScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/analytics', builder: (context, state) => const AnalyticsScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/menu', builder: (context, state) => const MenuScreen())],
        ),
      ],
    ),
  ],
);
