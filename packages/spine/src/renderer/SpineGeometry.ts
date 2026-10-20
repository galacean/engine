import type { ISpineGeometry } from "@galacean/engine-design";
import { BoundingBox, Material, Texture2D } from "@galacean/engine";
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
  defaultMaterial: Material | null = null;
  readonly bounds = new BoundingBox();
  readonly batches: {
    start: number;
    count: number;
    texture: Texture2D;
    blendMode: SpineBlendMode;
    material: Material | null;
  }[] = [];
  batchCount = 0;

  constructor(private _slotMaterials: ReadonlyMap<number, Material>) {}

  reset(zSpacing: number, premultipliedAlpha: boolean, tintBlack: boolean, defaultMaterial: Material | null): void {
    this.zSpacing = zSpacing;
    this.premultipliedAlpha = premultipliedAlpha;
    this.tintBlack = tintBlack;
    this.defaultMaterial = defaultMaterial;
    this.vertexStride = tintBlack ? SpineVertexStride.withTint : SpineVertexStride.withoutTint;
    this.vertexCount = this.indexCount = this.batchCount = 0;
    // Release references from inactive batches without discarding reusable batch records.
    for (const batch of this.batches) {
      batch.texture = null;
      batch.material = null;
    }
    this.bounds.min.set(Infinity, Infinity, Infinity);
    this.bounds.max.set(-Infinity, -Infinity, -Infinity);
  }

  append(
    vertices: ArrayLike<number>,
    vertexCount: number,
    indices: ArrayLike<number>,
    indexCount: number,
    texture: Texture2D,
    blendMode: SpineBlendMode,
    drawOrder: number,
    slotIndex: number
  ): void {
    if (!vertexCount || !indexCount) return;

    const vertexStart = this.vertexCount;
    const indexStart = this.indexCount;
    this._ensureCapacity(vertexStart + vertexCount, indexStart + indexCount);
    const { vertices: targetVertices, indices: targetIndices, vertexStride, tintBlack } = this;
    const z = drawOrder * this.zSpacing;
    const { min, max } = this.bounds;
    let targetOffset = vertexStart * vertexStride;
    let sourceOffset = 0;
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const x = vertices[sourceOffset++];
      const y = vertices[sourceOffset++];
      targetVertices[targetOffset++] = x;
      targetVertices[targetOffset++] = y;
      targetVertices[targetOffset++] = z;
      targetVertices[targetOffset++] = vertices[sourceOffset++]; // r
      targetVertices[targetOffset++] = vertices[sourceOffset++]; // g
      targetVertices[targetOffset++] = vertices[sourceOffset++]; // b
      targetVertices[targetOffset++] = vertices[sourceOffset++]; // a
      targetVertices[targetOffset++] = vertices[sourceOffset++]; // u
      targetVertices[targetOffset++] = vertices[sourceOffset++]; // v
      if (tintBlack) {
        targetVertices[targetOffset++] = vertices[sourceOffset++]; // darkR
        targetVertices[targetOffset++] = vertices[sourceOffset++]; // darkG
        targetVertices[targetOffset++] = vertices[sourceOffset++]; // darkB
        sourceOffset++; // darkA is derived by the shader, not stored in the vertex buffer.
      }
      min.set(Math.min(min.x, x), Math.min(min.y, y), Math.min(min.z, z));
      max.set(Math.max(max.x, x), Math.max(max.y, y), Math.max(max.z, z));
    }
    for (let i = 0; i < indexCount; i++) targetIndices[indexStart + i] = indices[i] + vertexStart;
    this.vertexCount += vertexCount;
    this.indexCount += indexCount;

    const lastBatch = this.batches[this.batchCount - 1];
    const material = this._slotMaterials.get(slotIndex) ?? this.defaultMaterial;
    if (
      lastBatch &&
      lastBatch.texture === texture &&
      lastBatch.blendMode === blendMode &&
      lastBatch.material === material
    ) {
      lastBatch.count += indexCount;
    } else {
      const index = this.batchCount++;
      const batch = this.batches[index] ?? (this.batches[index] = { start: 0, count: 0, texture, blendMode, material });
      batch.start = indexStart;
      batch.count = indexCount;
      batch.texture = texture;
      batch.blendMode = blendMode;
      batch.material = material;
    }
  }

  private _ensureCapacity(vertexCount: number, indexCount: number): void {
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
}
