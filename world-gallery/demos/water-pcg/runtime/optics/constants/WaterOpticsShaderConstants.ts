/** Shared shader ABI for surface-water optical consumers. */
export const WATER_OPTICS_SHADER_PROPERTY = {
  debugMode: "material_DebugMode",
  refractionEnabled: "material_RefractionEnabled",
  absorptionCoefficient: "material_AbsorptionCoefficient",
  scatteringColor: "material_ScatteringColor",
  scatteringCoefficient: "material_ScatteringCoefficient",
  maximumSurfaceOpticalDistance: "material_MaximumSurfaceOpticalDistance",
  maximumViewDistance: "material_MaximumViewDistance",
  indexOfRefraction: "material_IndexOfRefraction",
  refractionStrength: "material_RefractionStrength",
  roughness: "material_Roughness",
  reflectionIntensity: "material_ReflectionIntensity",
  reflectionSource: "material_ReflectionSource",
  reflectionCubeTexture: "material_ReflectionCubeTexture",
  planarReflectionTexture: "material_PlanarReflectionTexture",
  planarReflectionViewProjection: "material_PlanarReflectionVP",
  planarReflectionTextureSize: "material_PlanarReflectionTextureSize",
  planarReflectionSampling: "material_PlanarReflectionSampling",
  planarReflectionFade: "material_PlanarReflectionFade",
  planarReflectionRoughnessFootprint: "material_PlanarReflectionRoughnessFootprint"
} as const;

/** Numeric values are part of the P0 shader ABI. */
export const WATER_OPTICS_REFLECTION_SOURCE_VALUE = Object.freeze({
  sky: 0,
  probe: 1,
  planar: 2
} as const);
