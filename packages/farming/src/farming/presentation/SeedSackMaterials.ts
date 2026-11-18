import { PBRMaterial, type MeshRenderer } from "@galacean/engine";
import atlas from "../assets/sowing/seed-sack-labels.json";

/** Owns only label material variants; prefab textures and the sack material remain borrowed. */
export class SeedSackMaterials {
  private readonly variants = new Map<string, PBRMaterial>();

  apply(renderer: MeshRenderer, seedId: string | undefined): void {
    const key = seedId ?? "tomato-seed";
    const cells: Readonly<Record<string, { column: number; row: number }>> = atlas.cells;
    const cell = cells[key];
    if (!cell) throw new Error(`Missing seed sack label: ${key}`);
    let material = this.variants.get(key);
    if (!material) {
      const source = renderer.getMaterial();
      if (!(source instanceof PBRMaterial)) throw new Error("Seed sack label requires a PBR material");
      material = source.clone();
      material.name = `SeedSackLabel/${key}`;
      material.tilingOffset.set(1 / atlas.grid, 1 / atlas.grid, cell.column / atlas.grid, cell.row / atlas.grid);
      this.variants.set(key, material);
    }
    renderer.setMaterial(material);
  }

  dispose(): void {
    for (const material of this.variants.values()) material.destroy();
    this.variants.clear();
  }
}
