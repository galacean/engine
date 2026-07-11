/** Immutable public views over compiler-owned numeric buffers. */
import type { ReadonlyFloat32Buffer, ReadonlyInt32Buffer, ReadonlyUint32Buffer } from "../river/types";

export class RiverReadonlyUint32Buffer implements ReadonlyUint32Buffer {
  readonly #data: Uint32Array;

  constructor(values: ArrayLike<number>) {
    this.#data = new Uint32Array(values);
    Object.freeze(this);
  }

  get length(): number {
    return this.#data.length;
  }

  at(index: number): number | undefined {
    const resolvedIndex = index < 0 ? this.#data.length + index : index;
    return resolvedIndex >= 0 && resolvedIndex < this.#data.length ? this.#data[resolvedIndex] : undefined;
  }

  toTypedArray(): Uint32Array {
    return this.#data.slice();
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}

export class RiverReadonlyFloat32Buffer implements ReadonlyFloat32Buffer {
  readonly #data: Float32Array;

  constructor(values: ArrayLike<number>) {
    this.#data = new Float32Array(values);
    Object.freeze(this);
  }

  get length(): number {
    return this.#data.length;
  }

  at(index: number): number | undefined {
    const resolvedIndex = index < 0 ? this.#data.length + index : index;
    return resolvedIndex >= 0 && resolvedIndex < this.#data.length ? this.#data[resolvedIndex] : undefined;
  }

  toTypedArray(): Float32Array {
    return this.#data.slice();
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}

export class RiverReadonlyInt32Buffer implements ReadonlyInt32Buffer {
  readonly #data: Int32Array;

  constructor(values: ArrayLike<number>) {
    this.#data = new Int32Array(values);
    Object.freeze(this);
  }

  get length(): number {
    return this.#data.length;
  }

  at(index: number): number | undefined {
    const resolvedIndex = index < 0 ? this.#data.length + index : index;
    return resolvedIndex >= 0 && resolvedIndex < this.#data.length ? this.#data[resolvedIndex] : undefined;
  }

  toTypedArray(): Int32Array {
    return this.#data.slice();
  }

  [Symbol.iterator](): IterableIterator<number> {
    return this.#data.values();
  }
}
