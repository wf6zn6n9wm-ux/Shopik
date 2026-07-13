import 'package:flutter_test/flutter_test.dart';
import 'package:nova/core/money/money.dart';
import 'package:nova/core/services/subscriptions/entitlements.dart';

// Базовые тесты фундамента: гейтинг подписки и мультивалютность.
// Чистая логика без БД/UI — быстрые и стабильные, держат архитектуру честной.
void main() {
  group('Entitlements', () {
    test('free-план включает онлайн-запись, но не команду', () {
      expect(Entitlement.free.has(Feature.onlineBooking), isTrue);
      expect(Entitlement.free.has(Feature.team), isFalse);
    });

    test('team-план включает все возможности', () {
      for (final f in Feature.values) {
        expect(Entitlement.team.has(f), isTrue, reason: 'нет $f');
      }
    });
  });

  group('Money', () {
    test('минорные единицы → мажорные по десятичным знакам валюты', () {
      expect(const Money(150000, Currency.usd).major, 1500.0); // 2 знака
      expect(const Money(12000, Currency.kzt).major, 12000.0); // 0 знаков
    });

    test('поиск валюты по коду с фолбэком', () {
      expect(Currency.byCode('EUR').symbol, '€');
      // Мировой дефолт — USD (RUB исключён, продукт без России).
      expect(Currency.byCode('???').code, Currency.usd.code);
    });
  });
}
