import { Loader } from "@galacean/engine-core";
import { FarmingAreaComponent } from "./FarmingAreaComponent";
import { FarmingSystem } from "./FarmingSystem";
import { registerFarmingResourceLoader } from "./FarmingResources";
export {
  FarmingAreaComponent,
  type FarmingAreaConfiguration,
  type FarmingAreaDependencies
} from "./FarmingAreaComponent";
export { FarmingSystem } from "./FarmingSystem";
export type * from "../domain/FarmingDiagnostics";
export { FarmingAPI, FARMING_API_CONTRACT } from "./FarmingAPI";
export type * from "./FarmingAPIContract";
export {
  FarmingCatalogResource,
  FarmingRulesResource,
  createFarmingResources,
  serializeFarmingResource,
  parseFarmingResource
} from "./FarmingResources";
export type { FarmingCatalogData, FarmingRulesData } from "./FarmingResources";
export { farmingAreaComponentData } from "./FarmingSceneData";
export { createFarmingAgentPackage } from "./FarmingAgent";
export { FARMING_API_DECLARATION } from "./FarmingAPIDeclarations";
export { FARMING_METHOD_DOCS } from "./FarmingMethodDocs";
export { farmingSkill, farmingSkillDocuments } from "./FarmingSkill";
/** Call before loading a Scene/Prefab containing farming components. */
export function registerNativeFarming(): void {
  Loader.registerClass("FarmingSystem", FarmingSystem);
  Loader.registerClass("FarmingAreaComponent", FarmingAreaComponent);
  registerFarmingResourceLoader();
}
