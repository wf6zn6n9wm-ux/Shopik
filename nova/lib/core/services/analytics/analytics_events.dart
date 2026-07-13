import 'analytics_service.dart';

/// Единый каталог событий пользовательского пути. Имена — snake_case, параметры
/// плоские — готово к отправке в Firebase Analytics или PostHog (адаптер
/// AnalyticsService). Все фичи эмитят события ТОЛЬКО через этот каталог, чтобы
/// формат был единым и стабильным.
class AnalyticsEvent {
  const AnalyticsEvent(this.name, [this.params = const {}]);

  final String name;
  final Map<String, Object?> params;

  // — Авторизация / онбординг —
  static const signUp = AnalyticsEvent('sign_up');
  static AnalyticsEvent login(String method) =>
      AnalyticsEvent('login', {'method': method});
  static const workspaceCreated = AnalyticsEvent('workspace_created');
  static AnalyticsEvent industrySelected(String industry) =>
      AnalyticsEvent('industry_selected', {'industry': industry});

  // — Базовые сущности —
  static const serviceCreated = AnalyticsEvent('service_created');
  static const clientCreated = AnalyticsEvent('client_created');
  static const appointmentCreated = AnalyticsEvent('appointment_created');

  // — Монетизация —
  static AnalyticsEvent subscriptionStarted(String plan) =>
      AnalyticsEvent('subscription_started', {'plan': plan});
  static const subscriptionCancelled = AnalyticsEvent('subscription_cancelled');

  // — Вовлечённость —
  static AnalyticsEvent calendarViewed(String view) =>
      AnalyticsEvent('calendar_viewed', {'view': view});
  static const onlineBookingUsed = AnalyticsEvent('online_booking_used');
  static const staffInvited = AnalyticsEvent('staff_invited');
}

/// Типизированная отправка: `ref.read(analyticsServiceProvider).track(event)`.
extension AnalyticsTracking on AnalyticsService {
  Future<void> track(AnalyticsEvent event) =>
      logEvent(event.name, params: event.params);
}
