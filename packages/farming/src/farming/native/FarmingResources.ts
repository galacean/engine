import { JSONAsset, type Engine } from "@galacean/engine-core";
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
import { storageDefinitions, validateStorageRules } from "../storage/StorageRules";

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
/** Standalone constructors use the same native JSONAsset as project-loaded resources. */
export class FarmingCatalogResource extends JSONAsset {
  constructor(engine: Engine, data: FarmingCatalogData) {
    farmingCatalogFromData(data);
    super(engine);
    this.data = immutable({ version: 1, kind: "catalog", data });
  }
  get catalog(): PlantingCatalog {
    return farmingCatalog(this).catalog;
  }
  get contentHash(): string {
    return farmingCatalog(this).contentHash;
  }
}
export class FarmingRulesResource extends JSONAsset {
  constructor(engine: Engine, data: FarmingRulesData) {
    validateFarmingRulesData(data);
    super(engine);
    this.data = immutable({ version: 1, kind: "rules", data });
  }
  get contentHash(): string {
    return farmingRules(this).contentHash;
  }
}

const decoded = new WeakMap<JSONAsset, { source: object; file: FarmingResourceFile }>();
const catalogs = new WeakMap<JSONAsset, { data: FarmingCatalogData; catalog: PlantingCatalog; contentHash: string }>();
/** Convert native JSON references to domain paths without mutating the shared asset. */
export function resolveFarmingJSONReferences(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if ("$ref" in value && typeof value.$ref === "string" && Object.keys(value).length === 1) return value.$ref;
  if (Array.isArray(value)) return value.map(resolveFarmingJSONReferences);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveFarmingJSONReferences(item)]));
}
function resourceFile(resource: JSONAsset): FarmingResourceFile {
  if (!(resource instanceof JSONAsset) || resource.destroyed) throw new Error("Invalid farming JSON asset");
  if (!resource.data || typeof resource.data !== "object") throw new Error("Missing farming JSON data");
  let cached = decoded.get(resource);
  if (cached?.source !== resource.data) {
    const file = parseFarmingResourceFile(JSON.stringify(resource.data));
    validateFarmingResourceFile(file);
    cached = { source: resource.data, file: immutable(file) };
    decoded.set(resource, cached);
  }
  return cached!.file;
}
export function farmingCatalog(resource: JSONAsset) {
  const file = resourceFile(resource);
  if (file.kind !== "catalog") throw new Error("Expected farming catalog JSON asset");
  let value = catalogs.get(resource);
  if (value?.data !== file.data) {
    value = { data: file.data, catalog: farmingCatalogFromData(file.data), contentHash: hash(file.data) };
    catalogs.set(resource, value);
  }
  return value!;
}
export function farmingRules(resource: JSONAsset) {
  const file = resourceFile(resource);
  if (file.kind !== "rules") throw new Error("Expected farming rules JSON asset");
  return { data: file.data, contentHash: hash(file.data) };
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
  validateStorageRules(storageDefinitions(data));
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
export function farmingDefinitions(catalog: JSONAsset, rules: JSONAsset): FarmingDefinitionSet {
  const view = farmingCatalog(catalog);
  return farmingDefinitionsFromData(view.data, farmingRules(rules).data, view.catalog);
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
/** Native JSON reference objects make atlas dependencies visible to the common project graph. */
export function encodeFarmingResourceFile(file: FarmingResourceFile): object {
  return file.kind === "catalog"
    ? {
        ...file,
        data: {
          ...file.data,
          plants: file.data.plants.map((plant) => ({
            ...plant,
            atlasUrl: /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(plant.atlasUrl) ? plant.atlasUrl : { $ref: plant.atlasUrl }
          }))
        }
      }
    : file;
}
export function serializeFarmingResource(resource: JSONAsset): string {
  resourceFile(resource);
  return JSON.stringify(encodeFarmingResourceFile(resourceFile(resource)));
}
/** Decode the serialized envelope; content validation belongs to authoring and resource construction. */
export function parseFarmingResourceFile(text: string): FarmingResourceFile {
  const file = resolveFarmingJSONReferences(JSON.parse(text)) as FarmingResourceFile;
  if (file?.version !== 1) throw new Error("INVALID_ARGUMENT: 不支持的种植资源版本");
  if (!file.data || typeof file.data !== "object") throw new Error("INVALID_ARGUMENT: 无效种植资源内容");
  if (file.kind === "catalog") {
    if (!Array.isArray(file.data.plants) || !Array.isArray(file.data.crops) || !Array.isArray(file.data.seeds))
      throw new Error("INVALID_ARGUMENT: 无效种植目录资源");
  } else if (file.kind !== "rules") throw new Error("INVALID_ARGUMENT: 不支持的种植资源类型");
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
