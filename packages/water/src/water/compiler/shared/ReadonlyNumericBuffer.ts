/** Immutable public views over compiler-owned numeric buffers. */
import { adoptOrCopyTypedArray, WATER_OWNED_NUMERIC_BUFFER, WaterBufferOwnership } from "./WaterBufferOwnership";

type NumericArray = Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array;

export interface ReadonlyNumericBuffer<TArray extends NumericArray> extends Iterable<number> {
  readonly length: number;
  readonly byteLength: number;
  at(index: number): number | undefined;
  /** Internal borrowed view; never mutate or retain past the compiled resource lifetime. */
  borrowTypedArray(): TArray;
  toTypedArray(): TArray;
}

abstract class WaterReadonlyBuffer<TArray extends NumericArray> implements ReadonlyNumericBuffer<TArray> {
  readonly [WATER_OWNED_NUMERIC_BUFFER] = true as const;
  readonly #data: TArray;

  protected constructor(
    values: ArrayLike<number>,
    constructor: { new (values: ArrayLike<number>): TArray },
    ownership: WaterBufferOwnership
  ) {
    this.#data = adoptOrCopyTypedArray(values, constructor, constructor, ownership);
    Object.freeze(this);
  }

  get length(): number {
    return this.#data.length;
  }

  get byteLength(): number {
    return this.#data.byteLength;
  }

  at(index: number): number | undefined {
    const resolvedIndex = index < 0 ? this.#data.length + index : index;
    return resolvedIndex >= 0 && resolvedIndex < this.#data.length ? this.#data[resolvedIndex] : undefined;
  }

  toTypedArray(): TArray {
    return this.#data.slice() as TArray;
  }

  borrowTypedArray(): TArray {
    return this.#data;
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}

export class WaterReadonlyUint8Buffer extends WaterReadonlyBuffer<Uint8Array> {
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super(values, Uint8Array, ownership);
  }
}

export class WaterReadonlyUint16Buffer extends WaterReadonlyBuffer<Uint16Array> {
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super(values, Uint16Array, ownership);
  }
}

export class WaterReadonlyUint32Buffer extends WaterReadonlyBuffer<Uint32Array> {
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super(values, Uint32Array, ownership);
  }
}

export class WaterReadonlyInt32Buffer extends WaterReadonlyBuffer<Int32Array> {
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super(values, Int32Array, ownership);
  }
}

export class WaterReadonlyFloat32Buffer extends WaterReadonlyBuffer<Float32Array> {
  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    super(values, Float32Array, ownership);
  }
}
