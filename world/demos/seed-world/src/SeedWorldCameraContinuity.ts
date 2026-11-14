import type { SeedWorldCameraBookmark } from "@galacean/engine-world-planning/world/SeedWorldCameraBookmark";

/** Presentation-only state required to keep the player's view stable across a same-world rebuild. */
export interface SeedWorldCameraContinuity {
  readonly bookmark: SeedWorldCameraBookmark;
  readonly heightAboveNavigationSurfaceMetres?: number;
}

export function captureSeedWorldCameraContinuity(
  bookmark: SeedWorldCameraBookmark,
  navigationSurfaceMetres?: number
): SeedWorldCameraContinuity {
  if (bookmark.mode !== "roam" || navigationSurfaceMetres === undefined) {
    return Object.freeze({ bookmark });
  }
  return Object.freeze({
    bookmark,
    heightAboveNavigationSurfaceMetres: bookmark.position[1] - navigationSurfaceMetres
  });
}

/**
 * Keeps horizontal position and view direction unchanged, while rebasing a roaming
 * camera's Y coordinate onto the rebuilt navigation surface.
 */
export function resolveSeedWorldCameraContinuity(
  continuity: SeedWorldCameraContinuity,
  navigationSurfaceMetres?: number
): SeedWorldCameraBookmark {
  const { bookmark, heightAboveNavigationSurfaceMetres } = continuity;
  if (
    bookmark.mode !== "roam" ||
    heightAboveNavigationSurfaceMetres === undefined ||
    navigationSurfaceMetres === undefined
  ) {
    return bookmark;
  }
  const [x, , z] = bookmark.position;
  return Object.freeze({
    ...bookmark,
    position: Object.freeze([x, navigationSurfaceMetres + heightAboveNavigationSurfaceMetres, z] as const)
  });
}
