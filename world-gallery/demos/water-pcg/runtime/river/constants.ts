/** Shader bindings and render offsets owned by the river runtime. */
export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  noiseTexture: "material_NoiseTexture"
} as const;

export const RIVER_RENDER_OFFSET = {
  surface: 0.04,
  bankFoam: 0.02
} as const;
