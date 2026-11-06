/** Inputs that can make the Terrain free-water layer contribute screen-space reflection. */
export interface TerrainSurfaceWaterSsrDemandState {
  /** Current normalized rainfall rate published to the Terrain Shader. */
  readonly rainRate: number;
  /** Current normalized retained-water storage published to the Terrain Shader. */
  readonly puddles: number;
  /** Artist-authored preview storage added before hydrology masks are evaluated. */
  readonly puddleStorageBias: number;
  /** Presentation coverage multiplier applied after physical water coverage is resolved. */
  readonly coverageMultiplier: number;
  /** Reflection energy applied to the resolved free-water layer. */
  readonly reflectionIntensity: number;
  /** Maximum SSR share of the water reflection source. */
  readonly ssrMix: number;
}

// These thresholds deliberately sit below the Shader's first visible water-film response.
// The gate may keep SSR alive for a little longer than necessary, but must never turn it off
// while a visible free-water contribution remains. Separate thresholds avoid lease flapping
// at the end of weather transitions and hydrology drainage.
const TERRAIN_SURFACE_WATER_SSR_ACQUIRE_THRESHOLD = 1e-3;
const TERRAIN_SURFACE_WATER_SSR_RELEASE_THRESHOLD = 2.5e-4;
const TERRAIN_RAIN_TO_MAXIMUM_FILM_STORAGE = 0.48;

/**
 * Resolves the conservative camera-level SSR demand of Terrain rain film and retained water.
 * Persistent porous wetness is intentionally absent: it darkens the substrate but does not
 * create the free-water lobe rendered by the Terrain SSR receiver pass.
 */
export function terrainSurfaceWaterRequestsScreenSpaceReflection(
  state: Readonly<TerrainSurfaceWaterSsrDemandState>,
  currentlyRequested: boolean
): boolean {
  const rainFilmStorage = nonNegativeFinite(state.rainRate) * TERRAIN_RAIN_TO_MAXIMUM_FILM_STORAGE;
  const retainedWaterStorage = nonNegativeFinite(state.puddles) + nonNegativeFinite(state.puddleStorageBias);
  const possibleContribution =
    Math.max(rainFilmStorage, retainedWaterStorage) *
    nonNegativeFinite(state.coverageMultiplier) *
    nonNegativeFinite(state.reflectionIntensity) *
    nonNegativeFinite(state.ssrMix);
  return currentlyRequested
    ? possibleContribution > TERRAIN_SURFACE_WATER_SSR_RELEASE_THRESHOLD
    : possibleContribution >= TERRAIN_SURFACE_WATER_SSR_ACQUIRE_THRESHOLD;
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}
