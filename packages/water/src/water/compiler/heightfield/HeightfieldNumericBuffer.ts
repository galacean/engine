/** Immutable public views over heightfield compiler-owned numeric buffers. */
import type {
  HeightfieldReadonlyFloat32Buffer as HeightfieldReadonlyFloat32BufferView,
  HeightfieldReadonlyInt32Buffer as HeightfieldReadonlyInt32BufferView,
  HeightfieldReadonlyUint16Buffer as HeightfieldReadonlyUint16BufferView,
  HeightfieldReadonlyUint32Buffer as HeightfieldReadonlyUint32BufferView,
  HeightfieldReadonlyUint8Buffer as HeightfieldReadonlyUint8BufferView
} from "./HeightfieldWaterCompiledTypes";
import {
  adoptOrCopyTypedArray,
  WATER_OWNED_NUMERIC_BUFFER,
  WaterBufferOwnership
} from "../shared/WaterBufferOwnership";

abstract class HeightfieldReadonlyBuffer<
  TArray extends Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array
> implements Iterable<number>
{
  readonly [WATER_OWNED_NUMERIC_BUFFER] = true as const;
  protected abstract readonly data: TArray;

  get length(): number {
    return this.data.length;
  }

  get byteLength(): number {
    return this.data.byteLength;
  }

  at(index: number): number | undefined {
    const resolvedIndex = index < 0 ? this.data.length + index : index;
    return resolvedIndex >= 0 && resolvedIndex < this.data.length ? this.data[resolvedIndex] : undefined;
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.data.values();
  }
}

export class HeightfieldReadonlyUint8Buffer
  extends HeightfieldReadonlyBuffer<Uint8Array>
  implements HeightfieldReadonlyUint8BufferView
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

export class HeightfieldReadonlyUint16Buffer
  extends HeightfieldReadonlyBuffer<Uint16Array>
  implements HeightfieldReadonlyUint16BufferView
{
  protected readonly data: Uint16Array;
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super();
    this.data = adoptOrCopyTypedArray(values, Uint16Array, Uint16Array, ownership);
    Object.freeze(this);
  }
  borrowTypedArray(): Uint16Array {
    return this.data;
  }
  toTypedArray(): Uint16Array {
    return this.data.slice();
  }
}

export class HeightfieldReadonlyUint32Buffer
  extends HeightfieldReadonlyBuffer<Uint32Array>
  implements HeightfieldReadonlyUint32BufferView
{
  protected readonly data: Uint32Array;
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super();
    this.data = adoptOrCopyTypedArray(values, Uint32Array, Uint32Array, ownership);
    Object.freeze(this);
  }
  borrowTypedArray(): Uint32Array {
    return this.data;
  }
  toTypedArray(): Uint32Array {
    return this.data.slice();
  }
}

export class HeightfieldReadonlyInt32Buffer
  extends HeightfieldReadonlyBuffer<Int32Array>
  implements HeightfieldReadonlyInt32BufferView
{
  protected readonly data: Int32Array;
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super();
    this.data = adoptOrCopyTypedArray(values, Int32Array, Int32Array, ownership);
    Object.freeze(this);
  }
  borrowTypedArray(): Int32Array {
    return this.data;
  }
  toTypedArray(): Int32Array {
    return this.data.slice();
  }
}

export class HeightfieldReadonlyFloat32Buffer
  extends HeightfieldReadonlyBuffer<Float32Array>
  implements HeightfieldReadonlyFloat32BufferView
{
  protected readonly data: Float32Array;
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super();
    this.data = adoptOrCopyTypedArray(values, Float32Array, Float32Array, ownership);
    Object.freeze(this);
  }
  borrowTypedArray(): Float32Array {
    return this.data;
  }
  toTypedArray(): Float32Array {
    return this.data.slice();
  }
}
