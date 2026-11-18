import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { farmingResourceData } from "@galacean/engine-farming/farming/native/FarmingResources";
import { FARM_DEFINITIONS } from "@galacean/engine-farming/farming/content/DefaultFarmingDefinitions";

export const FARM_SCENE = "Farm.scene";
export const FARM_CATALOG = "Farm/Catalog.json";
export const FARM_RULES = "Farm/Rules.json";
export const FARM_STATE = "Farm/State.json";
export const resourceData = farmingResourceData(FARM_DEFINITIONS);
export function farmingTestProject(): RuntimeProjectPackage {
  const component = {
    id: "system",
    type: "FarmingSystem",
    props: { catalog: { $ref: FARM_CATALOG }, rules: { $ref: FARM_RULES }, state: { $ref: FARM_STATE } }
  };
  return {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: FARM_SCENE,
      files: [
        {
          virtualPath: FARM_SCENE,
          path: FARM_SCENE,
          type: "Scene",
          dependencies: [FARM_CATALOG, FARM_RULES, FARM_STATE]
        },
        ...[FARM_CATALOG, FARM_RULES, FARM_STATE].map((virtualPath) => ({
          virtualPath,
          path: virtualPath,
          type: "JSON",
          dependencies: []
        }))
      ]
    },
    contents: {
      [FARM_SCENE]: JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: ["system-entity"], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
        entities: [{ id: "system-entity", name: "Farm", components: [component.id] }],
        components: [component]
      }),
      [FARM_CATALOG]: JSON.stringify({ version: 1, kind: "catalog", data: resourceData.catalog }),
      [FARM_RULES]: JSON.stringify({ version: 1, kind: "rules", data: resourceData.rules }),
      [FARM_STATE]: JSON.stringify({ version: 1, farms: {} })
    }
  };
}
