/** Shader bindings and render offsets owned by the river runtime. */
export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  opacityScale: "material_OpacityScale",
  tintWeight: "material_TintWeight",
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
  opaqueAbsorption: [0.52, 0.24, 0.12] as const,
  clearAbsorption: [0.21, 0.085, 0.04] as const,
  opaqueAlphaAbsorption: 0.48,
  clearAlphaAbsorption: 0.1,
  shallowAlpha: 0.1,
  deepAlpha: 0.8,
  maxOpticalDepth: 4,
  authoredDepthEpsilon: 0.0001,
  minimumAlpha: 0.05,
  maximumAlpha: 0.82,
  foamAlphaWeight: 0.22,
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
  foamColorMix: 0.86,
  waterColorBrightness: 1.12,
  foamBrightness: 0.9,
  foamNoiseBrightness: 0.08,
  tintBase: 0.58,
  tintClarityWeight: 0.18
} as const;

export const RIVER_QUERY_NO_SOURCE_INDEX = -1;
export const RIVER_QUERY_NO_SOURCE_KIND = 255;
export const RIVER_QUERY_EPSILON = 1e-6;
export const RIVER_RESOURCE_SUBMISSION_BUDGET_MS = 4;

export const RIVER_SURFACE_NORMAL_TEXTURE = {
  size: 128,
  gradientStrength: 6.8,
  firstCellCount: 4,
  secondCellCount: 11,
  thirdCellCount: 23,
  firstWeight: 0.5,
  secondWeight: 0.32,
  thirdWeight: 0.18
} as const;

export const RIVER_SURFACE_NORMAL_TEXTURE_RANDOM = {
  initialState: 0x12345678,
  multiplier: 1664525,
  increment: 1013904223,
  firstSeed: 13,
  secondSeed: 37,
  thirdSeed: 71,
  auxiliarySeedOffset: 101
} as const;

export const RIVER_SURFACE_SHADER_TUNING = {
  timePeriodSeconds: 4096,
  phaseRate: 0.095,
  phaseTravel: 1.45,
  layerScales: [0.075, 0.19, 0.43] as const,
  layerRates: [0.72, 1, 1.48] as const,
  layerWeights: [0.48, 0.34, 0.18] as const,
  layerOffsets: [
    [0, 0],
    [0.37, 0.61],
    [0.73, 0.19]
  ] as const,
  layerCycleJumps: [
    [0.24, 0.2083333],
    [0.2, 0.25],
    [0.22, 0.27]
  ] as const,
  layerSpatialPhaseVectors: [
    [0.011, -0.007],
    [-0.006, 0.014],
    [0.009, 0.012]
  ] as const,
  microDetailLengthReference: 3.6,
  microDetailScaleMinimum: 0.72,
  microDetailScaleMaximum: 3,
  phaseBOffset: [0.5, 0.5] as const,
  maximumFlowSpeed: 2.4,
  flowingCycleRateBase: 0.54,
  flowingCycleRateSpeedScale: 0.82,
  flowingPhaseTravelBase: 0.48,
  flowingPhaseTravelSpeedScale: 0.78,
  minimumNormalStrength: 0.12,
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
  shoreFoamWidthScale: 1.8,
  shoreFoamPatchScale: 0.16,
  shoreFoamDriftRate: 0.18,
  shoreFoamPulseRate: 0.62,
  shoreFoamPulseWorldDirection: [0.52, 0.31] as const,
  shoreFoamOppositeBankPhase: 1.7,
  shoreFoamNoisePhase: 2.4,
  shoreFoamPatchStart: 0.42,
  shoreFoamPatchEnd: 0.68,
  shoreFoamLifeRate: 0.28,
  shoreFoamLifeStart: 0.18,
  shoreFoamLifeEnd: 0.72,
  shoreFoamLifeMinimum: 0.12,
  shoreFoamDetailMinimum: 0.38,
  shoreFoamWeight: 1.1,
  crestFoamWeight: 0.56,
  localFoamWeight: 1.25,
  foamBaseWeight: 0.42,
  foamCurvatureWeight: 0.58,
  obstacleEdgeWidth: 0.16,
  obstacleEdgeFoamWeight: 0.38,
  wakeNormalStrength: 1.25,
  wakeFlowBendStrength: 0.34,
  wakeFlowBendMinimum: 0.2,
  wakeFlowBendMaximum: 1.05,
  wakeLateralRippleStrength: 0.75,
  wakeTravelSpatialRate: 1.32,
  wakeTravelTimeRate: 0.82,
  wakeFlowSpeedTimeWeight: 0.32,
  wakeAlternatingSidePhase: 4.6,
  wakeNoiseScale: 0.42,
  wakeNoiseTimeRate: 0.2,
  wakeSheddingNoiseWeight: 0.3,
  wakeSheddingStart: 0.2,
  wakeSheddingEnd: 0.52,
  wakeRippleNoiseWeight: 0.24,
  wakeRippleOscillationWeight: 0.76,
  wakeSignalStart: 0.025,
  wakeSignalEnd: 0.38,
  wakeFoamBase: 0.45,
  shoreFoamTintBoost: 0.72,
  wakeFoamTintBoost: 0.8,
  obstacleEdgeTintBoost: 0.1,
  wakeFoamNoiseStart: 0.5,
  wakeFoamNoiseEnd: 0.72,
  confluenceInteriorBlendWidth: 0.12,
  confluenceFlowBlendWeight: 0.32,
  confluenceFoamWeight: 0.38,
  foamNoiseStart: 0.44,
  foamNoiseEnd: 0.7,
  currentFoamSpeedStart: 1.15,
  currentFoamSpeedEnd: 2.2,
  currentFoamNoiseStart: 0.68,
  currentFoamNoiseEnd: 0.87,
  fresnelF0: 0.022,
  fresnelPower: 5,
  broadSpecularPower: 32,
  tightSpecularPower: 128,
  lightDirection: [-0.34, 0.82, 0.46] as const,
  depthColorRate: 0.72,
  deepColorScale: 0.18,
  deepColorTint: [0.004, 0.032, 0.065] as const,
  deepColorTintWeight: 0.62,
  transmittedBrightnessDark: 0.78,
  transmittedBrightnessLight: 1.05,
  macroHeightBrightness: 0.08,
  skyReflectionDark: [0.075, 0.16, 0.21] as const,
  skyReflectionLight: [0.32, 0.48, 0.57] as const,
  reflectionWeight: 0.64,
  broadSpecularColor: [0.34, 0.42, 0.45] as const,
  broadSpecularWeight: 0.24,
  tightSpecularColor: [1, 0.96, 0.84] as const,
  tightSpecularWeight: 0.62,
  refractionUvScale: 0.01,
  refractionMix: 0.4,
  refractionDepthStart: 0.04,
  refractionDepthEnd: 1.15,
  refractionDepthToleranceMinimum: 0.18,
  refractionDepthToleranceScale: 0.45,
  refractionFoamSuppression: 0.94
} as const;

export const RIVER_SURFACE_TEXTURE_SAMPLE_COUNT = {
  low: 1,
  regular: 11,
  localMap: 12
} as const;
