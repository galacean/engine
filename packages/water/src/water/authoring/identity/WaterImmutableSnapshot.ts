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

function cloneArrayBufferView<T extends ArrayBufferView>(value: T): T {
  const prototype = Object.getPrototypeOf(value);
  const Constructor = BUILTIN_VIEW_CONSTRUCTORS.find((Builtin) => Builtin.prototype === prototype);
  if (!Constructor) {
    throw new TypeError("Water snapshots must contain only same-realm built-in DataView and typed array views.");
  }
  const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return new Constructor(bytes) as unknown as T;
}

export function createImmutableWaterSnapshot<T>(value: T, ancestors = new Set<object>()): T {
  if (typeof value !== "object" || value === null) {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new TypeError("Water snapshots cannot contain functions or symbols.");
    }
    return value;
  }
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (ArrayBuffer.isView(value)) return cloneArrayBufferView(value) as T;
  if (ancestors.has(value)) throw new TypeError("Water snapshots cannot contain cyclic references.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((child) => createImmutableWaterSnapshot(child, ancestors))) as T;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Water snapshots must contain only plain objects, arrays, and typed arrays.");
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      snapshot[key] = createImmutableWaterSnapshot((value as Record<string, unknown>)[key], ancestors);
    }
    return Object.freeze(snapshot) as T;
  } finally {
    ancestors.delete(value);
  }
}
