import type { ISpineGeometry } from "@galacean/engine-design";
import { BoundingBox, Texture2D } from "@galacean/engine";
import { SpineBlendMode } from "../enums/SpineBlendMode";
import { SpineVertexStride } from "../SpineConstant";

/** @internal */
export class SpineGeometry implements ISpineGeometry<Texture2D> {
  vertices = new Float32Array();
  indices = new Uint16Array();
  vertexCount = 0;
  indexCount = 0;
  vertexStride: number = SpineVertexStride.withoutTint;
  zSpacing = 0;
  premultipliedAlpha = false;
  tintBlack = false;
  readonly bounds = new BoundingBox();
  readonly batches: { start: number; count: number; texture: Texture2D; blendMode: SpineBlendMode }[] = [];
  batchCount = 0;

  reset(zSpacing: number, premultipliedAlpha: boolean, tintBlack: boolean): void {
    this.zSpacing = zSpacing;
    this.premultipliedAlpha = premultipliedAlpha;
    this.tintBlack = tintBlack;
    this.vertexStride = tintBlack ? SpineVertexStride.withTint : SpineVertexStride.withoutTint;
    this.vertexCount = this.indexCount = this.batchCount = 0;
    // Release textures from inactive batches without discarding reusable batch records.
    for (const batch of this.batches) batch.texture = null;
    this.bounds.min.set(Infinity, Infinity, Infinity);
    this.bounds.max.set(-Infinity, -Infinity, -Infinity);
  }

  ensureCapacity(vertexCount: number, indexCount: number): void {
    const length = vertexCount * this.vertexStride;
    if (length > this.vertices.length) {
      const vertices = new Float32Array(Math.max(length, this.vertices.length * 2, 64 * this.vertexStride));
      vertices.set(this.vertices);
      this.vertices = vertices;
    }
    if (indexCount > this.indices.length) {
      const indices = new Uint16Array(Math.max(indexCount, this.indices.length * 2, 64));
      indices.set(this.indices);
      this.indices = indices;
    }
  }

  addBatch(start: number, count: number, texture: Texture2D, blendMode: SpineBlendMode): void {
    const index = this.batchCount++;
    const batch = this.batches[index] ?? (this.batches[index] = { start, count, texture, blendMode });
    batch.start = start;
    batch.count = count;
    batch.texture = texture;
    batch.blendMode = blendMode;
  }

  expandBounds(x: number, y: number, z: number): void {
    const { min, max } = this.bounds;
    min.set(Math.min(min.x, x), Math.min(min.y, y), Math.min(min.z, z));
    max.set(Math.max(max.x, x), Math.max(max.y, y), Math.max(max.z, z));
  }
}
