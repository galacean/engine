import type { TerrainPostProcessProfile } from "./TerrainPostProcessRuntime";

/** Canonical Integrated World color grading, tonemapping, Bloom, and vignette presentation. */
export const INTEGRATED_WORLD_POST_PROCESS_PROFILE: Readonly<TerrainPostProcessProfile> = Object.freeze({
  postExposure: 1,
  temperature: 10,
  tint: 0,
  contrast: 35,
  saturation: 12,
  lift: Object.freeze([0.7612549663, 0.8959007263, 1, 0.0344827585] as const),
  gamma: Object.freeze([1, 1, 1, -0.0517241359] as const),
  gain: Object.freeze([1, 0.8780161738, 0.7695698738, 0] as const),
  bloomThreshold: 0.5,
  bloomIntensity: 0.35,
  bloomScatter: 0.6,
  vignetteCenter: Object.freeze([0.5, 0.5] as const),
  vignetteIntensity: 0.35,
  vignetteSmoothness: 0.2
});
