import 'package:go_router/go_router.dart';

import '../features/auth/auth_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/booking/online_booking_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/services/services_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/subscription/subscription_screen.dart';
import '../modules/registry.dart';
import 'routes.dart';
import 'scaffold_with_nav.dart';

/// Роутер собирается из реестра модулей (вкладки нижней навигации) + отдельные
/// полноэкранные и pushed-маршруты MVP. Новый модуль добавляет свои маршруты,
/// ничего здесь не переписывая.
final GoRouter appRouter = _buildRouter();

GoRouter _buildRouter() {
  final destinations = primaryDestinations;
  return GoRouter(
    initialLocation: Routes.auth,
    routes: [
      GoRoute(
          path: Routes.auth, builder: (context, state) => const AuthScreen()),
      GoRoute(
        path: Routes.otp,
        builder: (context, state) =>
            OtpScreen(contact: state.extra as String? ?? ''),
      ),
      GoRoute(
          path: Routes.onboarding,
          builder: (context, state) => const OnboardingScreen()),

      // Основная навигация с сохранением состояния вкладок.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => ScaffoldWithNav(
            navigationShell: navigationShell, destinations: destinations),
        branches: [
          for (final d in destinations)
            StatefulShellBranch(
              routes: [
                GoRoute(path: d.path, builder: (context, state) => d.builder())
              ],
            ),
        ],
      ),

      // Pushed-экраны MVP.
      GoRoute(
          path: Routes.services,
          builder: (context, state) => const ServicesScreen()),
      GoRoute(
          path: Routes.profile,
          builder: (context, state) => const ProfileScreen()),
      GoRoute(
          path: Routes.settings,
          builder: (context, state) => const SettingsScreen()),
      GoRoute(
          path: Routes.subscription,
          builder: (context, state) => const SubscriptionScreen()),
      GoRoute(
          path: Routes.onlineBooking,
          builder: (context, state) => const OnlineBookingScreen()),

      ...moduleRoutes,
    ],
  );
}
