import type { SeedWorldCameraBookmark } from "@galacean/engine-world-planning/world/SeedWorldCameraBookmark";
import type { SeedWorldPopulationInstance, SeedWorldPopulationPreview } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";

/** Composite-seed context retained by the presentation-camera API. */
export interface SeedWorldPresentationCameraSeed {
  readonly geology: number;
  readonly hydrology: number;
}

/** Radius of the one temporary ecological tree zone around the selected spawn. */
export const SEED_WORLD_SPAWN_TREE_RADIUS_WORLD_RATIO = 1 / 6;

/**
 * Retains an authored presentation camera's horizontal framing and view direction while
 * grounding its Y coordinate at the requested physical eye height.
 */
export function groundSeedWorldPresentationCameraBookmark(
  bookmark: SeedWorldCameraBookmark,
  navigationSurfaceMetres: number,
  groundClearanceMetres: number
): SeedWorldCameraBookmark {
  if (!Number.isFinite(navigationSurfaceMetres)) {
    throw new RangeError("Seed World presentation camera navigation surface must be finite");
  }
  if (!Number.isFinite(groundClearanceMetres) || groundClearanceMetres <= 0) {
    throw new RangeError("Seed World presentation camera ground clearance must be finite and positive");
  }
  return Object.freeze({
    ...bookmark,
    position: Object.freeze([
      bookmark.position[0],
      navigationSurfaceMetres + groundClearanceMetres,
      bookmark.position[2]
    ] as const)
  });
}

/**
 * Resolves the initial visible camera without changing procedural spawn selection.
 * Camera continuity and an explicit bookmark remain authoritative; otherwise the caller
 * uses the generated spawn. No world seed has a hard-coded presentation camera.
 */
export function resolveSeedWorldPresentationCameraBookmark(
  _seed: SeedWorldPresentationCameraSeed,
  continuityBookmark?: SeedWorldCameraBookmark,
  requestedBookmark?: SeedWorldCameraBookmark
): SeedWorldCameraBookmark | undefined {
  return continuityBookmark ?? requestedBookmark;
}

/**
 * Restricts optional presentation-only population materialization to the opening camera's horizontal frustum.
 * The result is immutable and camera-static: moving the runtime camera never creates trees elsewhere.
 */
export function filterSeedWorldPopulationToPresentationView(
  instances: readonly SeedWorldPopulationInstance[],
  worldSizeMetres: number,
  bookmark: SeedWorldCameraBookmark,
  verticalFieldOfViewDegrees: number,
  aspectRatio: number
): readonly SeedWorldPopulationInstance[] {
  if (!(worldSizeMetres > 0) || !Number.isFinite(worldSizeMetres)) {
    throw new RangeError("Seed World presentation population requires a finite positive world size");
  }
  if (!(verticalFieldOfViewDegrees > 0 && verticalFieldOfViewDegrees < 180)) {
    throw new RangeError("Seed World presentation population requires a field of view between zero and 180 degrees");
  }
  if (!(aspectRatio > 0) || !Number.isFinite(aspectRatio)) {
    throw new RangeError("Seed World presentation population requires a finite positive aspect ratio");
  }
  const yawRadians = (bookmark.yawDegrees * Math.PI) / 180;
  const forwardX = Math.sin(yawRadians);
  const forwardZ = Math.cos(yawRadians);
  const halfVerticalRadians = (verticalFieldOfViewDegrees * Math.PI) / 360;
  const halfHorizontalRadians = Math.atan(Math.tan(halfVerticalRadians) * aspectRatio);
  return Object.freeze(
    instances.filter((instance) => {
      const worldX = (instance.normalizedPosition.x - 0.5) * worldSizeMetres;
      const worldZ = (instance.normalizedPosition.y - 0.5) * worldSizeMetres;
      const offsetX = worldX - bookmark.position[0];
      const offsetZ = worldZ - bookmark.position[2];
      const forwardDistance = offsetX * forwardX + offsetZ * forwardZ;
      if (forwardDistance <= 0) return false;
      const sideDistance = offsetX * forwardZ - offsetZ * forwardX;
      return Math.abs(Math.atan2(sideDistance, forwardDistance)) <= halfHorizontalRadians;
    })
  );
}

/** Keeps shrubs and dense fields unchanged while publishing only trees inside the opening view. */
export function filterSeedWorldPopulationPreviewToPresentationView(
  preview: SeedWorldPopulationPreview,
  worldSizeMetres: number,
  bookmark: SeedWorldCameraBookmark,
  verticalFieldOfViewDegrees: number,
  aspectRatio: number
): SeedWorldPopulationPreview {
  const visibleTreeIds = new Set(
    filterSeedWorldPopulationToPresentationView(
      preview.treeInstances.filter(({ category }) => category === "tree"),
      worldSizeMetres,
      bookmark,
      verticalFieldOfViewDegrees,
      aspectRatio
    ).map(({ id }) => id)
  );
  const treeInstances = Object.freeze(
    preview.treeInstances.filter((instance) => instance.category !== "tree" || visibleTreeIds.has(instance.id))
  );
  if (treeInstances.length === preview.treeInstances.length) return preview;
  let hash = mixPresentationPopulationHash(preview.hash, "opening-view/v1");
  for (const instance of treeInstances) hash = mixPresentationPopulationHash(hash, instance.id);
  return Object.freeze({ ...preview, treeInstances, hash });
}

/** Keeps ordinary ecological trees only in one world-scaled circular neighbourhood around the spawn. */
export function filterSeedWorldPopulationToSpawnNeighborhood(
  instances: readonly SeedWorldPopulationInstance[],
  worldSizeMetres: number,
  spawnPosition: Readonly<{ x: number; z: number }>
): readonly SeedWorldPopulationInstance[] {
  if (!(worldSizeMetres > 0) || !Number.isFinite(worldSizeMetres)) {
    throw new RangeError("Seed World spawn population requires a finite positive world size");
  }
  if (!Number.isFinite(spawnPosition.x) || !Number.isFinite(spawnPosition.z)) {
    throw new RangeError("Seed World spawn population requires a finite spawn position");
  }
  const radiusMetres = worldSizeMetres * SEED_WORLD_SPAWN_TREE_RADIUS_WORLD_RATIO;
  const radiusSquared = radiusMetres * radiusMetres;
  return Object.freeze(
    instances.filter((instance) => {
      const worldX = (instance.normalizedPosition.x - 0.5) * worldSizeMetres;
      const worldZ = (instance.normalizedPosition.y - 0.5) * worldSizeMetres;
      const offsetX = worldX - spawnPosition.x;
      const offsetZ = worldZ - spawnPosition.z;
      return offsetX * offsetX + offsetZ * offsetZ <= radiusSquared;
    })
  );
}

/** Keeps shrubs and dense fields unchanged while restricting terrain-grounded trees to the spawn zone. */
export function filterSeedWorldPopulationPreviewToSpawnNeighborhood(
  preview: SeedWorldPopulationPreview,
  worldSizeMetres: number,
  spawnPosition: Readonly<{ x: number; z: number }>
): SeedWorldPopulationPreview {
  const retainedTreeIds = new Set(
    filterSeedWorldPopulationToSpawnNeighborhood(
      preview.treeInstances.filter(({ category }) => category === "tree"),
      worldSizeMetres,
      spawnPosition
    ).map(({ id }) => id)
  );
  const treeInstances = Object.freeze(
    preview.treeInstances.filter((instance) => instance.category !== "tree" || retainedTreeIds.has(instance.id))
  );
  if (treeInstances.length === preview.treeInstances.length) return preview;
  let hash = mixPresentationPopulationHash(preview.hash, "spawn-neighborhood/v1");
  for (const instance of treeInstances) hash = mixPresentationPopulationHash(hash, instance.id);
  return Object.freeze({ ...preview, treeInstances, hash });
}

function mixPresentationPopulationHash(seed: number, value: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}
