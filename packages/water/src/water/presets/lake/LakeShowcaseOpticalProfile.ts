import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";

export const LAKE_SHOWCASE_OPTICAL_PROFILE: WaterOpticalProfile = Object.freeze({
  ...DEFAULT_WATER_OPTICAL_PROFILE,
  // Use the physical air-to-water interface. F0 is derived from this IOR
  // instead of inheriting a generic dielectric 0.04 override.
  indexOfRefraction: 1.333,
  refractionStrength: 0.05,
  // The two resolved ripple-normal layers own the visible water-slope distribution. Keep this base term limited to
  // unresolved microfacets so point-like environment radiance remains as wave-shaped glints instead of being blurred
  // a second time by the GGX IBL lookup.
  roughness: 0.02,
  reflectionIntensity: 1
});
