import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../design/theme.dart';
import 'router.dart';

class NovaApp extends StatelessWidget {
  const NovaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Nova',
      debugShowCheckedModeBanner: false,
      theme: buildNovaTheme(Brightness.light),
      darkTheme: buildNovaTheme(Brightness.dark),
      themeMode: ThemeMode.system, // обе темы первого класса
      routerConfig: appRouter,
      supportedLocales: const [Locale('ru'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}
