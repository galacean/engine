import type { RiverMaterialConfig, RiverSurfaceMotionConfig } from "../../../authoring/river/RiverAuthoringTypes";
import type { RiverExampleView } from "../types";

/** Presentation tuning for the single downhill river; these values do not enter runtime-wide presets. */
export const CURVED_MAIN_RIVER_VIEW = {
  cameraPosition: [52, 11.5, 25],
  cameraTarget: [4.5, 7, 6],
  backgroundColor: [0.05, 0.08, 0.08, 1],
  showWorldAxes: false
} satisfies RiverExampleView;

/** Heightfield-inspired mountain water: short coherent ripples over flow-readable micro detail. */
export const CURVED_MAIN_RIVER_SURFACE_MOTION = {
  seed: 27491,
  displacementAmplitude: 0.18,
  displacementLengthScale: 1.2,
  shoreDampingWidth: 0.78,
  turbulence: 0.58,
  crestIntensity: 0.88,
  microNormalStrength: 1.25
} satisfies RiverSurfaceMotionConfig;

export const CURVED_MAIN_RIVER_MATERIAL_TUNING = {
  baseColor: "#087985",
  foamColor: "#eaf8f7",
  foamIntensity: 0.82,
  clarity: 0.9
} satisfies Pick<RiverMaterialConfig, "baseColor" | "foamColor" | "foamIntensity" | "clarity">;
