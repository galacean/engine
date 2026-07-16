import type { RiverMaterialConfig, RiverSurfaceMotionConfig } from "../../../authoring/river/RiverAuthoringTypes";
import type { RiverExampleView } from "../types";

/** Presentation tuning for the single downhill river; these values do not enter runtime-wide presets. */
export const CURVED_MAIN_RIVER_VIEW = {
  cameraPosition: [-34, 35, 58],
  cameraTarget: [0, 4.5, 0],
  backgroundColor: [0.05, 0.08, 0.08, 1],
  showWorldAxes: false
} satisfies RiverExampleView;

/** Stronger but still bounded mountain-water motion, tuned for a mobile-friendly Medium shader path. */
export const CURVED_MAIN_RIVER_SURFACE_MOTION = {
  seed: 27491,
  displacementAmplitude: 0.42,
  displacementLengthScale: 2.8,
  shoreDampingWidth: 0.8,
  turbulence: 1.25,
  crestIntensity: 1.55,
  microNormalStrength: 0.85
} satisfies RiverSurfaceMotionConfig;

export const CURVED_MAIN_RIVER_MATERIAL_TUNING = {
  foamIntensity: 1,
  clarity: 0.68
} satisfies Pick<RiverMaterialConfig, "foamIntensity" | "clarity">;
