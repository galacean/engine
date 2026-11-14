export { createOceanFarShaderModule, resolveOceanFarShader } from "./OceanFarMaterial";
export { createOceanShaderModule, resolveOceanShader } from "./OceanMaterial";
export { OCEAN_WATER_BACKEND_ID, OceanWaterBackend } from "./OceanWaterBackend";
export type { OceanWaterBackendRuntimeContext } from "./OceanWaterBackend";
export {
  OCEAN_WATER_BODY_DESCRIPTOR_SCHEMA_VERSION,
  OceanWaterCompiledResource,
  assertOceanWaterBodyDescriptor,
  computeOceanWaterSourceHash
} from "./OceanWaterCompiledResource";
export type { OceanWaterBodyDescriptorV1, OceanWaterCompiledTransferV1 } from "./OceanWaterCompiledResource";
export { OceanWaterRuntimeController } from "./OceanWaterRuntimeController";
export type { OceanWaterSourceConfig } from "./OceanWaterRuntimeTypes";
