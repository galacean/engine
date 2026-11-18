import { Material, Vector4, type MeshRenderer } from "@galacean/engine";
import atlas from "../assets/sowing/seed-sack-labels.json";

/** Owns only label material variants; prefab textures and the sack material remain borrowed. */
export class SeedSackMaterials {
  private readonly variants = new Map<Material, Map<string, Material>>();
  private readonly bindings = new Map<MeshRenderer, { source: Material; variant: Material }>();

  apply(renderer: MeshRenderer, seedId: string | undefined): void {
    const key = seedId ?? "tomato-seed";
    const cells: Readonly<Record<string, { column: number; row: number }>> = atlas.cells;
    const cell = cells[key];
    if (!cell) throw new Error(`Missing seed sack label: ${key}`);
    let binding = this.bindings.get(renderer);
    if (binding && renderer.getMaterial() !== binding.variant) {
      this.detach(renderer);
      binding = undefined;
    }
    const source = binding?.source ?? renderer.getMaterial();
    if (!source || source.shader.name !== "PBR") throw new Error("Seed sack label requires a PBR material");
    let variants = this.variants.get(source);
    if (!variants) this.variants.set(source, (variants = new Map()));
    let material = variants.get(key);
    if (!material) {
      material = source.clone();
      material.name = `SeedSackLabel/${key}`;
      material.shaderData.setVector4(
        "material_TilingOffset",
        new Vector4(1 / atlas.grid, 1 / atlas.grid, cell.column / atlas.grid, cell.row / atlas.grid)
      );
      material._addReferCount(1);
      variants.set(key, material);
    }
    // The original can become unreferenced when the label switches to a variant.
    if (!binding) source._addReferCount(1);
    this.bindings.set(renderer, { source, variant: material });
    renderer.setMaterial(material);
  }

  private detach(renderer: MeshRenderer): void {
    const binding = this.bindings.get(renderer);
    if (!binding) return;
    if (!renderer.destroyed && renderer.getMaterial() === binding.variant) renderer.setMaterial(binding.source);
    binding.source._addReferCount(-1);
    this.bindings.delete(renderer);
  }

  dispose(): void {
    for (const renderer of this.bindings.keys()) this.detach(renderer);
    for (const variants of this.variants.values()) {
      for (const material of variants.values()) {
        material._addReferCount(-1);
        material.destroy();
      }
    }
    this.variants.clear();
  }
}
