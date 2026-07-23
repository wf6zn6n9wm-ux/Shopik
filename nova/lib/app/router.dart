import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/booking/online_booking_screen.dart';
import '../features/clients/client_detail_screen.dart';
import '../features/clients/clients_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/public_booking/public_booking_screen.dart';
import '../features/signature/magic_rebook_screen.dart';
import '../features/signature/recap_screen.dart';
import '../features/signature/smart_gaps_screen.dart';
import '../features/services/services_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/splash/splash_screen.dart';
import '../features/subscription/subscription_screen.dart';
import '../modules/registry.dart';
import 'routes.dart';
import 'scaffold_with_nav.dart';

/// Перший запуск сесії: показуємо splash → онбординг → головний. Прапорець
/// у пам'яті (на вебі скидається при перезавантаженні — WOW видно щоразу).
bool _booted = false;
void markBooted() => _booted = true;

/// Роутер собирается из реестра модулей (вкладки нижней навигации) + отдельные
/// полноэкранные и pushed-маршруты MVP. Новый модуль добавляет свои маршруты,
/// ничего здесь не переписывая.
final GoRouter appRouter = _buildRouter();

/// Преміальний перехід pushed-екранів: fade + м'який рух знизу + легкий scale,
/// пружинна крива (Arc/Linear-відчуття). Спільний для всіх pushed-маршрутів.
CustomTransitionPage<void> _springPage(Widget child) {
  return CustomTransitionPage<void>(
    transitionDuration: const Duration(milliseconds: 380),
    reverseTransitionDuration: const Duration(milliseconds: 300),
    child: child,
    transitionsBuilder: (context, animation, secondary, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: const Cubic(0.16, 0.9, 0.3, 1),
        reverseCurve: const Cubic(0.3, 0, 0.8, 0.15),
      );
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position:
              Tween<Offset>(begin: const Offset(0, 0.035), end: Offset.zero)
                  .animate(curved),
          child: Transform.scale(
            scale: 0.98 + 0.02 * curved.value,
            child: child,
          ),
        ),
      );
    },
  );
}

GoRouter _buildRouter() {
  final destinations = primaryDestinations;
  return GoRouter(
    initialLocation: Routes.splash,
    redirect: (context, state) {
      // Перший вхід у сесію: '/' → splash (крім знімків з ?s=1).
      if (!_booted &&
          state.uri.path == Routes.home &&
          state.uri.queryParameters['s'] != '1') {
        return Routes.splash;
      }
      return null;
    },
    routes: [
      GoRoute(
          path: Routes.splash,
          builder: (context, state) => const SplashScreen()),
      GoRoute(
          path: Routes.auth, builder: (context, state) => const AuthScreen()),
      GoRoute(
        path: Routes.otp,
        builder: (context, state) =>
            OtpScreen(contact: state.extra as String? ?? ''),
      ),
      GoRoute(
          path: Routes.onboarding,
          pageBuilder: (context, state) =>
              _springPage(const OnboardingScreen())),

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

      // Pushed-екрани — з пружинним переходом.
      GoRoute(
        path: Routes.clientDetail,
        pageBuilder: (context, state) => _springPage(
            ClientDetailScreen(clientId: state.pathParameters['id']!)),
      ),
      GoRoute(
          path: Routes.clients,
          pageBuilder: (context, state) => _springPage(const ClientsScreen())),
      GoRoute(
          path: Routes.services,
          pageBuilder: (context, state) => _springPage(const ServicesScreen())),
      GoRoute(
          path: Routes.profile,
          pageBuilder: (context, state) => _springPage(const ProfileScreen())),
      GoRoute(
          path: Routes.settings,
          pageBuilder: (context, state) => _springPage(const SettingsScreen())),
      GoRoute(
          path: Routes.subscription,
          pageBuilder: (context, state) =>
              _springPage(const SubscriptionScreen())),
      GoRoute(
          path: Routes.onlineBooking,
          pageBuilder: (context, state) =>
              _springPage(const OnlineBookingScreen())),
      GoRoute(
          path: Routes.smartGaps,
          pageBuilder: (context, state) =>
              _springPage(const SmartGapsScreen())),
      GoRoute(
          path: Routes.rebook,
          pageBuilder: (context, state) =>
              _springPage(const MagicRebookScreen())),
      GoRoute(
          path: Routes.recap,
          pageBuilder: (context, state) => _springPage(const RecapScreen())),
      GoRoute(
          path: Routes.publicBooking,
          builder: (context, state) => const PublicBookingScreen()),

      ...moduleRoutes,
    ],
  );
}
