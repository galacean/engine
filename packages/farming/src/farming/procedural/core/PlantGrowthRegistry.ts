import { parsePlantGrowthMetadata, type PlantGrowthDefinition } from "./PlantGrowthDefinition";
import { parsePlantGrowthRecipe } from "./validation";

export interface PlantGrowthPack {
  readonly path: string;
  readonly metadata: unknown;
  readonly recipe: unknown;
  readonly atlasUrl: string;
}
export interface PlantGrowthIssue {
  readonly path: string;
  readonly message: string;
}

/** Shared by Vite discovery, CLI validation and tests. A malformed pack cannot break unrelated assets. */
export function createPlantGrowthRegistry(packs: readonly PlantGrowthPack[]) {
  const definitions = new Map<string, PlantGrowthDefinition>();
  const issues: PlantGrowthIssue[] = [];
  const conflicted = new Set<string>();
  for (const pack of packs) {
    try {
      const metadata = parsePlantGrowthMetadata(
        typeof pack.metadata === "string" ? JSON.parse(pack.metadata) : pack.metadata
      );
      const recipe = parsePlantGrowthRecipe(typeof pack.recipe === "string" ? JSON.parse(pack.recipe) : pack.recipe);
      if (metadata.id !== recipe.id) throw new Error("植物定义与配方 ID 不一致");
      if (!pack.atlasUrl) throw new Error("缺少植物图集");
      if (!pack.path.endsWith(`/${metadata.id}/procedural/plant.json`)) throw new Error("植物 ID 与内容目录不一致");
      if (definitions.has(metadata.id) || conflicted.has(metadata.id)) {
        definitions.delete(metadata.id);
        conflicted.add(metadata.id);
        throw new Error(`重复的植物定义：${metadata.id}`);
      }
      if ((recipe.volumes.some((v) => v.tint) || recipe.meshes?.some((m) => m.tint)) && !metadata.material.tintColors)
        throw new Error("着色部件需要配置 tintColors");
      definitions.set(metadata.id, { ...metadata, recipe, atlasUrl: pack.atlasUrl });
    } catch (error) {
      issues.push({ path: pack.path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { issues, list: () => [...definitions.values()], get: (id: string) => definitions.get(id) };
}
