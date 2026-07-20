import type { RiverMaterialConfig, RiverSurfaceMotionConfig } from "../../../authoring/river/RiverAuthoringTypes";
import type { RiverExampleView } from "../types";

/** Presentation tuning for the single downhill river; these values do not enter runtime-wide presets. */
export const CURVED_MAIN_RIVER_VIEW = {
  cameraPosition: [-34, 35, 58],
  cameraTarget: [0, 4.5, 0],
  backgroundColor: [0.05, 0.08, 0.08, 1],
  showWorldAxes: false
} satisfies RiverExampleView;

/** Heightfield-inspired mountain water: restrained macro shape with flow-readable micro detail. */
export const CURVED_MAIN_RIVER_SURFACE_MOTION = {
  seed: 27491,
  displacementAmplitude: 0.18,
  displacementLengthScale: 4.2,
  shoreDampingWidth: 1.15,
  turbulence: 0.82,
  crestIntensity: 0.9,
  microNormalStrength: 1.08
} satisfies RiverSurfaceMotionConfig;

export const CURVED_MAIN_RIVER_MATERIAL_TUNING = {
  baseColor: "#0a5b69",
  foamColor: "#d8eef0",
  foamIntensity: 0.72,
  clarity: 0.68
} satisfies Pick<RiverMaterialConfig, "baseColor" | "foamColor" | "foamIntensity" | "clarity">;
