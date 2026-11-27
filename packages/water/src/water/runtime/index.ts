/** Public Water entry. Internal modules retain direct imports. */
export { LAKE_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND } from "./body/LakeWaterLevelRuntimeDevelopmentPort";
export type {
  LakeWaterLevelRuntimeDevelopmentPort,
  LakeWaterLevelRuntimeReadback
} from "./body/LakeWaterLevelRuntimeDevelopmentPort";
export { OCEAN_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND } from "./body/OceanWaterLevelRuntimeDevelopmentPort";
export type {
  OceanWaterLevelRuntimeDevelopmentPort,
  OceanWaterLevelRuntimeReadback
} from "./body/OceanWaterLevelRuntimeDevelopmentPort";
export { WaterBackendRegistry } from "./body/WaterBackendRegistry";
export type { WaterBodyBackend, WaterTerrainOcclusionProvider } from "./body/WaterBackendRegistry";
export { WaterBodyAssetRegistry } from "./body/WaterBodyAssetRegistry";
export { WaterBodyLoader } from "./body/WaterBodyLoader";
export type { WaterBodyActivationHandle, WaterDevelopmentTargetSource } from "./body/WaterBodyLoader";
export type { WaterBodyProviderResolveContext, WaterBodySourceProviderFactory } from "./body/WaterBodyProviderRegistry";
export { resolveWaterBodyQualityTier } from "./body/WaterBodyRuntimeSemantics";
export { isWaterSceneMutationSafe, markWaterSceneMutationSafe } from "./body/WaterMutationFailure";
export { WaterWorld } from "./body/WaterWorld";
export {
  WaterGenerationPreparerV1,
  collectWaterGenerationPreparedTransferablesV1
} from "./generation/WaterGenerationPreparer";
export type {
  ActiveWaterGenerationResourcesV1,
  PreparedWaterGenerationResourcesV1,
  WaterGenerationBodySourceCompilerV1,
  WaterGenerationPreparedTransferV1
} from "./generation/WaterGenerationPreparer";
export type { WaterShaderModule } from "./material/WaterShaderModule";
export { CameraWaterFeatureBroker } from "./optics/CameraWaterFeatureBroker";
export { WaterEnvironmentReflectionProvider } from "./optics/WaterEnvironmentReflectionProvider";
export type { WaterEnvironmentReflectionSource } from "./optics/WaterEnvironmentReflectionProvider";
export { DEFAULT_WATER_OPTICAL_PROFILE } from "./optics/WaterOpticalProfile";
export type { WaterOpticalProfile } from "./optics/WaterOpticalProfile";
export type { WaterReflectionSource } from "./optics/WaterReflectionPolicy";
export { WaterReflectionPreRenderSynchronizer } from "./optics/WaterReflectionPreRenderSynchronizer";
export { WaterReflectionService } from "./optics/WaterReflectionService";
export {
  DEFAULT_WATER_REFLECTION_INTENSITY,
  DEFAULT_WATER_REFRACTION_STRENGTH,
  DEFAULT_WATER_ROUGHNESS,
  calculateWaterFresnelF0,
  resolveWaterIndexOfRefraction,
  resolveWaterReflectionIntensity,
  resolveWaterRefractionStrength,
  resolveWaterRoughness
} from "./optics/WaterSurfaceOpticsMath";
export type { WaterSurfaceOpticsBindingReadback } from "./optics/WaterSurfaceOpticsTypes";
export { createWaterSurfaceSample, resetWaterSurfaceSample } from "./query/WaterSurfaceProvider";
export type { WaterSurfaceProvider, WaterSurfaceSample } from "./query/WaterSurfaceProvider";
export { WaterSceneRuntimeHost } from "./scene/WaterSceneRuntimeHost";
export type {
  PreparedWaterSceneBodySetTransaction,
  PublishedWaterSceneBodySet,
  WaterEnvironmentReflectionProviderHandle,
  WaterSceneBackendLease,
  WaterSceneBodyHandle,
  WaterSceneBodyRequest,
  WaterSceneBodySetTransaction
} from "./scene/WaterSceneRuntimeHost";
export { createWaterNearShoreSample, resetWaterNearShoreSample } from "./spatial/WaterNearShoreQuery";
export type { WaterNearShoreQuery, WaterNearShoreSample, WaterNearShoreTask } from "./spatial/WaterNearShoreQuery";
export {
  createWaterSemanticFieldSample,
  createWaterSemanticFieldSnapshot,
  sampleWaterSemanticField
} from "./spatial/WaterSemanticField";
export type { WaterSemanticFieldBodyV1, WaterSemanticFieldSnapshotV1 } from "./spatial/WaterSemanticField";
export {
  createCanonicalWaterSemanticFieldSample,
  legacyWaterShoreDistanceToCanonical,
  sampleCanonicalWaterSemanticField
} from "./spatial/WaterSemanticFieldAdapter";
export type { CanonicalWaterSemanticFieldSample } from "./spatial/WaterSemanticFieldAdapter";
export {
  WaterSpatialFieldChannel,
  createWaterSpatialFieldSample,
  resetWaterSpatialFieldSample
} from "./spatial/WaterSpatialFieldProvider";
export type { WaterSpatialFieldProvider, WaterSpatialFieldSnapshot } from "./spatial/WaterSpatialFieldProvider";
export type { WaterSurfaceAppearanceBindingV2 } from "./surface/WaterSurfaceAppearanceRuntimeTypes";
export type { WaterSurfaceFieldGraphReadback } from "./surface/WaterSurfaceFieldResolver";

export { WaterSurfacePickingState } from "./surface/WaterSurfacePicking";
