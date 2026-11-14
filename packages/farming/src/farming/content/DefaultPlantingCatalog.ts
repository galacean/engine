import { CROP_DEFINITIONS } from "./CropDefinitions";
import { createPlantingCatalog } from "./PlantingCatalog";
import { listPlantGrowthDefinitions, plantGrowthIssues } from "../procedural/PlantGrowthCatalog";
if (plantGrowthIssues.length) throw new Error(plantGrowthIssues.map((i) => `${i.path}: ${i.message}`).join("\n"));
export const plantingCatalog = createPlantingCatalog(CROP_DEFINITIONS, listPlantGrowthDefinitions());
