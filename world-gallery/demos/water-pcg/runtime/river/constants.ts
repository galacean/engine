/** Shader bindings and render offsets owned by the river runtime. */
export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  noiseTexture: "material_NoiseTexture"
} as const;

/** Low-tier transparency keeps the mobile baseline free of scene-texture dependencies. */
export const RIVER_LOW_OPTICAL_SHADER_TUNING = {
  opaqueWaterAlpha: 0.58,
  clearWaterAlpha: 0.18,
  foamAlphaWeight: 0.3,
  maxAlpha: 0.8
} as const;

/** Medium-tier depth absorption; this tier is opt-in because it requires a camera depth pre-pass. */
export const RIVER_MEDIUM_OPTICAL_SHADER_TUNING = {
  opaqueAbsorption: 0.52,
  clearAbsorption: 0.08,
  maxOpticalDepth: 4,
  minimumAlpha: 0.05,
  maximumAlpha: 0.82,
  foamAlphaWeight: 0.16,
  scatterAlphaWeight: 0.02
} as const;

/** Medium/high single-pass shoreline foam animation tuning. */
export const RIVER_SHORE_FOAM_SHADER_TUNING = {
  noiseCutoffStart: 0.38,
  noiseCutoffEnd: 0.68,
  detailBase: 0.02,
  detailNoiseWeight: 0.98,
  detailCutoffStart: 0.08,
  detailCutoffEnd: 0.44,
  maskSmoothness: 0.58,
  surfaceFoamWeight: 0.45,
  maxCoverage: 0.58,
  foamColorMix: 0.68,
  waterColorBrightness: 1.12,
  foamBrightness: 0.9,
  foamNoiseBrightness: 0.08,
  tintBase: 0.52,
  tintClarityWeight: 0.16
} as const;

export const RIVER_QUERY_NO_SOURCE_INDEX = -1;
export const RIVER_QUERY_NO_SOURCE_KIND = 255;
export const RIVER_QUERY_EPSILON = 1e-6;
export const RIVER_RESOURCE_SUBMISSION_BUDGET_MS = 4;
