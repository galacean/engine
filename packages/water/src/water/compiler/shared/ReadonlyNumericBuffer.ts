/** Immutable public views over compiler-owned numeric buffers. */
import type {
  ReadonlyFloat32Buffer,
  ReadonlyInt32Buffer,
  ReadonlyUint32Buffer,
  ReadonlyUint8Buffer
} from "../river/types";
import { adoptOrCopyTypedArray, WATER_OWNED_NUMERIC_BUFFER, WaterBufferOwnership } from "./WaterBufferOwnership";

export class RiverReadonlyUint8Buffer implements ReadonlyUint8Buffer {
  readonly [WATER_OWNED_NUMERIC_BUFFER] = true as const;
  readonly #data: Uint8Array;

  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    this.#data = adoptOrCopyTypedArray(values, Uint8Array, Uint8Array, ownership);
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

  toTypedArray(): Uint8Array {
    return this.#data.slice();
  }

  borrowTypedArray(): Uint8Array {
    return this.#data;
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}

export class RiverReadonlyUint32Buffer implements ReadonlyUint32Buffer {
  readonly [WATER_OWNED_NUMERIC_BUFFER] = true as const;
  readonly #data: Uint32Array;

  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    this.#data = adoptOrCopyTypedArray(values, Uint32Array, Uint32Array, ownership);
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

  toTypedArray(): Uint32Array {
    return this.#data.slice();
  }

  borrowTypedArray(): Uint32Array {
    return this.#data;
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}

export class RiverReadonlyFloat32Buffer implements ReadonlyFloat32Buffer {
  readonly [WATER_OWNED_NUMERIC_BUFFER] = true as const;
  readonly #data: Float32Array;

  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    this.#data = adoptOrCopyTypedArray(values, Float32Array, Float32Array, ownership);
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

  toTypedArray(): Float32Array {
    return this.#data.slice();
  }

  borrowTypedArray(): Float32Array {
    return this.#data;
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}

export class RiverReadonlyInt32Buffer implements ReadonlyInt32Buffer {
  readonly [WATER_OWNED_NUMERIC_BUFFER] = true as const;
  readonly #data: Int32Array;

  constructor(values: ArrayLike<number>, ownership = WaterBufferOwnership.Copy) {
    this.#data = adoptOrCopyTypedArray(values, Int32Array, Int32Array, ownership);
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

  toTypedArray(): Int32Array {
    return this.#data.slice();
  }

  borrowTypedArray(): Int32Array {
    return this.#data;
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}
