import { Loader } from "@galacean/engine-core";
import { WaterBodyComponent } from "./WaterBodyComponent";
import { WaterSystem } from "./WaterSystem";
import { registerWaterResourceLoader } from "./WaterResources";
export { WaterBodyComponent, type WaterBodyConfiguration } from "./WaterBodyComponent";
export {
  WaterSystem,
  type WaterBatchUpdate,
  type PreparedNativeWaterBatch,
  type WaterRuntimeIntegration
} from "./WaterSystem";
export type { WaterRuntimeControl, WaterRuntimeState } from "./WaterRuntimeControl";
export { WaterAPI, WATER_API_CONTRACT, WATER_KNOWLEDGE } from "./WaterAPI";
export { waterBodyComponentData } from "./WaterSceneData";
export { createWaterAgentPackage } from "./WaterAgent";
export { WATER_API_DECLARATION } from "./WaterAPIDeclarations";
export type {
  WaterCommands,
  WaterCommand,
  WaterResult,
  WaterErrorCode,
  WaterDefinition,
  WaterInstanceSettings
} from "./WaterAPI";
export {
  WaterBodyResource,
  WaterLookResource,
  WaterQualityResource,
  WaterResourceLoader,
  serializeWaterResource,
  parseWaterResource
} from "./WaterResources";

/** Call before ResourceManager loads a Scene/Prefab containing Water components. */
export function registerNativeWater(): void {
  Loader.registerClass("WaterSystem", WaterSystem);
  Loader.registerClass("WaterBodyComponent", WaterBodyComponent);
  registerWaterResourceLoader();
}
