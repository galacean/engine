/** Engine-free River profile constraints shared by upstream authoring and Water validation. */
export function resolveContinuousRiverDownstreamHeight(
  upstreamHeight: number,
  requestedDownstreamHeight: number,
  horizontalLength: number,
  maximumSurfaceSlope: number
): number {
  if (
    ![upstreamHeight, requestedDownstreamHeight, horizontalLength, maximumSurfaceSlope].every(Number.isFinite) ||
    horizontalLength <= 0 ||
    maximumSurfaceSlope < 0
  ) {
    throw new RangeError("River Hydrology Resolver received invalid height, length, or slope input.");
  }
  const monotonicHeight = Math.min(upstreamHeight, requestedDownstreamHeight);
  return Math.max(monotonicHeight, upstreamHeight - horizontalLength * maximumSurfaceSlope);
}
