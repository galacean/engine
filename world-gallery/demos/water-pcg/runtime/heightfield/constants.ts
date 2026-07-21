/** Heightfield-water shader bindings and runtime submission defaults. */
export const HEIGHTFIELD_WATER_SHADER_PROPERTY = {
  shallowColor: "material_ShallowColor",
  deepColor: "material_DeepColor",
  foamColor: "material_FoamColor",
  alpha: "material_Alpha",
  clarity: "material_Clarity",
  timeScale: "material_TimeScale",
  waveStrength: "material_WaveStrength",
  microNormalStrength: "material_MicroNormalStrength",
  foamIntensity: "material_FoamIntensity",
  shoreDampingWidth: "material_ShoreDampingWidth",
  surfaceTimeOverride: "material_SurfaceTimeOverride",
  debugMode: "material_DebugMode",
  wavesEnabled: "material_WavesEnabled",
  microNormalsEnabled: "material_MicroNormalsEnabled",
  foamEnabled: "material_FoamEnabled",
  localMapTexture: "material_LocalMapTexture",
  surfaceTexture: "material_SurfaceTexture",
  localMapWorldToUv: "material_LocalMapWorldToUv",
  atlasUvRect: "renderer_AtlasUvRect",
  localMapDecode: "material_LocalMapDecode",
  maxVerticalDisplacement: "material_MaxVerticalDisplacement",
  waveAPrefix: "material_WaveA",
  waveBPrefix: "material_WaveB"
} as const;

export const HEIGHTFIELD_WATER_RESOURCE_SUBMISSION_BUDGET_MS = 4;

/** Keeps elapsed time bounded before it reaches the shader's trigonometric functions. */
export const HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS = 4096;

/** Shared CPU/GPU Gerstner time scale for heightfield macro waves. */
export const HEIGHTFIELD_WATER_WAVE_TIME_SCALE = 0.9;

/** Deterministic, tileable RG slope / BA foam-noise texture shared by all heightfield-water materials. */
export const HEIGHTFIELD_WATER_SURFACE_TEXTURE = {
  size: 128,
  gradientStrength: 6.8,
  firstCellCount: 4,
  secondCellCount: 11,
  thirdCellCount: 23,
  firstWeight: 0.5,
  secondWeight: 0.32,
  thirdWeight: 0.18
} as const;

/** Internal flow/optics defaults. Public authoring still uses the existing six material fields. */
export const HEIGHTFIELD_WATER_SURFACE_TUNING = {
  phaseRate: 0.095,
  phaseTravel: 1.45,
  layerScales: [0.075, 0.19, 0.43] as const,
  layerRates: [0.72, 1.0, 1.48] as const,
  layerWeights: [0.48, 0.34, 0.18] as const,
  layerOffsets: [
    [0.0, 0.0],
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
  stillWaterDirections: [
    [-0.36, -0.9329523],
    [0.872496, -0.488621],
    [-0.939793, 0.341744]
  ] as const,
  phaseBOffset: [0.5, 0.5] as const,
  stillCycleRateScale: 0.22,
  flowingCycleRateBase: 0.54,
  flowingCycleRateSpeedScale: 1.08,
  stillPhaseTravelScale: 0.08,
  flowingPhaseTravelBase: 0.48,
  flowingPhaseTravelSpeedScale: 1.02,
  minimumFlowSpeed: 0.055,
  maximumFlowSpeed: 1.8,
  flowingDirectionWeight: 0.88,
  macroFlowAlignment: 0.72,
  stillMacroAmplitudeScale: 0.3,
  stillMicroNormalScale: 0.35,
  stillFoamScale: 0.1,
  minimumNormalStrength: 0.12,
  shoreFoamWidthScale: 1.2,
  shoreFoamNoiseStart: 0.54,
  shoreFoamNoiseEnd: 0.76,
  crestFoamStart: 0.035,
  crestFoamEnd: 0.19,
  currentFoamSpeedStart: 0.72,
  currentFoamSpeedEnd: 1.55,
  currentFoamNoiseStart: 0.68,
  currentFoamNoiseEnd: 0.87,
  mediumWakeTapDistance: 3.2,
  highWakeTapDistances: [2.6, 5.2] as const,
  highWakeSecondaryWeight: 0.84,
  wakeLateralProbeDistance: 5.25,
  wakeLateralWetSdfStart: 0.02,
  wakeLateralWetSdfEnd: 0.3,
  wakeDrySdfStart: -0.15,
  wakeDrySdfEnd: 0.25,
  wakeInteriorSdfStart: 0.32,
  wakeInteriorSdfEnd: 0.95,
  wakeDetailNoiseStart: 0.34,
  wakeDetailNoiseEnd: 0.6,
  wakeFoamStrength: 0.95,
  fresnelF0: 0.022,
  fresnelPower: 5,
  broadSpecularPower: 32,
  tightSpecularPower: 128,
  mediumRefractionUvScale: 0.008,
  highRefractionUvScale: 0.012,
  mediumRefractionMix: 0.3,
  highRefractionMix: 0.4,
  refractionDepthStart: 0.04,
  refractionDepthEnd: 1.15,
  refractionDepthToleranceMinimum: 0.18,
  refractionDepthToleranceScale: 0.45,
  refractionFoamSuppression: 0.94,
  maximumAlpha: 0.9
} as const;

export const HEIGHTFIELD_WATER_SURFACE_TEXTURE_RANDOM = {
  firstSeed: 13,
  secondSeed: 37,
  thirdSeed: 71,
  auxiliarySeedOffset: 101
} as const;
