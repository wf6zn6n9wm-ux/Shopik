import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Основной пункт навигации (вкладка нижнего бара). Модуль объявляет свои
/// destinations — из них собираются и роуты, и бар. Добавить вкладку =
/// добавить модуль, без правок навигации.
@immutable
class NavDestination {
  const NavDestination({
    required this.path,
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.builder,
  });

  final String path;
  final String label;
  final IconData icon;
  final IconData activeIcon;
  final Widget Function() builder;
}

/// Контракт модуля. Новая функциональность подключается отдельным модулем:
/// свои маршруты, свои вкладки, своя инициализация. Ядро о фиче не знает.
abstract class AppModule {
  String get id;

  /// Основные вкладки (могут отсутствовать у «вторичных» модулей).
  List<NavDestination> get destinations => const [];

  /// Дополнительные маршруты (карточки, публичные страницы, онлайн-запись и т.п.).
  List<RouteBase> get routes => const [];

  /// Инициализация при старте (подписки, прогрев кэша). По умолчанию пусто.
  Future<void> bootstrap(ProviderContainer container) async {}
}
