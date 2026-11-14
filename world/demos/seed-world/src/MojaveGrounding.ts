/** Fit the exposed part of a bottom-centred prefab to the authored vertical envelope.
 * Burial belongs to the source asset; all LODs share the same fit. The hidden base
 * extends below the already grounded envelope, while its visible top and collision
 * envelope remain at baseHeight + exposedHeight.
 */
export function fitGroundedPrefabHeight(
  baseHeight: number,
  exposedHeight: number,
  sourceHeight: number,
  buriedFraction: number
): { bottom: number; scaleY: number } {
  if (![baseHeight, exposedHeight, sourceHeight, buriedFraction].every(Number.isFinite) ||
      exposedHeight <= 0 || sourceHeight <= 0 || buriedFraction < 0 || buriedFraction >= 1)
    throw new Error("Invalid grounded prefab dimensions");
  const fullHeight = exposedHeight / (1 - buriedFraction);
  return { bottom: baseHeight - fullHeight * buriedFraction, scaleY: fullHeight / sourceHeight };
}

/** Uniform contain fit of a bottom-centred prefab into an exposed OBB envelope.
 * @param baseHeight Grounded bottom of the visible envelope.
 * @param envelope Available width, exposed height and depth in metres.
 * @param source Original model bounds width, height and depth in metres.
 * @param buriedFraction Fraction of full model height below ground.
 * @returns Shared XYZ scale and bottom of the buried model bounds.
 */
export function fitContainedPrefab(
  baseHeight: number,
  envelope: readonly [number, number, number],
  source: readonly [number, number, number],
  buriedFraction: number
): { bottom: number; scale: number } {
  if (!Number.isFinite(baseHeight) ||
      ![...envelope, ...source].every(value => Number.isFinite(value) && value > 0) ||
      !Number.isFinite(buriedFraction) || buriedFraction < 0 || buriedFraction >= 1)
    throw new Error("Invalid contained prefab dimensions");
  const scale = Math.min(envelope[0] / source[0], envelope[1] / (source[1] * (1 - buriedFraction)), envelope[2] / source[2]);
  return { scale, bottom: baseHeight - source[1] * scale * buriedFraction };
}
