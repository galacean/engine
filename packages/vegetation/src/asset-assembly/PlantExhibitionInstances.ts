import { Entity, Matrix, MeshRenderer, Script } from "@galacean/engine";
import type { PlantExhibitionStand } from "./ProceduralPlantLibraryRuntime";
import type { ProceduralPlantLibraryEntry } from "./ProceduralPlantAsset";

import { plantExhibitionBaseId, PLANT_EXHIBITION_SIZE_VARIANTS, sizeVariantEntry } from "./PlantExhibitionLayout";

/** Mirrors an existing production stand's ordinary renderers, including their LOD and shader data.
 * Only the outer object transform changes. Meshes, materials and textures remain source-owned.
 */
export class ScaledPlantExhibitionStand extends Script implements PlantExhibitionStand {
  entry!: ProceduralPlantLibraryEntry;
  private _source!: PlantExhibitionStand;
  private _scale!: readonly [number, number, number];
  private _center: [number, number] = [0, 0];
  private _renderers: MeshRenderer[] = [];
  private readonly _matrix = new Matrix();
  private readonly _world = new Matrix();

  initialize(
    source: PlantExhibitionStand,
    variant: (typeof PLANT_EXHIBITION_SIZE_VARIANTS)[number],
    order: number
  ): void {
    this._source = source;
    this._scale = variant.scale;
    this.entry = sizeVariantEntry(source.entry, variant, order);
    const bounds = source.getBounds();
    this._center = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
    this.onLateUpdate();
  }

  isEnabled(): boolean {
    return this._source.isEnabled?.() !== false;
  }
  setVisible(visible: boolean): void {
    this.entity.isActive = visible;
  }
  translate(x: number, z: number): void {
    this._center[0] += x;
    this._center[1] += z;
    this.onLateUpdate();
  }
  getTriangleCount(): number {
    return this._source.getTriangleCount();
  }
  getRenderers(): readonly MeshRenderer[] {
    return this._renderers;
  }
  getBounds() {
    const bounds = this._source.getBounds();
    const x = ((bounds.max[0] - bounds.min[0]) * this._scale[0]) / 2;
    const z = ((bounds.max[2] - bounds.min[2]) * this._scale[2]) / 2;
    return {
      min: [this._center[0] - x, bounds.min[1] * this._scale[1], this._center[1] - z] as [number, number, number],
      max: [this._center[0] + x, bounds.max[1] * this._scale[1], this._center[1] + z] as [number, number, number]
    };
  }

  override onLateUpdate(): void {
    if (!this._source) return;
    const sources = this._source.getRenderers();
    while (this._renderers.length > sources.length) this._renderers.pop()!.entity.destroy();
    const bounds = this._source.getBounds();
    const matrix = this._matrix.elements;
    this._matrix.identity();
    matrix[0] = this._scale[0];
    matrix[5] = this._scale[1];
    matrix[10] = this._scale[2];
    matrix[12] = this._center[0] - ((bounds.min[0] + bounds.max[0]) / 2) * this._scale[0];
    matrix[14] = this._center[1] - ((bounds.min[2] + bounds.max[2]) / 2) * this._scale[2];
    sources.forEach((source, index) => {
      const renderer =
        this._renderers[index] ??
        (this._renderers[index] = this.entity.createChild(source.entity.name).addComponent(MeshRenderer));
      renderer.mesh = source.mesh;
      renderer.setMaterials([...source.getMaterials()]);
      source.shaderData.cloneTo(renderer.shaderData);
      renderer.enableVertexColor = source.enableVertexColor;
      renderer.castShadows = source.castShadows;
      renderer.receiveShadows = source.receiveShadows;
      renderer.enabled = source.enabled && source.entity.isActiveInHierarchy;
      Matrix.multiply(this._matrix, source.entity.transform.worldMatrix, this._world);
      renderer.entity.transform.worldMatrix = this._world;
    });
  }
}

export function addMissingPlantSizeVariants(
  owner: Entity,
  stands: readonly PlantExhibitionStand[],
  libraryEntries: readonly ProceduralPlantLibraryEntry[] = []
): PlantExhibitionStand[] {
  const counts = new Map<string, number>();
  const row = (stand: PlantExhibitionStand) => plantExhibitionBaseId(stand.entry);
  const libraryRows = new Set(libraryEntries.map(plantExhibitionBaseId));
  for (const stand of stands.filter((stand) => stand.isEnabled?.() !== false))
    counts.set(row(stand), (counts.get(row(stand)) ?? 0) + 1);
  return stands.flatMap((stand) => {
    // Disabled catalog bases can become visible after switching the editable tree.
    if (libraryRows.has(row(stand)) || ((counts.get(row(stand)) ?? 1) > 1 && stand.isEnabled?.() !== false))
      return [stand];
    return [
      stand,
      ...PLANT_EXHIBITION_SIZE_VARIANTS.map((variant, index) => {
        const instance = owner
          .createChild(`${stand.entry.id} ${variant.label}`)
          .addComponent(ScaledPlantExhibitionStand);
        instance.initialize(stand, variant, index + 1);
        return instance;
      })
    ];
  });
}
