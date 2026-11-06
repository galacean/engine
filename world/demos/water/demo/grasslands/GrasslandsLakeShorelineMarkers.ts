import { Entity, MeshRenderer, ModelMesh, UnlitMaterial, Vector3 } from "@galacean/engine";
import { destroyWaterOwnedMesh } from "@galacean/engine-water/water/runtime/resources/index";
import type { SampledLakeBoundary } from "@galacean/engine-water/water/index";
import type { GrasslandsTerrainRecipe } from "./GrasslandsPcgTypes.ts";
import { sampleGrasslandsTerrainModelHeight } from "./GrasslandsTerrainModel.ts";

const MARKER_RADIUS_METERS = 0.16;
const MARKER_HEIGHT_OFFSET_METERS = 0.12;
const MARKER_SEGMENT_COUNT = 6;
const MARKER_OFFSETS = Array.from({ length: MARKER_SEGMENT_COUNT }, (_, index) => {
  const angle = (index * Math.PI * 2) / MARKER_SEGMENT_COUNT;
  return [Math.cos(angle), Math.sin(angle)] as const;
});

/** One batched mesh marks the actual compiled samples; uploads only when the boundary changes. */
export class GrasslandsLakeShorelineMarkers {
  private readonly _entity: Entity;
  private readonly _renderer: MeshRenderer;
  private readonly _material: UnlitMaterial;
  private _mesh?: ModelMesh;
  private _boundary?: SampledLakeBoundary;
  private _sampleCount = 0;

  get sampleCount(): number {
    return this._sampleCount;
  }

  constructor(
    parent: Entity,
    private readonly _terrain: GrasslandsTerrainRecipe
  ) {
    this._entity = parent.createChild("lake-shore-sample-markers");
    this._renderer = this._entity.addComponent(MeshRenderer);
    this._renderer.castShadows = false;
    this._renderer.receiveShadows = false;
    this._material = new UnlitMaterial(parent.engine);
    this._material.baseColor.set(1, 0.01, 0.01, 1);
    this._renderer.setMaterial(this._material);
  }

  update(boundary: SampledLakeBoundary): void {
    if (boundary === this._boundary) return;
    // Prepared and compiled boundaries are detached copies of the same samples.
    // Rebinding them must not perform another fallible GPU upload during publication.
    const previous = this._boundary;
    if (
      previous &&
      previous.waterLevel === boundary.waterLevel &&
      previous.rings.length === boundary.rings.length &&
      boundary.rings.every(
        (ring, r) =>
          ring.length === previous.rings[r].length &&
          ring.every((point, i) => point[0] === previous.rings[r][i][0] && point[1] === previous.rings[r][i][1])
      )
    ) {
      this._boundary = boundary;
      return;
    }
    const positions: Vector3[] = [];
    const sampleCount = boundary.rings.reduce((total, ring) => total + ring.length, 0);
    const indices = new Uint16Array(sampleCount * MARKER_SEGMENT_COUNT * 3);
    let indexOffset = 0;
    for (const ring of boundary.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x, z] = ring[i];
        const before = ring[(i + ring.length - 1) % ring.length];
        const after = ring[(i + 1) % ring.length];
        const radius = Math.min(
          MARKER_RADIUS_METERS,
          Math.hypot(x - before[0], z - before[1]) * 0.25,
          Math.hypot(x - after[0], z - after[1]) * 0.25
        );
        const y =
          Math.max(boundary.waterLevel, sampleGrasslandsTerrainModelHeight(this._terrain, x, z)) +
          MARKER_HEIGHT_OFFSET_METERS;
        const firstVertex = positions.length;
        positions.push(new Vector3(x, y, z));
        for (let segment = 0; segment < MARKER_SEGMENT_COUNT; segment++) {
          const [offsetX, offsetZ] = MARKER_OFFSETS[segment];
          positions.push(new Vector3(x + offsetX * radius, y, z + offsetZ * radius));
          indices[indexOffset++] = firstVertex;
          indices[indexOffset++] = firstVertex + 1 + ((segment + 1) % MARKER_SEGMENT_COUNT);
          indices[indexOffset++] = firstVertex + 1 + segment;
        }
      }
    }
    const mesh = new ModelMesh(this._entity.engine, "lake-shore-sample-markers");
    try {
      mesh.setPositions(positions);
      mesh.setIndices(indices);
      mesh.addSubMesh(0, indices.length);
      mesh.uploadData(true);
    } catch (error) {
      destroyWaterOwnedMesh(mesh);
      throw error;
    }
    this._renderer.mesh = mesh;
    destroyWaterOwnedMesh(this._mesh);
    this._mesh = mesh;
    this._boundary = boundary;
    this._sampleCount = sampleCount;
  }

  setVisible(visible: boolean): void {
    this._entity.isActive = visible;
  }

  destroy(): void {
    this._entity.destroy();
    destroyWaterOwnedMesh(this._mesh);
    this._mesh = undefined;
    this._boundary = undefined;
    this._material.destroy();
    this._sampleCount = 0;
  }
}
