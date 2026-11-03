/** Only use at content boundaries. Runtime geometry and instance state must stay mutable. */
export function freezePlantContent<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezePlantContent(child);
    Object.freeze(value);
  }
  return value;
}
