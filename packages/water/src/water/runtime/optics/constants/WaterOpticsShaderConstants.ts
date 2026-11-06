/** Shared shader ABI for surface-water optical consumers. */
export const WATER_OPTICS_SHADER_PROPERTY = {
  surfaceScatteringCoefficient: "material_SurfaceScatteringCoefficient",
  surfaceScatteringPhaseG: "material_SurfaceScatteringPhaseG",
  debugMode: "material_DebugMode",
  refractionEnabled: "material_RefractionEnabled",
  absorptionCoefficient: "material_AbsorptionCoefficient",
  scatteringColor: "material_ScatteringColor",
  scatteringCoefficient: "material_ScatteringCoefficient",
  maximumSurfaceOpticalDistance: "material_MaximumSurfaceOpticalDistance",
  maximumViewDistance: "material_MaximumViewDistance",
  indexOfRefraction: "material_IndexOfRefraction",
  fresnelF0: "material_FresnelF0",
  refractionStrength: "material_RefractionStrength",
  roughness: "material_Roughness",
  reflectionIntensity: "material_ReflectionIntensity",
  reflectionSource: "material_ReflectionSource",
  reflectionCubeTexture: "material_ReflectionCubeTexture",
  secondaryReflectionCubeTexture: "material_SecondaryReflectionCubeTexture",
  environmentFallbackIntensity: "material_EnvironmentFallbackIntensity",
  environmentReflectionAvailable: "material_EnvironmentReflectionAvailable",
  environmentReflectionBlend: "material_EnvironmentReflectionBlend",
  environmentReflectionParameters: "material_EnvironmentReflectionParameters",
  environmentReflectionMaximumMip: "material_EnvironmentReflectionMaximumMip",
  environmentReflectionProbePosition: "material_EnvironmentReflectionProbePosition",
  environmentReflectionBoxMinimum: "material_EnvironmentReflectionBoxMinimum",
  environmentReflectionBoxMaximum: "material_EnvironmentReflectionBoxMaximum",
  secondaryEnvironmentReflectionParameters: "material_SecondaryEnvironmentReflectionParameters",
  secondaryEnvironmentReflectionMaximumMip: "material_SecondaryEnvironmentReflectionMaximumMip",
  secondaryEnvironmentReflectionProbePosition: "material_SecondaryEnvironmentReflectionProbePosition",
  secondaryEnvironmentReflectionBoxMinimum: "material_SecondaryEnvironmentReflectionBoxMinimum",
  secondaryEnvironmentReflectionBoxMaximum: "material_SecondaryEnvironmentReflectionBoxMaximum",
  localReflectionCubeTexture: "material_LocalReflectionCubeTexture",
  localEnvironmentReflectionAvailable: "material_LocalEnvironmentReflectionAvailable",
  localEnvironmentReflectionParameters: "material_LocalEnvironmentReflectionParameters",
  localEnvironmentReflectionMaximumMip: "material_LocalEnvironmentReflectionMaximumMip",
  localEnvironmentReflectionProbePosition: "material_LocalEnvironmentReflectionProbePosition",
  localEnvironmentReflectionBoxMinimum: "material_LocalEnvironmentReflectionBoxMinimum",
  localEnvironmentReflectionBoxMaximum: "material_LocalEnvironmentReflectionBoxMaximum"
} as const;

/** Numeric values are part of the P0 shader ABI. */
export const WATER_OPTICS_REFLECTION_SOURCE_VALUE = Object.freeze({
  sky: 0,
  probe: 1,
  ssr: 3
} as const);
