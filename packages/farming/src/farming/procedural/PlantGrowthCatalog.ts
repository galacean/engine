import { createPlantGrowthRegistry } from "./core/PlantGrowthRegistry";
const metadata = import.meta.glob<string>("../catalog/plants/*/procedural/plant.json", { eager: true, as: "raw" });
const recipes = import.meta.glob<string>("../catalog/plants/*/procedural/recipe.json", { eager: true, as: "raw" });
import textures from "../assets/plant-textures/manifest.json";
const atlases = import.meta.glob<string>("../assets/plant-textures/*.ktx2", { eager: true, as: "url" });
const atlasByPlant = new Map(
  textures.plants.map(({ id, texture }) => [id, atlases[`../assets/plant-textures/${texture}`]])
);
const registry = createPlantGrowthRegistry(
  Object.entries(metadata).map(([path, value]) => {
    const directory = path.slice(0, path.lastIndexOf("/") + 1);
    return {
      path,
      metadata: value,
      recipe: recipes[directory + "recipe.json"],
      atlasUrl: atlasByPlant.get(path.split("/").at(-3)!) ?? ""
    };
  })
);
export const plantGrowthIssues = registry.issues;
export const listPlantGrowthDefinitions = registry.list;
export const getPlantGrowthDefinition = registry.get;
