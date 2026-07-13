import 'package:flutter/material.dart';

/// Цветовые токены Nova как ThemeExtension. Компоненты обращаются только к
/// токенам (`context.nova.accent`), никогда к hex напрямую.
/// Обе темы — первого класса, не инверсия: в dark акцент ярче, поверхности
/// расслаиваются осветлением.
@immutable
class NovaColors extends ThemeExtension<NovaColors> {
  const NovaColors({
    required this.canvas,
    required this.surface,
    required this.surface2,
    required this.surface3,
    required this.ink,
    required this.ink2,
    required this.ink3,
    required this.line,
    required this.line2,
    required this.accent,
    required this.accentPress,
    required this.accentTint,
    required this.onAccent,
    required this.success,
    required this.successTint,
    required this.warning,
    required this.warningTint,
    required this.danger,
    required this.dangerTint,
  });

  final Color canvas, surface, surface2, surface3;
  final Color ink, ink2, ink3;
  final Color line, line2;
  final Color accent, accentPress, accentTint, onAccent;
  final Color success, successTint;
  final Color warning, warningTint;
  final Color danger, dangerTint;

  static const NovaColors light = NovaColors(
    canvas: Color(0xFFFBFBFC),
    surface: Color(0xFFFFFFFF),
    surface2: Color(0xFFF4F4F7),
    surface3: Color(0xFFECECF1),
    ink: Color(0xFF16161A),
    ink2: Color(0xFF6A6A76),
    ink3: Color(0xFF9E9EAA),
    line: Color(0x14161628),
    line2: Color(0x24161628),
    accent: Color(0xFF5B5BD6),
    accentPress: Color(0xFF4A4AC4),
    accentTint: Color(0x1A5B5BD6),
    onAccent: Color(0xFFFFFFFF),
    success: Color(0xFF1F9D63),
    successTint: Color(0x1F1F9D63),
    warning: Color(0xFFC8890E),
    warningTint: Color(0x24C8890E),
    danger: Color(0xFFDC2F35),
    dangerTint: Color(0x1FDC2F35),
  );

  static const NovaColors dark = NovaColors(
    canvas: Color(0xFF0B0B0F),
    surface: Color(0xFF16161B),
    surface2: Color(0xFF1F1F26),
    surface3: Color(0xFF292930),
    ink: Color(0xFFF4F4F6),
    ink2: Color(0xFF9A9AA6),
    ink3: Color(0xFF6A6A76),
    line: Color(0x17FFFFFF),
    line2: Color(0x29FFFFFF),
    accent: Color(0xFF8B8BF0),
    accentPress: Color(0xFF7A7AE8),
    accentTint: Color(0x268B8BF0),
    onAccent: Color(0xFF0B0B0F),
    success: Color(0xFF3BD088),
    successTint: Color(0x263BD088),
    warning: Color(0xFFE0A93B),
    warningTint: Color(0x29E0A93B),
    danger: Color(0xFFF16A6F),
    dangerTint: Color(0x26F16A6F),
  );

  @override
  NovaColors copyWith({
    Color? canvas,
    Color? surface,
    Color? surface2,
    Color? surface3,
    Color? ink,
    Color? ink2,
    Color? ink3,
    Color? line,
    Color? line2,
    Color? accent,
    Color? accentPress,
    Color? accentTint,
    Color? onAccent,
    Color? success,
    Color? successTint,
    Color? warning,
    Color? warningTint,
    Color? danger,
    Color? dangerTint,
  }) {
    return NovaColors(
      canvas: canvas ?? this.canvas,
      surface: surface ?? this.surface,
      surface2: surface2 ?? this.surface2,
      surface3: surface3 ?? this.surface3,
      ink: ink ?? this.ink,
      ink2: ink2 ?? this.ink2,
      ink3: ink3 ?? this.ink3,
      line: line ?? this.line,
      line2: line2 ?? this.line2,
      accent: accent ?? this.accent,
      accentPress: accentPress ?? this.accentPress,
      accentTint: accentTint ?? this.accentTint,
      onAccent: onAccent ?? this.onAccent,
      success: success ?? this.success,
      successTint: successTint ?? this.successTint,
      warning: warning ?? this.warning,
      warningTint: warningTint ?? this.warningTint,
      danger: danger ?? this.danger,
      dangerTint: dangerTint ?? this.dangerTint,
    );
  }

  @override
  NovaColors lerp(covariant NovaColors? other, double t) {
    if (other == null) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return NovaColors(
      canvas: c(canvas, other.canvas),
      surface: c(surface, other.surface),
      surface2: c(surface2, other.surface2),
      surface3: c(surface3, other.surface3),
      ink: c(ink, other.ink),
      ink2: c(ink2, other.ink2),
      ink3: c(ink3, other.ink3),
      line: c(line, other.line),
      line2: c(line2, other.line2),
      accent: c(accent, other.accent),
      accentPress: c(accentPress, other.accentPress),
      accentTint: c(accentTint, other.accentTint),
      onAccent: c(onAccent, other.onAccent),
      success: c(success, other.success),
      successTint: c(successTint, other.successTint),
      warning: c(warning, other.warning),
      warningTint: c(warningTint, other.warningTint),
      danger: c(danger, other.danger),
      dangerTint: c(dangerTint, other.dangerTint),
    );
  }
}

/// Тени (elevation). Мягкие, низкоконтрастные — глубину даёт слой, а не драма.
@immutable
class NovaShadows extends ThemeExtension<NovaShadows> {
  const NovaShadows({required this.e1, required this.e2, required this.e3});

  final List<BoxShadow> e1, e2, e3;

  static const NovaShadows light = NovaShadows(
    e1: [
      BoxShadow(color: Color(0x0D14142D), blurRadius: 2, offset: Offset(0, 1)),
      BoxShadow(color: Color(0x0F14142D), blurRadius: 3, offset: Offset(0, 1)),
    ],
    e2: [BoxShadow(color: Color(0x1714142D), blurRadius: 14, offset: Offset(0, 4))],
    e3: [BoxShadow(color: Color(0x2414142D), blurRadius: 34, offset: Offset(0, 12))],
  );

  static const NovaShadows dark = NovaShadows(
    e1: [BoxShadow(color: Color(0x66000000), blurRadius: 2, offset: Offset(0, 1))],
    e2: [BoxShadow(color: Color(0x80000000), blurRadius: 18, offset: Offset(0, 6))],
    e3: [BoxShadow(color: Color(0x99000000), blurRadius: 40, offset: Offset(0, 16))],
  );

  @override
  NovaShadows copyWith({List<BoxShadow>? e1, List<BoxShadow>? e2, List<BoxShadow>? e3}) =>
      NovaShadows(e1: e1 ?? this.e1, e2: e2 ?? this.e2, e3: e3 ?? this.e3);

  @override
  NovaShadows lerp(covariant NovaShadows? other, double t) => t < 0.5 ? this : (other ?? this);
}
