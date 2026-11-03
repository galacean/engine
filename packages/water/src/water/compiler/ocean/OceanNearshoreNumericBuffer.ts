/** Immutable public views over compiler-owned nearshore numeric buffers. */
import type { OceanNearshoreReadonlyUint8Buffer as Uint8BufferView } from "./OceanNearshoreCompiledTypes";
import {
  adoptOrCopyTypedArray,
  WATER_OWNED_NUMERIC_BUFFER,
  WaterBufferOwnership
} from "../shared/WaterBufferOwnership";

abstract class OceanNearshoreReadonlyBuffer<TArray extends Uint8Array | Float32Array> implements Iterable<number> {
  readonly [WATER_OWNED_NUMERIC_BUFFER] = true as const;
  protected abstract readonly data: TArray;

  get length(): number {
    return this.data.length;
  }

  get byteLength(): number {
    return this.data.byteLength;
  }

  at(index: number): number | undefined {
    const resolved = index < 0 ? this.data.length + index : index;
    return resolved >= 0 && resolved < this.data.length ? this.data[resolved] : undefined;
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.data.values();
  }
}

export class OceanNearshoreReadonlyUint8Buffer
  extends OceanNearshoreReadonlyBuffer<Uint8Array>
  implements Uint8BufferView
{
  protected readonly data: Uint8Array;

  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super();
    this.data = adoptOrCopyTypedArray(values, Uint8Array, Uint8Array, ownership);
    Object.freeze(this);
  }

  borrowTypedArray(): Uint8Array {
    return this.data;
  }

  toTypedArray(): Uint8Array {
    return this.data.slice();
  }
}
