/** Full coverage at/below start, no coverage at/above end. Distances and thresholds use the same world units. */
export function surfaceTransitionWeight(distance: number, start: number, end: number): number {
  const t = Math.max(0, Math.min(1, (distance - start) / (end - start)));
  return 1 - t * t * t * (t * (t * 6 - 15) + 10);
}
