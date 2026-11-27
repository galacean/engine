/** Common lifetime and identity contract for backend-specific compiled resources. */
import type { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";
import type { WaterResourceMemoryMetrics } from "../../runtime/resources/WaterResourceMetrics";

/** Semantic route identity used by every compiled Water resource. */
export interface WaterCompiledBackendRouteIdentity {
  readonly resolvedBackendId: string;
  readonly representation: WaterRepresentationV1;
  readonly sourceKind: WaterBodySourceKind;
}

export interface WaterCompiledResourceIdentity extends WaterCompiledBackendRouteIdentity {
  readonly sourceId: string;
  readonly sourceHash: string;
  /** Backend- and Quality-independent identity of the exact physical surface facts. */
  readonly physicalSurfaceHash: string;
  readonly compiledHash: string;
  readonly schemaVersion: number;
}

export interface WaterCompiledSpatialFieldIdentity {
  readonly sourceSchemaVersion: number;
  readonly sourceHash: string;
  readonly compiledHash: string;
}

export interface WaterCompiledResource<TData = unknown> {
  readonly identity: WaterCompiledResourceIdentity;
  /**
   * Declares the exact compiled facts a runtime Spatial Field must publish.
   * An own property with value `undefined` explicitly declares no Spatial Field.
   */
  readonly spatialFieldIdentity?: WaterCompiledSpatialFieldIdentity;
  readonly data: TData;
  readonly memory: WaterResourceMemoryMetrics;
  readonly referenceCount: number;
  readonly isDisposed: boolean;
  readonly disposeRequested: boolean;
  retain(): void;
  release(): void;
  dispose(): void;
}

/** Generation-bound consumer view. Resource ownership methods are intentionally absent. */
export type WaterCompiledResourceReadPort<TData = unknown> = Readonly<
  Pick<
    WaterCompiledResource<TData>,
    "identity" | "spatialFieldIdentity" | "data" | "memory" | "referenceCount" | "isDisposed" | "disposeRequested"
  >
>;

/**
 * Detaches compiler data for diagnostics without preserving any writable
 * borrow into the live resource. Numeric-buffer borrow methods on the snapshot
 * return fresh copies, so callers cannot mutate the compiled owner.
 */
export function createWaterCompiledDataSnapshot<T>(value: T, ancestors = new Set<object>()): T {
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (ArrayBuffer.isView(value)) {
    const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    if (value instanceof DataView) return new DataView(bytes) as T;
    const Constructor = value.constructor as new (buffer: ArrayBufferLike) => ArrayBufferView;
    return new Constructor(bytes) as T;
  }
  const numeric = value as Readonly<{ toTypedArray?: () => ArrayBufferView }>;
  if (typeof numeric.toTypedArray === "function") {
    const source = numeric.toTypedArray();
    const copy = (): ArrayBufferView => {
      const bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      if (source instanceof DataView) return new DataView(bytes);
      const Constructor = source.constructor as new (buffer: ArrayBufferLike) => ArrayBufferView;
      return new Constructor(bytes);
    };
    const indexed = source as unknown as { readonly length: number; readonly [index: number]: number };
    return Object.freeze({
      length: indexed.length,
      byteLength: source.byteLength,
      at(index: number) {
        const resolved = index < 0 ? indexed.length + index : index;
        return resolved >= 0 && resolved < indexed.length ? indexed[resolved] : undefined;
      },
      borrowTypedArray: copy,
      toTypedArray: copy,
      *[Symbol.iterator]() {
        for (let index = 0; index < indexed.length; index++) yield indexed[index];
      }
    }) as T;
  }
  if (ancestors.has(value)) throw new TypeError("Water compiled snapshots cannot contain cyclic data.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((child) => createWaterCompiledDataSnapshot(child, ancestors))) as T;
    }
    const snapshot: Record<PropertyKey, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) continue;
      snapshot[key] = createWaterCompiledDataSnapshot(descriptor.value, ancestors);
    }
    return Object.freeze(snapshot) as T;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Shared reference-counted owner. Backends keep their storage layout and may
 * release additional serialized/GPU-adjacent state in `onFinalizeDispose`.
 */
export abstract class WaterReferenceCountedCompiledResource<TData> implements WaterCompiledResource<TData> {
  private _data?: TData;
  private _referenceCount = 0;
  private _disposeRequested = false;

  protected constructor(
    readonly identity: WaterCompiledResourceIdentity,
    data: TData,
    private readonly _memory: WaterResourceMemoryMetrics
  ) {
    this._data = data;
  }

  get data(): TData {
    if (!this._data) throw new Error(`${this.identity.resolvedBackendId} water resource has been disposed.`);
    return this._data;
  }

  get memory(): WaterResourceMemoryMetrics {
    return this._data
      ? this._memory
      : {
          cpuStaticBytes: 0,
          cpuDynamicBytes: 0,
          gpuBytes: 0,
          historyBytes: 0,
          reflectionBytes: 0,
          totalBytes: 0
        };
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

  retain(): void {
    if (!this._data || this._disposeRequested) {
      throw new Error(`Cannot retain a disposing ${this.identity.resolvedBackendId} water resource.`);
    }
    this._referenceCount++;
  }

  release(): void {
    if (this._referenceCount <= 0) {
      throw new Error(`${this.identity.resolvedBackendId} water resource reference count is already zero.`);
    }
    this._referenceCount--;
    if (this._referenceCount === 0 && this._disposeRequested) this._finalizeDispose();
  }

  dispose(): void {
    this._disposeRequested = true;
    if (this._referenceCount === 0) this._finalizeDispose();
  }

  protected onFinalizeDispose(): void {}

  private _finalizeDispose(): void {
    if (!this._data) return;
    this.onFinalizeDispose();
    this._data = undefined;
  }
}
