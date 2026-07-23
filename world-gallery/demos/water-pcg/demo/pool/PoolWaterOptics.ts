import type { WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";

/** One immutable profile shared by the visible Pool surface and underwater post process. */
export const POOL_WATER_OPTICAL_PROFILE: WaterOpticalProfile = Object.freeze({
  absorptionCoefficient: Object.freeze([0.2, 0.075, 0.035] as const),
  scatteringColor: Object.freeze([0.045, 0.28, 0.34] as const),
  scatteringCoefficient: 0.18,
  maximumViewDistance: 32,
  indexOfRefraction: 1.333,
  maximumSurfaceOpticalDistance: 2.6,
  refractionStrength: 1,
  roughness: 0.12,
  reflectionIntensity: 0.72
});
