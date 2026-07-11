import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import {
  deserializeRiverResource,
  serializeRiverResource,
  type RiverResourceMetadata
} from "../../compiler/river/RiverResourceSerializer";
import type { RiverCompiledData } from "../../compiler/river/types";

export class RiverResource {
  private _data?: RiverCompiledData;
  private _serializedBytes?: Uint8Array;
  private _referenceCount = 0;
  private _disposeRequested = false;

  private constructor(
    readonly metadata: RiverResourceMetadata,
    data: RiverCompiledData,
    serializedBytes: Uint8Array
  ) {
    this._data = data;
    this._serializedBytes = serializedBytes;
  }

  static create(descriptor: RiverNetworkDescriptor, data: RiverCompiledData): RiverResource {
    const serialized = serializeRiverResource(descriptor, data);
    return new RiverResource(serialized.metadata, data, serialized.bytes);
  }

  static deserialize(bytes: Uint8Array): RiverResource {
    const deserialized = deserializeRiverResource(bytes);
    return new RiverResource(deserialized.metadata, deserialized.data, bytes.slice());
  }

  get data(): RiverCompiledData {
    if (!this._data) throw new Error("River resource has been disposed.");
    return this._data;
  }

  get referenceCount(): number {
    return this._referenceCount;
  }

  get isDisposed(): boolean {
    return this._data === undefined;
  }

  get byteLength(): number {
    return this._serializedBytes?.byteLength ?? 0;
  }

  serialize(): Uint8Array {
    if (!this._serializedBytes) throw new Error("River resource has been disposed.");
    return this._serializedBytes.slice();
  }

  retain(): void {
    if (!this._data || this._disposeRequested) throw new Error("Cannot retain a disposing river resource.");
    this._referenceCount++;
  }

  release(): void {
    if (this._referenceCount <= 0) throw new Error("River resource reference count is already zero.");
    this._referenceCount--;
    if (this._referenceCount === 0 && this._disposeRequested) this._finalizeDispose();
  }

  dispose(): void {
    this._disposeRequested = true;
    if (this._referenceCount === 0) this._finalizeDispose();
  }

  private _finalizeDispose(): void {
    this._data = undefined;
    this._serializedBytes = undefined;
  }
}
