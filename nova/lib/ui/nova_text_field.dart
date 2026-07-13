import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Поле ввода Nova: опциональная подпись, фокус-кольцо акцентом, из токенов.
class NovaTextField extends StatelessWidget {
  const NovaTextField({
    super.key,
    this.label,
    this.hint,
    this.controller,
    this.keyboardType,
    this.obscureText = false,
    this.prefixIcon,
    this.onChanged,
    this.autofocus = false,
    this.textInputAction,
  });

  final String? label;
  final String? hint;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final bool obscureText;
  final IconData? prefixIcon;
  final ValueChanged<String>? onChanged;
  final bool autofocus;
  final TextInputAction? textInputAction;

  OutlineInputBorder _border(Color color, {double width = 1}) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.sm),
        borderSide: BorderSide(color: color, width: width),
      );

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!, style: AppTypography.label(nova.ink2)),
          const SizedBox(height: Spacing.s2),
        ],
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          autofocus: autofocus,
          onChanged: onChanged,
          textInputAction: textInputAction,
          style: AppTypography.body(nova.ink),
          cursorColor: nova.accent,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: AppTypography.body(nova.ink3),
            prefixIcon: prefixIcon == null
                ? null
                : Icon(prefixIcon, size: 20, color: nova.ink3),
            filled: true,
            fillColor: nova.surface,
            contentPadding: const EdgeInsets.symmetric(
                horizontal: Spacing.s4, vertical: 14),
            enabledBorder: _border(nova.line2),
            border: _border(nova.line2),
            focusedBorder: _border(nova.accent, width: 1.5),
          ),
        ),
      ],
    );
  }
}
