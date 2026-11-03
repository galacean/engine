/** Public Water entry. Internal modules retain direct imports. */
export { HEIGHTFIELD_WATER_BACKEND_ID, HeightfieldWaterBackend } from "./HeightfieldWaterBackend";
export type { HeightfieldWaterBackendRuntimeContext } from "./HeightfieldWaterBackend";
export { HeightfieldWaterCompileWorkerClient } from "./HeightfieldWaterCompileWorkerClient";
export {
  createHeightfieldWaterSurfaceAppearanceV2ShaderModule,
  resolveHeightfieldWaterSurfaceAppearanceV2Shader
} from "./HeightfieldWaterMaterialFactory";
export { createHeightfieldWaterPreparedCompilerIdentityV1 } from "./HeightfieldWaterPreparedCompilerIdentity";
export {
  HeightfieldWaterBaseQueryService,
  createHeightfieldWaterBaseQueryResult
} from "./HeightfieldWaterQueryService";
export type { HeightfieldWaterReflectionSamplingSettings } from "./HeightfieldWaterReflectionSampling";
export { HeightfieldWaterRuntimeController } from "./HeightfieldWaterRuntimeController";
export { applyLakeWaterPresentation, createLakeWaterPresentationState } from "./LakeWaterPresentation";
