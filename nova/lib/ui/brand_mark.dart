import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Знак бренда Nova: скруглённый акцентный квадрат с точкой.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 44});

  final double size;

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: nova.accent,
        borderRadius: BorderRadius.circular(size * 0.32),
        boxShadow: context.shadows.e1,
      ),
      child: Align(
        alignment: const Alignment(0.35, -0.35),
        child: Container(
          width: size * 0.24,
          height: size * 0.24,
          decoration: BoxDecoration(color: nova.onAccent, shape: BoxShape.circle),
        ),
      ),
    );
  }
}
