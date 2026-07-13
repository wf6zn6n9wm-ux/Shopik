import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Единый премиальный bottom sheet: скруглённый верх, grabber, безопасные
/// отступы, учёт клавиатуры. Все модалки создания идут через него.
Future<T?> showNovaSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  bool isScrollControlled = true,
}) {
  final nova = context.nova;
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: nova.surface,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.xl)),
    ),
    builder: builder,
  );
}

/// Каркас содержимого листа: заголовок + прокручиваемое тело с отступами.
class NovaSheet extends StatelessWidget {
  const NovaSheet({super.key, required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Padding(
      padding: EdgeInsets.only(
        left: Spacing.s5,
        right: Spacing.s5,
        bottom: MediaQuery.of(context).viewInsets.bottom + Spacing.s6,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTypography.title2(nova.ink)),
          const SizedBox(height: Spacing.s4),
          Flexible(child: SingleChildScrollView(child: child)),
        ],
      ),
    );
  }
}
