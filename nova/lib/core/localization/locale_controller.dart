import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Текущая локаль приложения. `null` — следовать системной.
/// Меняется из настроек: `ref.read(localeProvider.notifier).state = const Locale('en')`.
final localeProvider = StateProvider<Locale?>((ref) => null);
