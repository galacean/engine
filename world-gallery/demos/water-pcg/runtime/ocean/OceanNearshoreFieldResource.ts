/** Reference-counted owner of immutable compiled Ocean nearshore CPU data. */
import type {
  OceanNearshoreCompiledData,
  OceanNearshoreStaticAtlas
} from "../../compiler/ocean/OceanNearshoreCompiledTypes";

export interface OceanNearshoreFieldResourceMetadata {
  readonly sourceId: string;
  readonly compiledHash: string;
  readonly width: number;
  readonly height: number;
}

export class OceanNearshoreFieldResource {
  private _data?: OceanNearshoreCompiledData;
  private _wetMask?: Uint8Array;
  private _bedHeights?: Float32Array;
  private _waterDepths?: Float32Array;
  private _shoreDistances?: Float32Array;
  private _shoreNormalsXZ?: Float32Array;
  private _baseCurrentsXZ?: Float32Array;
  private readonly _texelCount: number;
  private readonly _byteLength: number;
  private _referenceCount = 0;
  private _disposeRequested = false;

  private constructor(
    readonly metadata: Readonly<OceanNearshoreFieldResourceMetadata>,
    data: OceanNearshoreCompiledData
  ) {
    this._data = data;
    this._wetMask = data.queryGrid.wetMask.toTypedArray();
    this._bedHeights = data.queryGrid.bedHeights.toTypedArray();
    this._waterDepths = data.queryGrid.waterDepths.toTypedArray();
    this._shoreDistances = data.queryGrid.shoreDistances.toTypedArray();
    this._shoreNormalsXZ = data.queryGrid.shoreNormalsXZ.toTypedArray();
    this._baseCurrentsXZ = data.queryGrid.baseCurrentsXZ.toTypedArray();
    this._texelCount = data.grid.width * data.grid.height;
    this._byteLength = data.stats.queryByteLength + data.stats.atlasByteLength;
  }

  static create(data: OceanNearshoreCompiledData): OceanNearshoreFieldResource {
    return new OceanNearshoreFieldResource(
      Object.freeze({
        sourceId: data.sourceId,
        compiledHash: data.sourceHash,
        width: data.grid.width,
        height: data.grid.height
      }),
      data
    );
  }

  get data(): OceanNearshoreCompiledData {
    if (!this._data) throw new Error("Ocean nearshore field resource has been disposed.");
    return this._data;
  }

  get atlas(): OceanNearshoreStaticAtlas {
    return this.data.staticAtlas;
  }

  get referenceCount(): number {
    return this._referenceCount;
  }

  get disposeRequested(): boolean {
    return this._disposeRequested;
  }

  get isDisposed(): boolean {
    return this._data === undefined;
  }

  get byteLength(): number {
    return this._data ? this._byteLength : 0;
  }

  retain(): void {
    if (!this._data || this._disposeRequested) {
      throw new Error("Cannot retain a disposing Ocean nearshore field resource.");
    }
    this._referenceCount++;
  }

  release(): void {
    if (this._referenceCount <= 0) {
      throw new Error("Ocean nearshore field resource reference count is already zero.");
    }
    this._referenceCount--;
    if (this._referenceCount === 0 && this._disposeRequested) this._finalizeDispose();
  }

  dispose(): void {
    this._disposeRequested = true;
    if (this._referenceCount === 0) this._finalizeDispose();
  }

  wetMaskAt(index: number): number {
    const values = this._requireArray(this._wetMask);
    this._assertAvailableIndex(index);
    return values[index];
  }

  bedHeightAt(index: number): number {
    const values = this._requireArray(this._bedHeights);
    this._assertAvailableIndex(index);
    return values[index];
  }

  waterDepthAt(index: number): number {
    const values = this._requireArray(this._waterDepths);
    this._assertAvailableIndex(index);
    return values[index];
  }

  shoreDistanceAt(index: number): number {
    const values = this._requireArray(this._shoreDistances);
    this._assertAvailableIndex(index);
    return values[index];
  }

  shoreNormalXAt(index: number): number {
    const values = this._requireArray(this._shoreNormalsXZ);
    this._assertAvailableIndex(index);
    return values[index * 2];
  }

  shoreNormalZAt(index: number): number {
    const values = this._requireArray(this._shoreNormalsXZ);
    this._assertAvailableIndex(index);
    return values[index * 2 + 1];
  }

  baseCurrentXAt(index: number): number {
    const values = this._requireArray(this._baseCurrentsXZ);
    this._assertAvailableIndex(index);
    return values[index * 2];
  }

  baseCurrentZAt(index: number): number {
    const values = this._requireArray(this._baseCurrentsXZ);
    this._assertAvailableIndex(index);
    return values[index * 2 + 1];
  }

  private _assertAvailableIndex(index: number): void {
    if (!this._data) throw new Error("Ocean nearshore field resource has been disposed.");
    if (!Number.isInteger(index) || index < 0 || index >= this._texelCount) {
      throw new RangeError(`Ocean nearshore texel index ${index} is outside the resource.`);
    }
  }

  private _requireArray<T extends Uint8Array | Float32Array>(values: T | undefined): T {
    if (!values) throw new Error("Ocean nearshore field resource has been disposed.");
    return values;
  }

  private _finalizeDispose(): void {
    this._data = undefined;
    this._wetMask = undefined;
    this._bedHeights = undefined;
    this._waterDepths = undefined;
    this._shoreDistances = undefined;
    this._shoreNormalsXZ = undefined;
    this._baseCurrentsXZ = undefined;
  }
}
