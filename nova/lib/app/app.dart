import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildKavioTheme(Brightness.light),
      darkTheme: buildKavioTheme(Brightness.dark),
      themeMode: ThemeMode.system, // обе темы первого класса
      locale: locale, // null → системная
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      routerConfig: appRouter,
    );
  }
}
