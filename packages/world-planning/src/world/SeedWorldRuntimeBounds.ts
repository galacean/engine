/** Neutral horizontal world-space rectangle shared by local runtime synchronization stages. */
export interface SeedWorldRuntimeBounds {
  readonly minimumX: number;
  readonly minimumZ: number;
  readonly maximumX: number;
  readonly maximumZ: number;
}

/**
 * Tests whether a stable semantic point may read Heightmap samples changed by one local transaction.
 * The dependency radius belongs to the placement algorithm; renderer bounds are deliberately excluded
 * because they are mutable output and do not describe which Heightmap samples produced the transform.
 */
export function seedWorldHorizontalHeightDependencyIntersects(
  normalizedPosition: Readonly<{ readonly x: number; readonly y: number }>,
  sizeMetres: number,
  dependencyRadiusMetres: number,
  dirtyBounds: SeedWorldRuntimeBounds
): boolean {
  if (!Number.isFinite(sizeMetres) || sizeMetres <= 0) {
    throw new RangeError("Seed World height dependency requires a finite positive world size");
  }
  if (!Number.isFinite(dependencyRadiusMetres) || dependencyRadiusMetres < 0) {
    throw new RangeError("Seed World height dependency radius must be finite and non-negative");
  }
  const worldX = (normalizedPosition.x - 0.5) * sizeMetres;
  const worldZ = (normalizedPosition.y - 0.5) * sizeMetres;
  const closestX = Math.min(dirtyBounds.maximumX, Math.max(dirtyBounds.minimumX, worldX));
  const closestZ = Math.min(dirtyBounds.maximumZ, Math.max(dirtyBounds.minimumZ, worldZ));
  return Math.hypot(worldX - closestX, worldZ - closestZ) <= dependencyRadiusMetres;
}
