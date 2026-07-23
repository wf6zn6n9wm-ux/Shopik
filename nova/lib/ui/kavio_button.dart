import 'package:flutter/material.dart';

import '../design/theme.dart';

enum KavioButtonKind { primary, secondary, ghost, danger }

/// Кнопка Kavio. Press — scale 0.97. Состояния и размеры — из токенов.
class KavioButton extends StatefulWidget {
  const KavioButton(
    this.label, {
    super.key,
    this.onPressed,
    this.kind = KavioButtonKind.primary,
    this.small = false,
    this.icon,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final KavioButtonKind kind;
  final bool small;
  final IconData? icon;
  final bool expand;

  @override
  State<KavioButton> createState() => _KavioButtonState();
}

class _KavioButtonState extends State<KavioButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final kavio = context.kavio;
    final enabled = widget.onPressed != null;

    final (bg, fg, border) = switch (widget.kind) {
      KavioButtonKind.primary => (kavio.accent, kavio.onAccent, null),
      KavioButtonKind.secondary => (kavio.surface, kavio.ink, kavio.line2),
      KavioButtonKind.ghost => (Colors.transparent, kavio.accent, null),
      KavioButtonKind.danger => (kavio.dangerTint, kavio.danger, null),
    };

    final pad = widget.small
        ? const EdgeInsets.symmetric(horizontal: 13, vertical: 8)
        : const EdgeInsets.symmetric(horizontal: 18, vertical: 11);

    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: GestureDetector(
        onTapDown: enabled ? (_) => setState(() => _down = true) : null,
        onTapCancel: () => setState(() => _down = false),
        onTapUp: (_) => setState(() => _down = false),
        onTap: widget.onPressed,
        child: AnimatedScale(
          scale: _down ? 0.97 : 1,
          duration: Motion.instant,
          curve: Motion.enter,
          child: Container(
            padding: pad,
            decoration: BoxDecoration(
              color: bg,
              borderRadius:
                  BorderRadius.circular(widget.small ? Radii.xs : Radii.sm),
              border: border == null ? null : Border.all(color: border),
              boxShadow: widget.kind == KavioButtonKind.primary
                  ? context.shadows.e1
                  : null,
            ),
            child: Row(
              mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (widget.icon != null) ...[
                  Icon(widget.icon, size: widget.small ? 16 : 18, color: fg),
                  const SizedBox(width: Spacing.s2),
                ],
                Text(
                  widget.label,
                  style: AppTypography.label(fg).copyWith(
                    fontWeight: FontWeight.w600,
                    fontSize: widget.small ? 13 : 14,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
