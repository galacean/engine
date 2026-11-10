/** Heightfield-water shader bindings and runtime submission defaults. */
import { WATER_OPTICS_SHADER_PROPERTY } from "../optics/constants/WaterOpticsShaderConstants";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "./types";

export const HEIGHTFIELD_WATER_SHADER_PROPERTY = {
  shallowColor: "material_ShallowColor",
  deepColor: "material_DeepColor",

  alpha: "material_Alpha",
  clarity: "material_Clarity",
  timeScale: "material_TimeScale",
  waveStrength: "material_WaveStrength",

  shoreDampingWidth: "material_ShoreDampingWidth",
  surfaceTimeOverride: "material_SurfaceTimeOverride",

  refractionEnabled: WATER_OPTICS_SHADER_PROPERTY.refractionEnabled,
  compositionMode: "material_CompositionMode",

  wavesEnabled: "material_WavesEnabled",
  microNormalsEnabled: "material_MicroNormalsEnabled",

  presentationRevealProgress: "material_PresentationRevealProgress",
  presentationRevealBand: "material_PresentationRevealBand",
  presentationRevealRepeat: "material_PresentationRevealRepeat",
  blendEnabled: "blendEnabled",
  depthWriteEnabled: "depthWriteEnabled",
  localMapTexture: "material_LocalMapTexture",

  appearanceDirectSpecularEnabled: "material_AppearanceDirectSpecularEnabled",
  absorptionCoefficient: WATER_OPTICS_SHADER_PROPERTY.absorptionCoefficient,
  scatteringColor: WATER_OPTICS_SHADER_PROPERTY.scatteringColor,
  scatteringCoefficient: WATER_OPTICS_SHADER_PROPERTY.scatteringCoefficient,
  maximumSurfaceOpticalDistance: WATER_OPTICS_SHADER_PROPERTY.maximumSurfaceOpticalDistance,
  indexOfRefraction: WATER_OPTICS_SHADER_PROPERTY.indexOfRefraction,
  fresnelF0: WATER_OPTICS_SHADER_PROPERTY.fresnelF0,
  refractionStrength: WATER_OPTICS_SHADER_PROPERTY.refractionStrength,
  roughness: WATER_OPTICS_SHADER_PROPERTY.roughness,
  reflectionIntensity: WATER_OPTICS_SHADER_PROPERTY.reflectionIntensity,
  screenSpaceReflectionCompositeIntensity: "material_WaterScreenSpaceReflectionCompositeIntensity",
  reflectionSource: WATER_OPTICS_SHADER_PROPERTY.reflectionSource,
  reflectionCubeTexture: WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture,
  environmentReflectionParameters: WATER_OPTICS_SHADER_PROPERTY.environmentReflectionParameters,
  environmentReflectionMaximumMip: WATER_OPTICS_SHADER_PROPERTY.environmentReflectionMaximumMip,
  localMapWorldToUv: "material_LocalMapWorldToUv",
  waterWorldToLocalPlanar: "material_WaterWorldToLocalPlanar",
  atlasUvRect: "renderer_AtlasUvRect",
  localMapDecode: "material_LocalMapDecode",
  maxVerticalDisplacement: "material_MaxVerticalDisplacement",
  waveAPrefix: "material_WaveA",
  waveBPrefix: "material_WaveB"
} as const;

export const HEIGHTFIELD_WATER_RESOURCE_SUBMISSION_BUDGET_MS = 4;

export const DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> =
  Object.freeze({
    externalNormal: true,
    depthTint: true,
    coastalAlpha: true,
    contactFoam: true,
    directSpecular: true
  });

/** Keeps elapsed time bounded before it reaches the shader's trigonometric functions. */
export const HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS = 4096;

/** Shared CPU/GPU Gerstner time scale for heightfield macro waves. */
export const HEIGHTFIELD_WATER_WAVE_TIME_SCALE = 0.9;

/** Internal flow/optics defaults. Public authoring still uses the existing six material fields. */
export const HEIGHTFIELD_WATER_SURFACE_TUNING = {
  minimumFlowSpeed: 0.055,
  maximumFlowSpeed: 1.8,
  flowingDirectionWeight: 0.88,
  macroFlowAlignment: 0.72,
  stillMacroAmplitudeScale: 0.3,
  refractionDepthStart: 0.04,
  refractionDepthEnd: 1.15,
  refractionDepthToleranceMinimum: 0.18,
  refractionDepthToleranceScale: 0.45
} as const;
