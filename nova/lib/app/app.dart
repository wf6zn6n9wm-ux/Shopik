import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/boot_uri.dart';
import '../core/localization/app_text.dart';
import '../core/localization/locale_controller.dart';
import '../design/theme.dart';
import '../l10n/app_localizations.dart';
import 'router.dart';

/// AppLocalizations генерируется из lib/l10n/*.arb (flutter gen-l10n).
/// Делегаты и supportedLocales берутся из него — i18n подключён с первого дня.
class KavioApp extends ConsumerWidget {
  const KavioApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    // Мова: ?lang=en|ru|uk у URL (для знімків) має пріоритет, інакше — з локалі.
    final boot = _bootLang();
    final lang = boot ?? (locale?.languageCode ?? 'uk');
    gLang = lang; // синхронізуємо шар перекладу

    return MaterialApp.router(
      key: ValueKey('app-$lang'), // зміна мови перебудовує все дерево
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildKavioTheme(Brightness.dark),
      darkTheme: buildKavioTheme(Brightness.dark),
      themeMode: ThemeMode.dark, // Запис+ — тёмная тема как основа дизайна
      // Українська — жорсткий дефолт: ігноруємо мову системи/браузера, поки
      // користувач сам не змінить у Налаштуваннях.
      locale: Locale(lang),
      localeResolutionCallback: (deviceLocale, supported) {
        final chosen = locale ?? const Locale('uk');
        for (final l in supported) {
          if (l.languageCode == chosen.languageCode) return l;
        }
        return const Locale('uk');
      },
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      routerConfig: appRouter,
    );
  }

  /// Читає ?lang= з фрагмента, зафіксованого в main() до старту роутера.
  String? _bootLang() {
    final f = bootFragment;
    final qi = f.indexOf('?');
    if (qi < 0) return null;
    final v = Uri.splitQueryString(f.substring(qi + 1))['lang'];
    return (v == 'en' || v == 'ru' || v == 'uk') ? v : null;
  }
}
