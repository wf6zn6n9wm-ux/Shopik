import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design/theme.dart';

/// Поле ввода Kavio: опциональная подпись, фокус-кольцо акцентом, из токенов.
class KavioTextField extends StatelessWidget {
  const KavioTextField({
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
    this.inputFormatters,
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
  final List<TextInputFormatter>? inputFormatters;

  OutlineInputBorder _border(Color color, {double width = 1}) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.sm),
        borderSide: BorderSide(color: color, width: width),
      );

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!, style: AppTypography.label(kavio.ink2)),
          const SizedBox(height: Spacing.s2),
        ],
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          autofocus: autofocus,
          onChanged: onChanged,
          textInputAction: textInputAction,
          inputFormatters: inputFormatters,
          style: AppTypography.body(kavio.ink),
          cursorColor: kavio.accent,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: AppTypography.body(kavio.ink3),
            prefixIcon: prefixIcon == null
                ? null
                : Icon(prefixIcon, size: 20, color: kavio.ink3),
            filled: true,
            fillColor: kavio.surface,
            contentPadding: const EdgeInsets.symmetric(
                horizontal: Spacing.s4, vertical: 14),
            enabledBorder: _border(kavio.line2),
            border: _border(kavio.line2),
            focusedBorder: _border(kavio.accent, width: 1.5),
          ),
        ),
      ],
    );
  }
}
