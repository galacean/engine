import type { TerrainLightingVisualTuning, TerrainTimeOfDayLightingSample } from "./TerrainLightingRuntime.ts";
import lightingProfile from "@galacean/engine-environment/terrain/lighting/IntegratedWorldLightingProfile.json";

export { INTEGRATED_WORLD_DEFAULT_TIME_HOURS } from "./TerrainLightingRuntime.ts";

/** Canonical daylight reference shared by Seed World acceptance and the isolated realtime-IBL chart. */
export const INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS = 12;

/** Canonical Integrated World render scale used outside focused terrain-only diagnostics. */
export const INTEGRATED_WORLD_RENDER_PIXEL_RATIO = 1.6;

/** Canonical serialized Integrated World observer pose reused by sky-only presentation cases. */
export const INTEGRATED_WORLD_CAMERA_POSE = Object.freeze({
  position: Object.freeze([1469.4699993133545, 26.538000106811523, 1765.5899963378906] as const),
  rotation: Object.freeze([0, 10.65999829585219, 0] as const)
});

/** Canonical profile asset, also referenced by native planning lighting components. */
export { INTEGRATED_WORLD_LIGHTING_PROFILE_URL } from "./TerrainLightingProfile.ts";

/** Compatibility exports for synchronous presentation entry points; JSON is the only authored source. */
export const INTEGRATED_WORLD_TIME_OF_DAY_LIGHTING_PROFILE: readonly TerrainTimeOfDayLightingSample[] = Object.freeze(
  lightingProfile.samples.map((sample) => Object.freeze(sample))
);
export const INTEGRATED_WORLD_DEFAULT_VISUAL_LIGHTING_TUNING: Readonly<Partial<TerrainLightingVisualTuning>> =
  Object.freeze(lightingProfile.visualTuning);
