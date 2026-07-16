/** Shader names, properties, and visual tuning for the first Ocean Gerstner path. */
export const WATER_WAVE_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  deepColor: "material_DeepColor",
  alpha: "material_Alpha",
  waterLevel: "material_WaterLevel",
  timeScale: "material_TimeScale",
  crestIntensity: "material_CrestIntensity",
  surfaceTimeOverride: "material_SurfaceTimeOverride",
  maxVerticalDisplacement: "material_MaxVerticalDisplacement",
  waveAPrefix: "material_WaveA",
  waveBPrefix: "material_WaveB"
} as const;

export const WATER_WAVE_SHADER_TUNING = {
  deepColorScale: 0.34,
  deepColorBlueLift: 0.08,
  horizonColorScale: 1.2,
  fresnelPower: 5,
  fresnelStrength: 0.38,
  diffuseFloor: 0.48,
  diffuseNormalWeight: 0.42,
  specularPower: 36,
  specularStrength: 0.68,
  crestTintStrength: 0.52,
  slopeContrast: 8,
  slopeDirectionalStrength: 0.36,
  minimumAlpha: 0.05,
  maximumAlpha: 1,
  lightDirection: [0.38, 0.86, 0.34] as const
} as const;
