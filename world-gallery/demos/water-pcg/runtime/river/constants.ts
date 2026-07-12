/** Shader bindings and render offsets owned by the river runtime. */
export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  noiseTexture: "material_NoiseTexture"
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
  tintClarityWeight: 0.16,
  waterAlphaWeight: 0.9,
  foamAlphaWeight: 0.015,
  scatterAlphaWeight: 0.03
} as const;

export const RIVER_QUERY_NO_SOURCE_INDEX = -1;
export const RIVER_QUERY_NO_SOURCE_KIND = 255;
export const RIVER_QUERY_EPSILON = 1e-6;
export const RIVER_RESOURCE_SUBMISSION_BUDGET_MS = 4;
