import {
  parseFarmingResourceFile,
  validateFarmingResourceFile
} from "@galacean/engine-farming/farming/native/FarmingResources";
import {
  AssetPromise,
  JSONAsset,
  Loader,
  resourceLoader,
  type LoadItem,
  type ResourceManager
} from "@galacean/engine-core";
import type { RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { PLANNING_FARMING_PROJECT_TYPE } from "./PlanningFarmRepository.ts";

export const PLANNING_FARM_CATALOG = "World/Farming/Catalog.farming";
export const PLANNING_FARM_RULES = "World/Farming/Rules.farming";

function resourceFile(content: string | Uint8Array) {
  return parseFarmingResourceFile(
    typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content)
  );
}

/** Definitions declare texture dependencies; the live repository exclusively owns state writes. */
export const planningFarmingAssetFormats: ReadonlyMap<string, RuntimeAssetFormat> = new Map<string, RuntimeAssetFormat>([
  [
    "FarmingResource",
    {
      contentEncoding: "utf8",
      validate: (content: string | Uint8Array) => {
        validateFarmingResourceFile(resourceFile(content));
      },
      references: (content: string | Uint8Array) => {
        const file = resourceFile(content);
        return file.kind === "catalog"
          ? [
              ...new Set<string>(
                file.data.plants
                  .map((plant: { atlasUrl: string }) => {
                    if (typeof plant.atlasUrl !== "string" || !plant.atlasUrl)
                      throw new Error("Missing plant texture path");
                    return plant.atlasUrl;
                  })
                  .filter((path: string) => !/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(path))
              )
            ]
          : [];
      }
    }
  ],
  [
    PLANNING_FARMING_PROJECT_TYPE,
    {
      contentEncoding: "utf8",
      referenceTypes: [],
      references: () => [],
      validateCreate: (content) => {
        const value = JSON.parse(
          typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content)
        );
        if (
          value?.version !== 1 ||
          !value.farms ||
          typeof value.farms !== "object" ||
          Array.isArray(value.farms) ||
          Object.keys(value.farms).length ||
          (value.initializations !== undefined && (!value.initializations || typeof value.initializations !== "object" ||
            Array.isArray(value.initializations) || Object.keys(value.initializations).length))
        )
          throw new Error("Create farming state with {version:1, farms:{}}; populate it through FarmingSystem methods");
      },
      validate: () => {
        throw new Error("Change farming state through FarmingSystem methods");
      }
    }
  ]
]);

class FarmingProjectStateLoader extends Loader<JSONAsset> {
  load(item: LoadItem, manager: ResourceManager): AssetPromise<JSONAsset> {
    return (manager as unknown as { _request(url: string, config: unknown): AssetPromise<object> })
      ._request(item.url!, { ...item, type: "json" })
      .then((data) => {
        const asset = new JSONAsset(manager.engine);
        asset.data = data;
        return asset;
      });
  }
}
let registered = false;
export function registerPlanningFarmingAssets(): void {
  if (!registered) {
    resourceLoader(PLANNING_FARMING_PROJECT_TYPE, [])(FarmingProjectStateLoader);
    registered = true;
  }
}

/** The source reference owns virtual identity; Engine cache URLs may be temporary blob URLs. */
export function planningFarmingStatePath(component: GalaceanSourceComponentSchema): string {
  const reference = component.props?.state;
  if (
    component.type !== "FarmingSystem" ||
    !reference ||
    typeof reference !== "object" ||
    Array.isArray(reference) ||
    !("$ref" in reference) ||
    typeof reference.$ref !== "string" ||
    !reference.$ref
  )
    throw new Error("FarmingSystem requires an authored state asset reference");
  return reference.$ref;
}
