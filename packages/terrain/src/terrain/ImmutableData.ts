const immutableValues = new WeakSet<object>();

/** Marks an entire JSON data graph immutable, allowing its owners to share it without copying. */
export function freezeImmutableData<T>(value: T): T {
  if (value && typeof value === "object" && !immutableValues.has(value)) {
    for (const child of Object.values(value)) freezeImmutableData(child);
    Object.freeze(value);
    immutableValues.add(value);
  }
  return value;
}

/** A shallow Object.freeze is insufficient: only graphs frozen by this module may be shared. */
export function isImmutableData(value: unknown): boolean {
  return !!value && typeof value === "object" && immutableValues.has(value);
}
