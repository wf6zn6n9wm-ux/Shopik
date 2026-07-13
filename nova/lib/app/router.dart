import 'package:go_router/go_router.dart';

import '../modules/registry.dart';
import 'scaffold_with_nav.dart';

/// Роутер собирается из реестра модулей: основные вкладки — из destinations,
/// дополнительные экраны — из moduleRoutes. Новый модуль добавляет свои
/// маршруты, ничего здесь не переписывая.
final GoRouter appRouter = _buildRouter();

GoRouter _buildRouter() {
  final destinations = primaryDestinations;
  return GoRouter(
    initialLocation: destinations.first.path,
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            ScaffoldWithNav(navigationShell: navigationShell, destinations: destinations),
        branches: [
          for (final d in destinations)
            StatefulShellBranch(
              routes: [GoRoute(path: d.path, builder: (context, state) => d.builder())],
            ),
        ],
      ),
      ...moduleRoutes,
    ],
  );
}
