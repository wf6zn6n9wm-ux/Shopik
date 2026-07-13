import 'package:flutter/material.dart';

import 'colors.dart';
import 'typography.dart';

export 'colors.dart';
export 'tokens.dart';
export 'typography.dart';

/// Доступ к токенам из контекста: `context.nova.accent`, `context.shadows.e1`.
extension NovaContext on BuildContext {
  NovaColors get nova => Theme.of(this).extension<NovaColors>()!;
  NovaShadows get shadows => Theme.of(this).extension<NovaShadows>()!;
}

ThemeData buildNovaTheme(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  final c = isDark ? NovaColors.dark : NovaColors.light;
  final shadows = isDark ? NovaShadows.dark : NovaShadows.light;

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
