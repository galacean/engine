import type { PlantGrowthDefinition, PlantGrowthEntry } from "../core/PlantGrowthDefinition";
import { parsePlantGrowthRecipe } from "../core/validation";

const recipes = import.meta.glob<unknown>("../../catalog/plants/*/procedural/recipe.json", { import: "default" });
const pending = new WeakMap<PlantGrowthEntry, Promise<PlantGrowthDefinition>>();

export async function loadPlantGrowthDefinition(entry: PlantGrowthEntry): Promise<PlantGrowthDefinition> {
  if ("recipe" in entry) return entry;
  let load = pending.get(entry);
  if (!load) {
    const { recipeRevision, ...metadata } = entry;
    const source = recipes[`../../catalog/plants/${entry.id}/procedural/recipe.json`];
    if (!source) throw new Error(`缺少程序化配方：${entry.id}`);
    load = source().then((raw) => {
      const recipe = parsePlantGrowthRecipe(raw);
      if (recipe.id !== entry.id || recipe.revision !== recipeRevision)
        throw new Error(`程序化配方修订不匹配：${entry.id}`);
      if ((recipe.volumes.some((v) => v.tint) || recipe.meshes?.some((m) => m.tint)) && !entry.material.tintColors)
        throw new Error(`着色器官缺少颜色曲线：${entry.id}`);
      return Object.freeze({ ...metadata, recipe });
    });
    pending.set(entry, load);
    void load.catch(() => pending.delete(entry));
  }
  return load;
}
