/** Shader bindings and render offsets owned by the river runtime. */
export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  noiseTexture: "material_NoiseTexture"
} as const;

export const RIVER_QUERY_NO_SOURCE_INDEX = -1;
export const RIVER_QUERY_NO_SOURCE_KIND = 255;
export const RIVER_QUERY_EPSILON = 1e-6;
export const RIVER_RESOURCE_SUBMISSION_BUDGET_MS = 4;
