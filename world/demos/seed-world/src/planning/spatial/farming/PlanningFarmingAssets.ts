import type { RuntimeAssetChanges } from "@galacean/engine-runtime-editor/project/runtime-asset-changes";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { FARMING_PROP_ROOTS } from "@galacean/engine-farming/farming/presentation/props/FarmingPropResources";
import { readAssetJson } from "@galacean/engine-project/runtime-editor/project/runtime-asset-read";
import {
  AssetPromise,
  AssetType,
  JSONAsset,
  Loader,
  resourceLoader,
  type LoadItem,
  type ResourceManager
} from "@galacean/engine-core";
import type { RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { PLANNING_FARMING_PROJECT_TYPE } from "./PlanningFarmRepository.ts";

export const PLANNING_FARM_CATALOG = "World/Farming/Catalog.json";
export const PLANNING_FARM_RULES = "World/Farming/Rules.json";

export const planningFarmingAssetFormats: ReadonlyMap<string, RuntimeAssetFormat> = new Map<string, RuntimeAssetFormat>(
  [
    // The farm consumes the native binary clip loader; authoring never edits clip bytes.
    [
      AssetType.AnimationClip,
      {
        validate: () => { throw new Error("AnimationClip assets are read-only"); },
        referenceTypes: [],
        references: () => []
      }
    ],
    [
      PLANNING_FARMING_PROJECT_TYPE,
      {
        contentEncoding: "utf8",
        read: readAssetJson,
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
            (value.initializations !== undefined &&
              (!value.initializations ||
                typeof value.initializations !== "object" ||
                Array.isArray(value.initializations) ||
                Object.keys(value.initializations).length))
          )
            throw new Error(
              "Create farming state with {version:1, farms:{}}; populate it through FarmingSystem methods"
            );
        },
        validate: () => {
          throw new Error("Change farming state through FarmingSystem methods");
        }
      }
    ]
  ]
);

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

/** These are the consumed roots; dependencies may live outside the farming namespace. */
export function planningFarmingAssetReference(
  component: GalaceanSourceComponentSchema,
  property: "catalog" | "rules"
): string {
  const value = component.props?.[property];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("$ref" in value) ||
    typeof value.$ref !== "string" ||
    !value.$ref
  )
    throw new Error(`FarmingSystem requires an authored ${property} asset reference`);
  return value.$ref;
}
export function planningFarmingAssetRoots(component: GalaceanSourceComponentSchema): readonly string[] {
  return [
    planningFarmingAssetReference(component, "catalog"),
    planningFarmingAssetReference(component, "rules"),
    ...FARMING_PROP_ROOTS
  ];
}

export function planningFarmingAssetsAffected(
  changes: RuntimeAssetChanges,
  pack: RuntimeProjectPackage,
  roots: readonly string[]
): boolean {
  const affected = changes.affected(pack);
  return roots.some((path) => affected.has(path));
}
