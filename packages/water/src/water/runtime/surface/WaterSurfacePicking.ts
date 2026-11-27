import type { Material } from "@galacean/engine-core";

const surfaces = new WeakMap<Material, string>();
/** Materials opt into the shared Water pick output; effects and diagnostic carriers are excluded. */
export function registerWaterSurfacePicking(material: Material, depthWriteProperty: string): void {
  surfaces.set(material, depthWriteProperty);
}
export function supportsWaterSurfacePicking(material: Material): boolean {
  return surfaces.has(material);
}
/** Reusable synchronous override. Each caller owns its state; nested callers restore in reverse order. */
export class WaterSurfacePickingState {
  private readonly materials: (Material | undefined)[] = [];
  private readonly properties: string[] = [];
  private readonly values: number[] = [];
  private count = 0;
  prepare(materials: readonly (Material | null | undefined)[]): void {
    if (this.count) throw new Error("Water picking state is already active");
    try {
      for (let i = 0; i < materials.length; i++) {
        const material = materials[i];
        if (!material) continue;
        const property = surfaces.get(material);
        if (!property) continue;
        const index = this.count++;
        this.materials[index] = material;
        this.properties[index] = property;
        this.values[index] = material.shaderData.getInt(property) ?? 1;
        material.shaderData.setInt(property, 1);
      }
    } catch (error) {
      this.restore();
      throw error;
    }
  }
  restore(): void {
    while (this.count) {
      const index = --this.count,
        material = this.materials[index]!;
      this.materials[index] = undefined;
      material.shaderData.setInt(this.properties[index]!, this.values[index]!);
    }
  }
}
