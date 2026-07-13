import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Пользователь сессии. Нейтрален к провайдеру (Supabase / собственный / OTP).
@immutable
class AuthUser {
  const AuthUser({required this.id, this.email, this.phone, this.isAnonymous = false});
  final String id;
  final String? email;
  final String? phone;
  final bool isAnonymous;
}

/// Порт авторизации. Реализации: Supabase Auth, собственный OTP-бэкенд и т.д.
abstract interface class AuthService {
  Stream<AuthUser?> authStateChanges();
  AuthUser? get currentUser;
  Future<void> restore();
  Future<void> signInWithOtp({String? email, String? phone});
  Future<void> verifyOtp(String code);
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

  @override
  Future<void> signInWithOtp({String? email, String? phone}) async {}

  @override
  Future<void> verifyOtp(String code) async {}

  @override
  Future<void> signOut() async {
    _user = null;
    _controller.add(null);
  }
}

final authServiceProvider = Provider<AuthService>((ref) => LocalAuthService());

final authStateProvider =
    StreamProvider<AuthUser?>((ref) => ref.watch(authServiceProvider).authStateChanges());
