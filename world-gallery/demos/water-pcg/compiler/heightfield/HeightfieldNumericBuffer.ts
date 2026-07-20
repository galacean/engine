/** Immutable public views over heightfield compiler-owned numeric buffers. */
import type {
  HeightfieldReadonlyFloat32Buffer as HeightfieldReadonlyFloat32BufferView,
  HeightfieldReadonlyInt32Buffer as HeightfieldReadonlyInt32BufferView,
  HeightfieldReadonlyUint16Buffer as HeightfieldReadonlyUint16BufferView,
  HeightfieldReadonlyUint32Buffer as HeightfieldReadonlyUint32BufferView,
  HeightfieldReadonlyUint8Buffer as HeightfieldReadonlyUint8BufferView
} from "./HeightfieldWaterCompiledTypes";

abstract class HeightfieldReadonlyBuffer<
  TArray extends Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array
> implements Iterable<number>
{
  protected abstract readonly data: TArray;

  get length(): number {
    return this.data.length;
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
  constructor(values: ArrayLike<number>) {
    super();
    this.data = new Uint8Array(values);
    Object.freeze(this);
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
  constructor(values: ArrayLike<number>) {
    super();
    this.data = new Uint16Array(values);
    Object.freeze(this);
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
  constructor(values: ArrayLike<number>) {
    super();
    this.data = new Uint32Array(values);
    Object.freeze(this);
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
  constructor(values: ArrayLike<number>) {
    super();
    this.data = new Int32Array(values);
    Object.freeze(this);
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
  constructor(values: ArrayLike<number>) {
    super();
    this.data = new Float32Array(values);
    Object.freeze(this);
  }
  toTypedArray(): Float32Array {
    return this.data.slice();
  }
}
