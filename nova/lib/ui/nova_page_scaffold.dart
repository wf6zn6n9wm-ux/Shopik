import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/theme.dart';

/// Каркас pushed-страницы: назад-шеврон + заголовок + тело. Премиально и без
/// тяжёлого AppBar. Используется всеми экранами вне нижней навигации.
class NovaPageScaffold extends StatelessWidget {
  const NovaPageScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions,
  });

  final String title;
  final Widget body;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Spacing.s3, Spacing.s2, Spacing.s3, 0),
              child: Row(
                children: [
                  if (context.canPop())
                    IconButton(
                      onPressed: context.pop,
                      icon: Icon(Icons.arrow_back_ios_new, size: 18, color: nova.ink),
                      splashRadius: 22,
                    ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: Spacing.s2),
                      child: Text(title, style: AppTypography.title3(nova.ink)),
                    ),
                  ),
                  if (actions != null) ...actions!,
                ],
              ),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}
