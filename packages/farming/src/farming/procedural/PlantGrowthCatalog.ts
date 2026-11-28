import { parsePlantGrowthMetadata, type PlantGrowthReference } from "./core/PlantGrowthDefinition";
import type { PlantGrowthIssue } from "./core/PlantGrowthRegistry";
import recipeMetadata from "./plant-recipe-metadata.json";
import textures from "../assets/plant-textures/manifest.json";

const metadata = import.meta.glob<string>("../catalog/plants/*/procedural/plant.json", { eager: true, as: "raw" });
const atlases = import.meta.glob<string>("../assets/plant-textures/*.ktx2", { eager: true, as: "url" });
const atlasByPlant = new Map(
  textures.plants.map(({ id, texture }) => [id, atlases[`../assets/plant-textures/${texture}`]])
);
const plants = new Map<string, PlantGrowthReference>();
export const plantGrowthIssues: PlantGrowthIssue[] = [];
for (const [path, value] of Object.entries(metadata)) {
  try {
    const plant = parsePlantGrowthMetadata(JSON.parse(value));
    const recipe = recipeMetadata[plant.id as keyof typeof recipeMetadata];
    const atlasUrl = atlasByPlant.get(plant.id);
    if (!path.endsWith(`/${plant.id}/procedural/plant.json`) || !recipe || !atlasUrl || plants.has(plant.id))
      throw new Error(`无效植物资源：${plant.id}`);
    plants.set(plant.id, { ...plant, atlasUrl, recipeRevision: recipe.revision });
  } catch (error) {
    plantGrowthIssues.push({ path, message: error instanceof Error ? error.message : String(error) });
  }
}
export const listPlantGrowthDefinitions = () => [...plants.values()];
export const getPlantGrowthDefinition = (id: string) => plants.get(id);
