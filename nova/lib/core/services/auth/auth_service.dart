import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Пользователь сессии. Нейтрален к провайдеру (Supabase / собственный / OTP).
@immutable
class AuthUser {
  const AuthUser(
      {required this.id, this.email, this.phone, this.isAnonymous = false});
  final String id;
  final String? email;
  final String? phone;
  final bool isAnonymous;
}

/// Метод входа (для аналитики и выбора адаптера).
enum AuthMethod { phone, email, apple, google }

/// Порт авторизации. Реализации: Supabase Auth, собственный OTP-бэкенд, Apple/
/// Google Sign In. Спроектирован сразу под мультиметодный вход — без рефакторинга.
abstract interface class AuthService {
  Stream<AuthUser?> authStateChanges();
  AuthUser? get currentUser;
  Future<void> restore();

  /// Запрос OTP-кода на телефон или email.
  Future<void> requestOtp({String? email, String? phone});

  /// Подтверждение кода. Возвращает true, если это новый пользователь.
  Future<bool> verifyOtp(String code);

  Future<void> signInWithApple();
  Future<void> signInWithGoogle();
  Future<void> signOut();
}

/// DEFAULT: локальный анонимный пользователь — приложение работает офлайн и
/// без бэкенда. Замена: SupabaseAuthService / ApiAuthService (адаптер).
class LocalAuthService implements AuthService {
  AuthUser? _user = const AuthUser(id: 'local', isAnonymous: true);
  final _controller = StreamController<AuthUser?>.broadcast();

  @override
  AuthUser? get currentUser => _user;

  @override
  Stream<AuthUser?> authStateChanges() async* {
    yield _user;
    yield* _controller.stream;
  }

  @override
  Future<void> restore() async {}

  String? _pendingPhone;
  String? _pendingEmail;

  @override
  Future<void> requestOtp({String? email, String? phone}) async {
    _pendingEmail = email;
    _pendingPhone = phone;
  }

  @override
  Future<bool> verifyOtp(String code) async {
    // DEFAULT (offline): любой код принимается. Реальная проверка — в адаптере.
    _user =
        AuthUser(id: 'otp_local', email: _pendingEmail, phone: _pendingPhone);
    _controller.add(_user);
    return true;
  }

  @override
  Future<void> signInWithApple() async {
    _user = const AuthUser(id: 'apple_local');
    _controller.add(_user);
  }

  @override
  Future<void> signInWithGoogle() async {
    _user = const AuthUser(id: 'google_local');
    _controller.add(_user);
  }

  @override
  Future<void> signOut() async {
    _user = null;
    _controller.add(null);
  }
}

final authServiceProvider = Provider<AuthService>((ref) => LocalAuthService());

final authStateProvider = StreamProvider<AuthUser?>(
    (ref) => ref.watch(authServiceProvider).authStateChanges());
