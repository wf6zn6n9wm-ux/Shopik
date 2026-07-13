import 'package:go_router/go_router.dart';

import 'app_module.dart';
import 'crm/crm_module.dart';

/// Реестр модулей — единственное место, куда добавляется новая функциональность.
/// Порядок задаёт порядок вкладок. Будущие модули просто дописываются в список:
///   MarketplaceModule(), PublicPagesModule(), BookingModule(), BillingModule()…
final List<AppModule> appModules = [
  CrmModule(),
];

List<NavDestination> get primaryDestinations =>
    appModules.expand((m) => m.destinations).toList(growable: false);

List<RouteBase> get moduleRoutes =>
    appModules.expand((m) => m.routes).toList(growable: false);
