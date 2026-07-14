/** Shader bindings and render offsets owned by the river runtime. */
export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  noiseTexture: "material_NoiseTexture",
  surfaceNormalTexture: "material_SurfaceNormalTexture",
  surfaceSeed: "material_SurfaceSeed",
  surfaceMaxDisplacement: "material_SurfaceMaxDisplacement",
  surfaceLengthScale: "material_SurfaceLengthScale",
  shoreDampingWidth: "material_ShoreDampingWidth",
  surfaceTurbulence: "material_SurfaceTurbulence",
  crestIntensity: "material_CrestIntensity",
  microNormalStrength: "material_MicroNormalStrength",
  surfaceDebugMode: "material_SurfaceDebugMode",
  macroDisplacementEnabled: "material_MacroDisplacementEnabled",
  microSurfaceEnabled: "material_MicroSurfaceEnabled",
  surfaceTimeOverride: "material_SurfaceTimeOverride",
  localMapTexture: "material_LocalMapTexture",
  localMapWorldToUv: "renderer_LocalMapWorldToUv",
  localMapUvRect: "renderer_LocalMapUvRect",
  localMapConfluence: "renderer_LocalMapConfluence"
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

export const RIVER_SURFACE_NORMAL_TEXTURE = {
  size: 64,
  gradientStrength: 5.4,
  firstCellCount: 4,
  secondCellCount: 9,
  thirdCellCount: 17,
  firstWeight: 0.55,
  secondWeight: 0.29,
  thirdWeight: 0.16
} as const;

export const RIVER_SURFACE_NORMAL_TEXTURE_RANDOM = {
  initialState: 0x12345678,
  multiplier: 1664525,
  increment: 1013904223,
  firstSeed: 11,
  secondSeed: 29,
  thirdSeed: 47,
  auxiliarySeedOffset: 73
} as const;

export const RIVER_SURFACE_SHADER_TUNING = {
  phaseRate: 0.085,
  phaseTravel: 1.35,
  microScaleA: 0.17,
  microScaleB: 0.39,
  microOffsetA: 7.13,
  microOffsetB: 19.47,
  phaseUvOffset: [0.37, 0.61] as const,
  microWorldOffset: [11.3, 6.7] as const,
  microBlendWeights: [0.62, 0.38] as const,
  crestRidgeScale: 1.73,
  crestErosionScale: 3.17,
  crestNoiseOffset: [5.7, 13.4] as const,
  erosionNoiseOffset: [23.9, 4.6] as const,
  crestStart: 0.58,
  crestEnd: 0.84,
  erosionStart: 0.33,
  erosionEnd: 0.7,
  crestCurvatureStep: 0.13,
  crestCurvatureGain: 4.2,
  shoreFoamWidthScale: 1.25,
  shoreFoamWeight: 0.42,
  crestFoamWeight: 0.56,
  localFoamWeight: 0.9,
  foamBaseWeight: 0.35,
  foamCurvatureWeight: 0.65,
  obstacleEdgeWidth: 0.16,
  obstacleEdgeFoamWeight: 0.25,
  confluenceInteriorBlendWidth: 0.12,
  confluenceFlowBlendWeight: 0.32,
  confluenceFoamWeight: 0.38,
  fresnelPower: 3,
  fresnelWeight: 0.16,
  glintWeight: 0.2,
  glintPower: 18,
  lightDirection: [-0.34, 0.82, 0.46] as const,
  waterBrightness: 0.84,
  clarityBrightness: 0.13,
  macroHeightBrightness: 0.18,
  clearWaterTint: [0, 0.035, 0.07] as const,
  fresnelTint: [0.12, 0.2, 0.26] as const
} as const;

export const RIVER_SURFACE_TEXTURE_SAMPLE_COUNT = {
  low: 1,
  regular: 5,
  localMap: 6
} as const;
