/** Public Water entry. Internal modules retain direct imports. */
export { computeWaterBodyAssetContentHash, createWaterBodyAsset } from "./authoring/body/WaterBodyAsset";
export type { WaterBodyAsset } from "./authoring/body/WaterBodyAsset";
export {
  WaterBathymetrySourceKind,
  WaterBodyPresetSchemaVersion,
  WaterBodyResourceSchemaVersion,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  WaterShoreSdfSourceKind,
  WaterSpatialFieldSourceSchemaVersion
} from "./authoring/body/WaterBodyAuthoringTypes";
export type {
  GridMaskWaterBodySourceV1,
  ShoreDistanceProfileWaterBathymetrySourceV1,
  TerrainBedSamplesWaterBathymetrySourceV1,
  TerrainRegionWaterBodySourceV1,
  WaterBodySourceV1,
  WaterResourceAssetDescriptorV1,
  WaterSpatialFieldQualityBudgetV1,
  WaterSpatialFieldSourcesV1,
  WetMaskWaterShoreSdfSourceV1
} from "./authoring/body/WaterBodyAuthoringTypes";
export { createWaterBodyInstance } from "./authoring/body/WaterBodyInstance";
export type { WaterBodyInstance, WaterOceanRepresentationStateV1 } from "./authoring/body/WaterBodyInstance";
export type { WaterBodyKind } from "./authoring/body/WaterBodyRepresentation";
export {
  decodeWaterSpatialFieldSources,
  encodeWaterSpatialFieldSourcesV1
} from "./authoring/body/WaterBodySchemaDecoder";
export { computeTerrainBedSamplesContentHash } from "./authoring/body/WaterSpatialFieldSourceHash";
export { sampleWaterConnection } from "./authoring/connections/WaterConnection";
export type { WaterConnectionPort, WaterConnectionV1 } from "./authoring/connections/WaterConnection";
export { resolveWaterContactEffectsLook } from "./authoring/effects/WaterContactEffectsLook";
export type { WaterContactEffectsLook } from "./authoring/effects/WaterContactEffectsLook";
export { createWaterGenerationAssetSetV1 } from "./authoring/generation/WaterGenerationAssetSet";
export type { WaterGenerationAssetSetV1 } from "./authoring/generation/WaterGenerationAssetSet";
export {
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1
} from "./authoring/heightfield/HeightfieldWaterDescriptor";
export type {
  HeightfieldWaterDescriptorV1,
  HeightfieldWaterRepresentationDataV1
} from "./authoring/heightfield/HeightfieldWaterDescriptor";
export { HeightfieldWaterSchemaVersion } from "./authoring/heightfield/HeightfieldWaterEnums";
export type { HeightfieldWaterGridConfig } from "./authoring/heightfield/HeightfieldWaterTypes";
export { WaterRegionSchemaVersion } from "./authoring/heightfield/WaterRegionTypes";
export type { WaterRegionMaskV1 } from "./authoring/heightfield/WaterRegionTypes";
export { createLake } from "./authoring/lake/createLake";
export { createLakeFromTerrain } from "./authoring/lake/createLakeFromTerrain";
export type { LakeBoundaryV1, LakePointXZ, LakeSplinePoint, SampledLakeBoundary } from "./authoring/lake/LakeBoundary";
export type { OceanNearshoreDescriptorV1 } from "./authoring/ocean/OceanNearshoreDescriptor";
export { OceanNearshoreOutsidePolicy, OceanNearshoreSchemaVersion } from "./authoring/ocean/OceanNearshoreTypes";
export type { OceanNearshoreGridConfig } from "./authoring/ocean/OceanNearshoreTypes";
export { createWaterReflectionPresentationPolicy } from "./authoring/optics/WaterReflectionPolicy";
export type {
  WaterReflectionPolicyMode,
  WaterReflectionPresentationMode
} from "./authoring/optics/WaterReflectionPolicy";
export { createWaterReflectionPolicyPresetV1 } from "./authoring/optics/WaterReflectionPolicyPreset";
export { createWaterQualityPlanV2 } from "./authoring/quality/WaterQualityPlan";
export { createRiver } from "./authoring/river/createRiver";
export {
  RiverDirectionMode,
  RiverDisturbanceKind,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel
} from "./authoring/river/RiverAuthoringEnums";
export { RIVER_LIMITS, RIVER_QUALITY_PRESET } from "./authoring/river/RiverAuthoringLimits";
export type { RiverPathControlPoint } from "./authoring/river/RiverAuthoringTypes";
export type { RiverNetworkDescriptor } from "./authoring/river/RiverDescriptor";
export type { RiverEditablePoint } from "./authoring/river/RiverEditDocument";
export { RIVER_GENERATION_MAX_POINT_COUNT } from "./authoring/river/RiverGenerationParameters";
export type { RiverGenerationParameters } from "./authoring/river/RiverGenerationParameters";
export { resolveContinuousRiverDownstreamHeight } from "./authoring/river/RiverHydrologyResolver";
export { computeRiverPhysicalSourceHash } from "./authoring/river/RiverPhysicalSourceIdentity";
export { createRiverTerrainModifier } from "./authoring/river/RiverTerrainModifier";
export type { RiverTerrainModifier } from "./authoring/river/RiverTerrainModifier";
export {
  RIVER_WATER_BODY_ASSET_ID,
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance
} from "./authoring/river/RiverWaterBodyAuthoring";
export { WaterSurfaceDepthSource } from "./authoring/surface/enums/WaterSurfaceDepthSource";
export type {
  WaterLookAuthoringComponents,
  WaterLookAuthoringDraft,
  WaterLookAuthoringSnapshot
} from "./authoring/surface/WaterLookAuthoringSnapshot";
export { DEFAULT_WATER_LOOK_RUNTIME_INPUT, createWaterLookPresetV1 } from "./authoring/surface/WaterLookPreset";
export { createWaterRenderStatePresetV1 } from "./authoring/surface/WaterRenderStatePreset";
export {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceDepthResponseModelV2
} from "./authoring/surface/WaterSurfaceAppearanceTypes";
export type { WaterSurfaceAppearanceAssetV2 } from "./authoring/surface/WaterSurfaceAppearanceTypes";
export { WaterFieldProviderKind, WaterFieldSemantic } from "./authoring/surface/WaterSurfaceFieldTypes";
export {
  captureWaterTerrainSnapshot,
  copyWaterTerrainSnapshot,
  sampleWaterTerrainHeight
} from "./authoring/terrain/WaterTerrainSnapshot";
export { resolveWatercourse } from "./authoring/river/Watercourse";
export type {
  WatercourseAuthoring,
  WatercoursePoint,
  WatercourseSection,
  WatercourseForm,
  ResolvedWatercourse,
  WatercourseDrop
} from "./authoring/river/Watercourse";
export type { WaterTerrainSnapshot } from "./authoring/terrain/WaterTerrainSnapshot";
export { WaterQualityTier } from "./authoring/wave/enums/WaterQualityTier";
export { WaterWaveModel } from "./authoring/wave/enums/WaterWaveModel";
export { WaterWaveSchemaVersion } from "./authoring/wave/enums/WaterWaveSchemaVersion";

export * from "./authoring/river/RiverDrop";
export * from "./authoring/river/RiverDropLook";
export * from "./authoring/river/WatercourseGeometry";

export { evaluateRiverCatmullRom, evaluateRiverCubicBezier } from "./authoring/river/RiverCurve";
export type { RiverCurvePoint } from "./authoring/river/RiverCurve";

export {
  getWaterSurfaceAppearanceQualityBudget,
  resolveWaterSurfaceAppearanceForQuality,
  type WaterSurfaceAppearanceQualityBudget
} from "./authoring/quality/WaterSurfaceAppearanceQuality";
export { resolveWaterMaterialFileLook } from "./native/WaterMaterialFile";
