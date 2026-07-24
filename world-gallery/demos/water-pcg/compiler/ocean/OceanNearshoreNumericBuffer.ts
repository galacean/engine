/** Immutable public views over compiler-owned nearshore numeric buffers. */
import type {
  OceanNearshoreReadonlyFloat32Buffer as Float32BufferView,
  OceanNearshoreReadonlyUint8Buffer as Uint8BufferView
} from "./OceanNearshoreCompiledTypes";

abstract class OceanNearshoreReadonlyBuffer<TArray extends Uint8Array | Float32Array>
  implements Iterable<number>
{
  protected abstract readonly data: TArray;

  get length(): number {
    return this.data.length;
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

  constructor(values: ArrayLike<number>) {
    super();
    this.data = new Uint8Array(values);
    Object.freeze(this);
  }

  toTypedArray(): Uint8Array {
    return this.data.slice();
  }
}

export class OceanNearshoreReadonlyFloat32Buffer
  extends OceanNearshoreReadonlyBuffer<Float32Array>
  implements Float32BufferView
{
  protected readonly data: Float32Array;

  constructor(values: ArrayLike<number>) {
    super();
    this.data = new Float32Array(values);
    Object.freeze(this);
  }

  toTypedArray(): Float32Array {
    return this.data.slice();
  }
}
