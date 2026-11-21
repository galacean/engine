/** Creates an owned, recursively immutable snapshot of engine-object-free Water data. */

const BUILTIN_VIEW_CONSTRUCTORS = [
  DataView,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array
] as const;

const immutableSnapshots = new WeakSet<object>();

export function isImmutableWaterSnapshot(value: unknown): value is object {
  return typeof value === "object" && value !== null && immutableSnapshots.has(value);
}

function cloneArrayBufferView<T extends ArrayBufferView>(value: T): T {
  if (immutableSnapshots.has(value)) return value;
  const prototype = Object.getPrototypeOf(value);
  const Constructor = BUILTIN_VIEW_CONSTRUCTORS.find((Builtin) => Builtin.prototype === prototype);
  if (!Constructor) {
    throw new TypeError("Water snapshots must contain only same-realm built-in DataView and typed array views.");
  }
  const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  const view = new Constructor(bytes) as unknown as T;
  immutableSnapshots.add(view);
  return view;
}

export function createImmutableWaterSnapshot<T>(value: T, ancestors = new Set<object>()): T {
  if (typeof value !== "object" || value === null) {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new TypeError("Water snapshots cannot contain functions or symbols.");
    }
    return value;
  }
  if (immutableSnapshots.has(value)) return value;
  if (value instanceof ArrayBuffer) {
    const copy = value.slice(0) as T;
    immutableSnapshots.add(copy as unknown as object);
    return copy;
  }
  if (ArrayBuffer.isView(value)) return cloneArrayBufferView(value) as T;
  if (ancestors.has(value)) throw new TypeError("Water snapshots cannot contain cyclic references.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const frozen = Object.freeze(value.map((child) => createImmutableWaterSnapshot(child, ancestors)));
      immutableSnapshots.add(frozen);
      return frozen as T;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Water snapshots must contain only plain objects, arrays, and typed arrays.");
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      snapshot[key] = createImmutableWaterSnapshot((value as Record<string, unknown>)[key], ancestors);
    }
    const frozen = Object.freeze(snapshot);
    immutableSnapshots.add(frozen);
    return frozen as T;
  } finally {
    ancestors.delete(value);
  }
}
