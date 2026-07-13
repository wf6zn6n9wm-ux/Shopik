import 'package:flutter/material.dart';

import '../design/theme.dart';

enum NovaButtonKind { primary, secondary, ghost, danger }

/// Кнопка Nova. Press — scale 0.97. Состояния и размеры — из токенов.
class NovaButton extends StatefulWidget {
  const NovaButton(
    this.label, {
    super.key,
    this.onPressed,
    this.kind = NovaButtonKind.primary,
    this.small = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final NovaButtonKind kind;
  final bool small;
  final IconData? icon;

  @override
  State<NovaButton> createState() => _NovaButtonState();
}

class _NovaButtonState extends State<NovaButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final enabled = widget.onPressed != null;

    final (bg, fg, border) = switch (widget.kind) {
      NovaButtonKind.primary => (nova.accent, nova.onAccent, null),
      NovaButtonKind.secondary => (nova.surface, nova.ink, nova.line2),
      NovaButtonKind.ghost => (Colors.transparent, nova.accent, null),
      NovaButtonKind.danger => (nova.dangerTint, nova.danger, null),
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
              boxShadow: widget.kind == NovaButtonKind.primary
                  ? context.shadows.e1
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.icon != null) ...[
                  Icon(widget.icon, size: widget.small ? 16 : 18, color: fg),
                  const SizedBox(width: 8),
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
