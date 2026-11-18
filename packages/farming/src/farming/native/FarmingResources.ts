import {
  AssetPromise,
  Loader,
  ReferResource,
  resourceLoader,
  type Engine,
  type LoadItem,
  type ResourceManager
} from "@galacean/engine-core";
import { createPlantingCatalog, type PlantingCatalog } from "../content/PlantingCatalog";
import type { CropDefinition, SeedDefinition, FarmingDefinitionSet } from "../domain/FarmDefinitions";
import type { PlantGrowthDefinition } from "../procedural/core/PlantGrowthDefinition";
import type { PlantGrowthRecipeDocument } from "../procedural/core/PlantLeafTemplate";
import { parsePlantGrowthRecipe } from "../procedural/core/validation";
import { freezePlantContent } from "../procedural/core/immutable";
import {
  resolveSimulationConfig,
  validateSimulationParameters,
  type FarmingSimulationOverrides
} from "../config/FarmingSimulationConfig";
import { validateDefinitions, validateFarmingRules, validateFarmingSeeds } from "../domain/FarmValidation";

export interface FarmingCatalogData {
  readonly version: number;
  readonly crops: readonly CropDefinition[];
  readonly plants: readonly (Omit<PlantGrowthDefinition, "recipe"> & { readonly recipe: PlantGrowthRecipeDocument })[];
  readonly seeds: readonly SeedDefinition[];
}
export interface FarmingRulesData {
  readonly storage?: FarmingDefinitionSet["storage"];
  readonly version: number;
  readonly soilProfile: FarmingDefinitionSet["soilProfile"];
  readonly environmentProfile: FarmingDefinitionSet["environmentProfile"];
  readonly actionPolicy: FarmingDefinitionSet["actionPolicy"];
  readonly simulationConfig?: FarmingSimulationOverrides;
}

function immutable<T>(data: T): T {
  return freezePlantContent(JSON.parse(JSON.stringify(data)));
}
function hash(data: unknown): string {
  const text = JSON.stringify(data);
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(16);
}
abstract class FarmingResource<T> extends ReferResource {
  readonly contentHash: string;
  protected readonly snapshot: T;
  protected constructor(engine: Engine, data: T) {
    super(engine);
    this.snapshot = immutable(data);
    this.contentHash = hash(data);
  }
  get data(): T {
    return this.snapshot;
  }
}
export class FarmingCatalogResource extends FarmingResource<FarmingCatalogData> {
  readonly catalog: PlantingCatalog;
  constructor(engine: Engine, data: FarmingCatalogData) {
    const catalog = farmingCatalogFromData(data);
    super(engine, data);
    this.catalog = catalog;
  }
}
export class FarmingRulesResource extends FarmingResource<FarmingRulesData> {
  constructor(engine: Engine, data: FarmingRulesData) {
    validateFarmingRulesData(data);
    super(engine, data);
  }
}
/** Validate serialized catalog content without creating Engine resources. */
export function farmingCatalogFromData(data: FarmingCatalogData): PlantingCatalog {
  if (
    !Number.isSafeInteger(data?.version) ||
    data.version <= 0 ||
    !Array.isArray(data.plants) ||
    !Array.isArray(data.crops)
  )
    throw new TypeError("INVALID_ARGUMENT: 无效种植目录资源");
  const catalog = createPlantingCatalog(
    data.crops,
    data.plants.map((plant) => ({ ...plant, recipe: parsePlantGrowthRecipe(plant.recipe) }))
  );
  validateFarmingSeeds(catalog, data.seeds);
  return catalog;
}

export function validateFarmingRulesData(data: FarmingRulesData): void {
  if (!Number.isSafeInteger(data?.version)) throw new TypeError("INVALID_ARGUMENT: 无效种植规则版本");
  validateFarmingRules(data);
  validateSimulationParameters(resolveSimulationConfig(data.soilProfile, data.simulationConfig));
}

export function farmingDefinitionsFromData(
  data: FarmingCatalogData,
  rule: FarmingRulesData,
  catalog = farmingCatalogFromData(data)
): FarmingDefinitionSet {
  validateFarmingRulesData(rule);
  if (data.version !== rule.version) throw new Error("INVALID_DEFINITION: 目录与规则资源版本必须一致");
  const definitions: FarmingDefinitionSet = Object.freeze({
    version: data.version,
    catalog,
    seeds: data.seeds,
    soilProfile: rule.soilProfile,
    environmentProfile: rule.environmentProfile,
    storage: rule.storage,
    actionPolicy: rule.actionPolicy
  });
  validateDefinitions(definitions);
  return definitions;
}
export function farmingDefinitions(catalog: FarmingCatalogResource, rules: FarmingRulesResource): FarmingDefinitionSet {
  return farmingDefinitionsFromData(catalog.data, rules.data, catalog.catalog);
}
/** Serializable definitions shared by preset authoring and Engine resource construction. */
export function farmingResourceData(definitions: FarmingDefinitionSet, simulationConfig?: FarmingSimulationOverrides) {
  return {
    catalog: {
      version: definitions.version,
      crops: definitions.catalog.crops,
      plants: definitions.catalog.plants.map((plant) => ({
        ...plant,
        recipe: { ...plant.recipe, schemaVersion: 1 as const, leafTemplates: [] }
      })),
      seeds: definitions.seeds
    } satisfies FarmingCatalogData,
    rules: {
      version: definitions.version,
      soilProfile: definitions.soilProfile,
      environmentProfile: definitions.environmentProfile,
      actionPolicy: definitions.actionPolicy,
      storage: definitions.storage,
      ...(simulationConfig ? { simulationConfig } : {})
    } satisfies FarmingRulesData
  };
}
export function createFarmingResources(
  engine: Engine,
  definitions: FarmingDefinitionSet,
  simulationConfig?: FarmingSimulationOverrides
) {
  const data = farmingResourceData(definitions, simulationConfig);
  return {
    catalog: new FarmingCatalogResource(engine, data.catalog),
    rules: new FarmingRulesResource(engine, data.rules)
  };
}
export type FarmingResourceFile =
  | { version: 1; kind: "catalog"; data: FarmingCatalogData }
  | { version: 1; kind: "rules"; data: FarmingRulesData };
export function serializeFarmingResource(resource: FarmingCatalogResource | FarmingRulesResource): string {
  return JSON.stringify({
    version: 1,
    kind: resource instanceof FarmingCatalogResource ? "catalog" : "rules",
    data: resource.data
  });
}
/** Decode the serialized envelope; content validation belongs to authoring and resource construction. */
export function parseFarmingResourceFile(text: string): FarmingResourceFile {
  const file = JSON.parse(text) as FarmingResourceFile;
  if (file?.version !== 1) throw new Error("INVALID_ARGUMENT: 不支持的种植资源版本");
  if (!file.data || typeof file.data !== "object") throw new Error("INVALID_ARGUMENT: 无效种植资源内容");
  if (file.kind === "catalog") {
    if (!Array.isArray(file.data.plants) || !Array.isArray(file.data.crops) || !Array.isArray(file.data.seeds))
      throw new Error("INVALID_ARGUMENT: 无效种植目录资源");
    // Version 1 files predate the removal of fertility. Migrate only the retired
    // field at the serialization boundary; live catalog validation stays strict.
    for (const crop of file.data.crops) {
      if (crop?.growthFactors && typeof crop.growthFactors === "object")
        delete (crop.growthFactors as { fertility?: unknown }).fertility;
    }
  } else if (file.kind === "rules") {
    if (file.data.soilProfile && typeof file.data.soilProfile === "object")
      delete (file.data.soilProfile as { initialFertilityUnits?: unknown }).initialFertilityUnits;
  } else throw new Error("INVALID_ARGUMENT: 不支持的种植资源类型");
  return file;
}
export function validateFarmingResourceFile(file: FarmingResourceFile): void {
  if (file.kind === "catalog") farmingCatalogFromData(file.data);
  else validateFarmingRulesData(file.data);
}
export function parseFarmingResource(engine: Engine, text: string): FarmingCatalogResource | FarmingRulesResource {
  const file = parseFarmingResourceFile(text);
  return file.kind === "catalog"
    ? new FarmingCatalogResource(engine, file.data)
    : new FarmingRulesResource(engine, file.data);
}
class FarmingResourceLoader extends Loader<ReferResource> {
  load(item: LoadItem, manager: ResourceManager): AssetPromise<ReferResource> {
    return new AssetPromise((resolve, reject, _complete, _detail, onCancel) => {
      let cancelled = false;
      const request = (manager as unknown as { _request(url: string, config: unknown): AssetPromise<string> })._request(
        item.url!,
        { ...item, type: "text" }
      );
      onCancel?.(() => {
        cancelled = true;
        request.cancel?.();
      });
      request
        .then((text) => {
          if (cancelled) return;
          if (manager.engine.destroyed) throw new Error("DESTROYED: Engine 已销毁");
          resolve(parseFarmingResource(manager.engine, text));
        })
        .catch((error) => reject?.(error));
    });
  }
}
let registered = false;
export function registerFarmingResourceLoader(): void {
  if (registered) return;
  registered = true;
  resourceLoader("FarmingResource", ["farming"], true)(FarmingResourceLoader);
}

/** Engine reference ownership for a component's shared resource properties. */
export function retainFarmingResource(
  resource: FarmingCatalogResource | FarmingRulesResource | null,
  delta: number
): void {
  if (resource && !resource.destroyed)
    (resource as unknown as { _addReferCount(delta: number): void })._addReferCount(delta);
}
