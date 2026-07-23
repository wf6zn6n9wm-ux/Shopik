/// Пути маршрутов приложения (единый источник, без «магических строк»).
abstract final class Routes {
  static const home = '/';
  static const calendar = '/calendar';
  static const clients = '/clients';
  static const clientDetail = '/clients/:id';
  static String clientDetailPath(String id) => '/clients/$id';
  static const analytics = '/analytics';
  static const menu = '/menu';

  static const auth = '/auth';
  static const otp = '/auth/otp';
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const rebook = '/rebook';
  static const recap = '/recap';
  static const services = '/services';
  static const profile = '/profile';
  static const settings = '/settings';
  static const subscription = '/subscription';
  static const onlineBooking = '/online-booking';
  static const smartGaps = '/smart-gaps';
  static const publicBooking = '/book';
}
