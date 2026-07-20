/** Reference-counted owner for immutable heightfield-water compiler output. */
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";

export interface HeightfieldWaterResourceMetadata {
  readonly sourceId: string;
  readonly compiledHash: string;
  readonly chunkCount: number;
}

function estimateByteLength(data: HeightfieldWaterCompiledData): number {
  let bytes = data.localMapAtlas.pixels.length;
  for (const chunk of data.chunks) {
    const geometry = chunk.geometry;
    bytes += geometry.positions.length * Float32Array.BYTES_PER_ELEMENT;
    bytes += geometry.normals.length * Float32Array.BYTES_PER_ELEMENT;
    bytes += geometry.tangents.length * Float32Array.BYTES_PER_ELEMENT;
    bytes += geometry.uvs.length * Float32Array.BYTES_PER_ELEMENT;
    bytes += geometry.indices.length * Uint16Array.BYTES_PER_ELEMENT;
  }
  for (const component of data.components) {
    bytes += component.wetTexelIndices.length * Uint32Array.BYTES_PER_ELEMENT;
  }
  bytes += data.queryGrid.wetMask.length;
  bytes += data.queryGrid.componentIndices.length * Int32Array.BYTES_PER_ELEMENT;
  bytes += data.queryGrid.surfaceHeights.length * Float32Array.BYTES_PER_ELEMENT;
  bytes += data.queryGrid.bedHeights.length * Float32Array.BYTES_PER_ELEMENT;
  bytes += data.queryGrid.flowVectorsXZ.length * Float32Array.BYTES_PER_ELEMENT;
  bytes += data.waveSet.packedShaderData.length * Float32Array.BYTES_PER_ELEMENT;
  return bytes;
}

export class HeightfieldWaterResource {
  private _data?: HeightfieldWaterCompiledData;
  private readonly _byteLength: number;
  private _referenceCount = 0;
  private _disposeRequested = false;

  private constructor(
    readonly metadata: HeightfieldWaterResourceMetadata,
    data: HeightfieldWaterCompiledData
  ) {
    this._data = data;
    this._byteLength = estimateByteLength(data);
  }

  static create(data: HeightfieldWaterCompiledData): HeightfieldWaterResource {
    return new HeightfieldWaterResource(
      Object.freeze({
        sourceId: data.sourceId,
        compiledHash: data.sourceHash,
        chunkCount: data.chunks.length
      }),
      data
    );
  }

  get data(): HeightfieldWaterCompiledData {
    if (!this._data) throw new Error("Heightfield water resource has been disposed.");
    return this._data;
  }

  get referenceCount(): number {
    return this._referenceCount;
  }

  get isDisposed(): boolean {
    return this._data === undefined;
  }

  get disposeRequested(): boolean {
    return this._disposeRequested;
  }

  get byteLength(): number {
    return this._data ? this._byteLength : 0;
  }

  retain(): void {
    if (!this._data || this._disposeRequested) {
      throw new Error("Cannot retain a disposing heightfield water resource.");
    }
    this._referenceCount++;
  }

  release(): void {
    if (this._referenceCount <= 0) {
      throw new Error("Heightfield water resource reference count is already zero.");
    }
    this._referenceCount--;
    if (this._referenceCount === 0 && this._disposeRequested) this._finalizeDispose();
  }

  dispose(): void {
    this._disposeRequested = true;
    if (this._referenceCount === 0) this._finalizeDispose();
  }

  private _finalizeDispose(): void {
    this._data = undefined;
  }
}
