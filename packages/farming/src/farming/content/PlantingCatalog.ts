import { z } from "zod";
import type { CropDefinition } from "../domain/FarmDefinitions";
import { validateCropGrowthFactors } from "../domain/GrowthFactors";
import { CropGrowthMapping } from "../presentation/CropGrowthMapping";
import { parsePlantGrowthMetadata, type PlantGrowthDefinition } from "../procedural/core/PlantGrowthDefinition";
import { parsePlantGrowthRecipe } from "../procedural/core/validation";
import { freezePlantContent } from "../procedural/core/immutable";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/);
const revision = z.number().int().positive();
const unit = z.number().finite().min(0).max(1);
const response = z
  .object({
    minimum: z.number().finite(),
    optimalMinimum: z.number().finite(),
    optimalMaximum: z.number().finite(),
    maximum: z.number().finite()
  })
  .strict();
const speciesSchema = z
  .object({
    id,
    version: revision,
    name: z.string().min(1),
    cycle: z
      .object({
        id,
        revision,
        growthTarget: revision,
        baseGrowthUnitsPerSecond: revision,
        stages: z.array(z.object({ id, name: z.string().min(1), minimumProgress: unit }).strict()).min(2)
      })
      .strict(),
    growthFactors: z
      .object({
        soilMoisture: response,
        airTemperature: response,
        light: response,
        soilPh: response,
        pestPressure: response
      })
      .strict(),
    appearance: z
      .object({
        plantId: id,
        plantRevision: revision,
        recipeRevision: revision,
        ageByStage: z.array(z.object({ stageId: id, age: unit }).strict()).min(2),
        emergence: z.object({ start: unit, end: unit }).strict()
      })
      .strict(),
    harvest: z.object({ itemId: id, itemName: z.string().min(1), quantity: revision }).strict()
  })
  .strict();

export interface PlantingCatalog {
  readonly crops: readonly CropDefinition[];
  readonly plants: readonly PlantGrowthDefinition[];
  getCrop(id: string): CropDefinition;
  getPlant(id: string): PlantGrowthDefinition;
  getMapping(cropId: string): CropGrowthMapping;
}
const catalogs = new WeakSet<object>();
export function requirePlantingCatalog(value: PlantingCatalog): void {
  if (!value || !catalogs.has(value)) throw new Error("需要经过 createPlantingCatalog 校验的种植目录");
}

/** No engine, Vite discovery, network or browser dependency. */
export function createPlantingCatalog(
  crops: readonly unknown[],
  plants: readonly PlantGrowthDefinition[]
): PlantingCatalog {
  const byPlant = new Map<string, PlantGrowthDefinition>();
  for (const definition of plants) {
    const { recipe: rawRecipe, atlasUrl, ...rawMetadata } = definition;
    const metadata = parsePlantGrowthMetadata(rawMetadata);
    const recipe = parsePlantGrowthRecipe(rawRecipe);
    if (metadata.id !== recipe.id || !atlasUrl || /\.(?:glb|gltf)(?:$|[?#])/i.test(atlasUrl))
      throw new Error(`无效程序化资源：${metadata.id}`);
    if (byPlant.has(metadata.id)) throw new Error(`重复植物 ID：${metadata.id}`);
    if ((recipe.volumes.some((v) => v.tint) || recipe.meshes?.some((m) => m.tint)) && !metadata.material.tintColors)
      throw new Error(`着色器官缺少颜色曲线：${metadata.id}`);
    byPlant.set(metadata.id, freezePlantContent({ ...metadata, recipe, atlasUrl }));
  }
  const byCrop = new Map<string, CropDefinition>();
  const mappings = new Map<string, CropGrowthMapping>();
  const cycles = new Map<string, string>();
  for (const raw of crops) {
    const crop: CropDefinition = speciesSchema.parse(raw);
    if (byCrop.has(crop.id)) throw new Error(`重复物种 ID：${crop.id}`);
    validateCropGrowthFactors(crop.growthFactors, crop.id);
    const stages = crop.cycle.stages;
    if (
      stages[0].minimumProgress !== 0 ||
      stages.at(-1)!.minimumProgress !== 1 ||
      new Set(stages.map((s) => s.id)).size !== stages.length ||
      stages.some((s, i) => i > 0 && s.minimumProgress <= stages[i - 1].minimumProgress)
    )
      throw new Error(`周期阶段必须唯一并完整覆盖 0..1：${crop.id}`);
    const cycleKey = crop.cycle.id;
    const serialized = JSON.stringify(crop.cycle);
    if (cycles.has(cycleKey) && cycles.get(cycleKey) !== serialized) throw new Error(`周期引用内容冲突：${cycleKey}`);
    cycles.set(cycleKey, serialized);
    const plant = byPlant.get(crop.appearance.plantId);
    if (
      !plant ||
      plant.revision !== crop.appearance.plantRevision ||
      plant.recipe.revision !== crop.appearance.recipeRevision
    )
      throw new Error(`物种引用缺失或修订不匹配：${crop.id}`);
    freezePlantContent(crop);
    mappings.set(crop.id, Object.freeze(new CropGrowthMapping(crop)));
    byCrop.set(crop.id, crop);
  }
  if (!byCrop.size) throw new Error("种植目录至少需要一种植物");
  const requireEntry = <T>(entries: Map<string, T>, id: string): T => {
    const value = entries.get(id);
    if (!value) throw new Error(`种植目录中不存在：${id}`);
    return value;
  };
  const catalog: PlantingCatalog = Object.freeze({
    crops: Object.freeze([...byCrop.values()]),
    plants: Object.freeze([...byPlant.values()]),
    getCrop: (id: string) => requireEntry(byCrop, id),
    getPlant: (id: string) => requireEntry(byPlant, id),
    getMapping: (id: string) => requireEntry(mappings, id)
  });
  catalogs.add(catalog);
  return catalog;
}
