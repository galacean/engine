import { Loader } from "@galacean/engine-core";
import { WaterBodyComponent } from "./WaterBodyComponent";
import { registerWaterBuiltinShaders } from "./WaterBuiltinShaders";
import { WaterSystem } from "./WaterSystem";
export { createWaterAgentPackage } from "./WaterAgent";
export { WATER_API_CONTRACT, WATER_KNOWLEDGE, WaterAPI } from "./WaterAPI";
export type {
  WaterCommand,
  WaterCommands,
  WaterDefinition,
  WaterErrorCode,
  WaterInstanceSettings,
  WaterResult
} from "./WaterAPI";
export { WATER_API_DECLARATION } from "./WaterAPIDeclarations";
export {
  compileWaterShape,
  validateWaterAuthoringSettings,
  validateWaterShape,
  type WaterShapeAuthoring,
  type WaterShorePoint
} from "./WaterAuthoring";
export {
  WaterBodyComponent,
  type WaterBodyAuthoring,
  type WaterBodyAuthoringInput,
  type WaterBodyConfiguration
} from "./WaterBodyComponent";
export { registerWaterBuiltinShaders, WATER_BUILTIN_SHADER_NAMES } from "./WaterBuiltinShaders";
export {
  createWaterQualitySettings,
  patchWaterQualitySettings,
  type WaterQualityInput,
  type WaterQualitySettings
} from "./WaterQualitySettings";
export { WaterBodyResource, WaterLookResource, WaterQualityResource } from "./WaterResources";
export type { WaterRuntimeControl, WaterRuntimeState } from "./WaterRuntimeControl";
export { waterBodyComponentData } from "./WaterSceneData";
export {
  WaterSystem,
  type PreparedNativeWaterBatch,
  type WaterBatchUpdate,
  type WaterRuntimeIntegration
} from "./WaterSystem";

/** Call before ResourceManager loads a Scene/Prefab containing Water components. */
export function registerNativeWater(): void {
  registerWaterBuiltinShaders();
  Loader.registerClass("WaterSystem", WaterSystem);
  Loader.registerClass("WaterBodyComponent", WaterBodyComponent);
}

export {
  decodeWaterTerrainAssets,
  encodeWaterTerrainAssets,
  resolveWaterTerrainAssets,
  type WaterTerrainDescription,
  type WaterTerrainInput
} from "./WaterTerrainAssets";

export { createWaterCreationPreset } from "./WaterCreationPresets";

export { validateWaterWorldTransform } from "./WaterAuthoring";

export { getWaterAuthoringCapabilities } from "./WaterAuthoring";

export {
  resolveWaterMaterialProfile,
  validateWaterMaterialCapabilities,
  validateWaterShaderCapabilities
} from "./WaterAuthoring";
export { compileWaterConnectionGraph, type WaterConnectionAuthoringBody } from "./WaterConnectionAuthoring";
export type { WaterBodyConnection } from "./WaterConnections";
export {
  createWaterMaterialDefaults,
  createWaterMaterialFile,
  prepareWaterMaterial,
  updateWaterMaterialParameters,
  waterMaterialShaderSource,
  type WaterMaterialFile,
  type WaterMaterialProfile
} from "./WaterMaterial";
