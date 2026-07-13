import 'package:flutter/material.dart';

import 'colors.dart';
import 'typography.dart';

export 'colors.dart';
export 'tokens.dart';
export 'typography.dart';

/// Доступ к токенам из контекста: `context.kavio.accent`, `context.shadows.e1`.
extension KavioContext on BuildContext {
  KavioColors get kavio => Theme.of(this).extension<KavioColors>()!;
  KavioShadows get shadows => Theme.of(this).extension<KavioShadows>()!;
}

ThemeData buildKavioTheme(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  final c = isDark ? KavioColors.dark : KavioColors.light;
  final shadows = isDark ? KavioShadows.dark : KavioShadows.light;

  final textTheme = TextTheme(
    displaySmall: AppTypography.display(c.ink),
    headlineMedium: AppTypography.title1(c.ink),
    titleLarge: AppTypography.title2(c.ink),
    titleMedium: AppTypography.title3(c.ink),
    bodyMedium: AppTypography.body(c.ink),
    labelLarge: AppTypography.label(c.ink),
    labelSmall: AppTypography.caption(c.ink2),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    scaffoldBackgroundColor: c.canvas,
    canvasColor: c.canvas,
    splashFactory: InkSparkle.splashFactory,
    colorScheme: ColorScheme.fromSeed(
      seedColor: c.accent,
      brightness: brightness,
    ).copyWith(
      primary: c.accent,
      onPrimary: c.onAccent,
      secondary: c.accent,
      onSecondary: c.onAccent,
      surface: c.surface,
      onSurface: c.ink,
      error: c.danger,
      onError: c.onAccent,
    ),
    textTheme: textTheme,
    extensions: [c, shadows],
  );
}
