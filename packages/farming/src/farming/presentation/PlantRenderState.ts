import { z } from "zod";
import { requirePlantingCatalog, type PlantingCatalog } from "../content/PlantingCatalog";
import type { CropState } from "../domain/FarmState";
import { DEFAULT_PLANT_SHAPE, validatePlantShape, type PlantShape } from "../procedural/core/PlantGrowthRecipe";
import { freezePlantContent } from "../procedural/core/immutable";

export interface PlantRenderState {
  readonly instanceId: string;
  readonly cropId: string;
  readonly cropRevision: number;
  readonly cycleId: string;
  readonly cycleRevision: number;
  readonly plantId: string;
  readonly plantRevision: number;
  readonly recipeRevision: number;
  readonly progress: number;
  readonly shape: PlantShape;
}
const revision = z.number().int().positive();
const schema = z
  .object({
    instanceId: z.string().min(1),
    cropId: z.string().min(1),
    cropRevision: revision,
    cycleId: z.string().min(1),
    cycleRevision: revision,
    plantId: z.string().min(1),
    plantRevision: revision,
    recipeRevision: revision,
    progress: z.number().finite().min(0).max(1),
    shape: z
      .object({ leafSpread: z.number().finite(), stemBend: z.number().finite(), fruitScale: z.number().finite() })
      .strict()
  })
  .strict();
export function validatePlantRenderState(catalog: PlantingCatalog, input: PlantRenderState): PlantRenderState {
  requirePlantingCatalog(catalog);
  const state = schema.parse(input);
  validatePlantShape(state.shape);
  const crop = catalog.getCrop(state.cropId);
  if (
    state.cropRevision !== crop.version ||
    state.cycleId !== crop.cycle.id ||
    state.cycleRevision !== crop.cycle.revision ||
    state.plantId !== crop.appearance.plantId ||
    state.plantRevision !== crop.appearance.plantRevision ||
    state.recipeRevision !== crop.appearance.recipeRevision
  )
    throw new Error("植物状态与内容引用不匹配");
  return freezePlantContent(state);
}
/** External hosts supply confirmed progress. This function does not simulate time. */
export function createPlantRenderState(
  catalog: PlantingCatalog,
  cropId: string,
  instanceId: string,
  progress: number,
  shape: PlantShape = DEFAULT_PLANT_SHAPE
): PlantRenderState {
  const crop = catalog.getCrop(cropId);
  return validatePlantRenderState(catalog, {
    instanceId,
    cropId,
    cropRevision: crop.version,
    cycleId: crop.cycle.id,
    cycleRevision: crop.cycle.revision,
    plantId: crop.appearance.plantId,
    plantRevision: crop.appearance.plantRevision,
    recipeRevision: crop.appearance.recipeRevision,
    progress,
    shape
  });
}
export function cropRenderState(catalog: PlantingCatalog, crop: CropState): PlantRenderState {
  return validatePlantRenderState(catalog, {
    instanceId: crop.instanceId,
    cropId: crop.cropId,
    cropRevision: crop.cropDefinitionVersion,
    cycleId: crop.cycleId,
    cycleRevision: crop.cycleRevision,
    plantId: crop.plantDefinitionId,
    plantRevision: crop.plantDefinitionRevision,
    recipeRevision: crop.recipeRevision,
    progress: crop.growthUnits / catalog.getCrop(crop.cropId).cycle.growthTarget,
    shape: crop.shape
  });
}
