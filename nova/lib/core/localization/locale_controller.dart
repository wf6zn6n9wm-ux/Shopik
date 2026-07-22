import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Поточна локаль застосунку. Дефолт — українська (ринок України).
/// Змінюється з налаштувань: Українська / English / Русский.
final localeProvider = StateProvider<Locale?>((ref) => const Locale('uk'));
