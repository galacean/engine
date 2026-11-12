/** Shader bindings and runtime tuning owned by River. */
export const RIVER_SHADER_PROPERTY = {
  baseColor: "material_BaseColor",
  foamColor: "material_FoamColor",
  flowSpeedMultiplier: "material_FlowSpeed",
  foamIntensity: "material_FoamIntensity",
  clarity: "material_Clarity",
  depthWriteEnabled: "material_DepthWriteEnabled",
  noiseTexture: "material_NoiseTexture",
  surfaceNormalTexture: "material_SurfaceNormalTexture",
  surfaceSeed: "material_SurfaceSeed",
  surfaceMaxDisplacement: "material_SurfaceMaxDisplacement",
  surfaceLengthScale: "material_SurfaceLengthScale",
  shoreDampingWidth: "material_ShoreDampingWidth",
  surfaceTurbulence: "material_SurfaceTurbulence",
  crestIntensity: "material_CrestIntensity",
  flowNormalStrength: "material_FlowNormalStrength",

  macroDisplacementEnabled: "material_MacroDisplacementEnabled",
  microSurfaceEnabled: "material_MicroSurfaceEnabled",
  surfaceDomainOffsets: "material_SurfaceDomainOffsets",
  flowNormalOffsets: "material_FlowNormalOffsets",
  flowFoamOffsets: "material_FlowFoamOffsets",
  surfaceWarpOffset: "material_SurfaceWarpOffset",
  surfaceTimeOverride: "material_SurfaceTimeOverride",
  localMapTexture: "material_LocalMapTexture",
  localMapBodyToUv: "renderer_LocalMapBodyToUv",
  localMapBodyOrigin: "renderer_LocalMapBodyOrigin",
  localMapUvRect: "renderer_LocalMapUvRect",
  localMapConfluence: "renderer_LocalMapConfluence"
} as const;

/**
 * V2 samples River local maps in stable body-local coordinates reconstructed
 * before renderer/world transforms. This is an intentional shader-contract
 * revision from the legacy axis-aligned world-XZ lookup.
 */
export const RIVER_LOCAL_MAP_COORDINATE_CONTRACT_VERSION = 2 as const;
export const RIVER_LOCAL_MAP_SHADER_NAME = "AIWorld/RiverSurfaceLocalMapBodyLocalV2" as const;

export const RIVER_QUERY_NO_SOURCE_INDEX = -1;
export const RIVER_QUERY_NO_SOURCE_KIND = 255;
export const RIVER_QUERY_EPSILON = 1e-6;
export const RIVER_RESOURCE_SUBMISSION_BUDGET_MS = 4;

/** Remaining transport/composition constants; shape and appearance are authored separately. */
export const RIVER_SURFACE_SHADER_TUNING = {
  timePeriodSeconds: 4096,
  confluenceInteriorBlendWidth: 0.12,
  confluenceFlowBlendWeight: 0.32,
  confluenceFoamWeight: 0.38,
  shoreFoamWidthScale: 1.15,
  refractionDepthStart: 0.04,
  refractionDepthEnd: 1.15,
  refractionDepthToleranceMinimum: 0.18,
  refractionDepthToleranceScale: 0.45
} as const;

/** Preserve the established River flow-normal appearance when no explicit strength or detail layer is supplied. */
export const RIVER_DEFAULT_FLOW_NORMAL_STRENGTH = 0.467;
