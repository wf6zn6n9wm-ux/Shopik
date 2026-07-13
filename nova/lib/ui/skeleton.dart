import 'package:flutter/material.dart';

import '../design/theme.dart';

/// Скелетоны вместо спиннеров: спокойная загрузка в тон дизайн-системе.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 4});
  final int count;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(
          Spacing.s5, Spacing.s2, Spacing.s5, Spacing.s16),
      itemCount: count,
      separatorBuilder: (_, __) => const SizedBox(height: Spacing.s2),
      itemBuilder: (_, __) => const _SkeletonRow(),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow();

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    return Container(
      height: 66,
      padding: const EdgeInsets.all(Spacing.s3),
      decoration: BoxDecoration(
        color: nova.surface,
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: nova.line),
      ),
      child: const Row(
        children: [
          _Shimmer(width: 40, height: 40, radius: 20),
          SizedBox(width: Spacing.s3),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _Shimmer(width: 140, height: 12, radius: 6),
              SizedBox(height: 8),
              _Shimmer(width: 90, height: 10, radius: 5),
            ],
          ),
        ],
      ),
    );
  }
}

class _Shimmer extends StatefulWidget {
  const _Shimmer(
      {required this.width, required this.height, required this.radius});
  final double width, height, radius;

  @override
  State<_Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<_Shimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1300))
    ..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final nova = context.nova;
    final reduce = MediaQuery.of(context).disableAnimations;
    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = reduce ? 0.5 : _c.value;
          return DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(widget.radius),
              gradient: LinearGradient(
                begin: Alignment(-1 + t * 2, 0),
                end: Alignment(1 + t * 2, 0),
                colors: [nova.surface2, nova.surface3, nova.surface2],
              ),
            ),
          );
        },
      ),
    );
  }
}
