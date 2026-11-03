/** Authored installation/cut volumes, distinct from visible mesh bounds. */
export interface DecorationCollisionBounds {
  min: [number, number, number];
  max: [number, number, number];
}
export type ConstructionDecorationCollisions = Record<string, DecorationCollisionBounds>;

export function validateDecorationCollisions(value: unknown): asserts value is ConstructionDecorationCollisions {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length)
    throw Error("Decoration collision volumes required in construction VFS");
  for (const [name, bounds] of Object.entries(value)) {
    if (
      !name ||
      !bounds ||
      typeof bounds !== "object" ||
      Array.isArray(bounds) ||
      Object.keys(bounds).some((key) => key !== "min" && key !== "max") ||
      ![bounds.min, bounds.max].every(
        (v) =>
          Array.isArray(v) &&
          v.length === 3 &&
          v.every((n: unknown) => typeof n === "number" && Number.isFinite(Math.fround(n)))
      ) ||
      !bounds.min.every((n: number, i: number) => n < bounds.max[i])
    )
      throw Error("Invalid decoration collision volume: " + name);
  }
}

export function requireDecorationCollision(
  volumes: ConstructionDecorationCollisions | undefined,
  name: string
): DecorationCollisionBounds {
  const bounds = volumes && Object.hasOwn(volumes, name) ? volumes[name] : undefined;
  if (!bounds) throw Error("Missing decoration collision volume in construction VFS: " + name);
  return bounds;
}
