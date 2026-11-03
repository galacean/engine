/** Serializable intent, evaluated by the terrain owner against an immutable base snapshot. */
export interface LakeTerrainModifier {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly lakeId: string;
  readonly mode: "carve-only";
  /** Fixed bed datum; editing the current water level never changes it. */
  readonly referenceLevel: number;
  readonly depth: number;
  /** Distance inside the reference outline at which the full depth is reached. */
  readonly shoreWidth: number;
  /** Distance outside the outline over which the cut blends back to the base. */
  readonly falloffWidth: number;
  readonly profile: "linear" | "smoothstep" | "natural";
}

export function validateLakeTerrainModifier(value: LakeTerrainModifier): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.mode !== "carve-only" ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.length > 128 ||
    typeof value.lakeId !== "string" ||
    !value.lakeId.trim() ||
    value.lakeId.length > 128 ||
    !Number.isFinite(value.referenceLevel) ||
    ![value.depth, value.shoreWidth, value.falloffWidth].every((v) => Number.isFinite(v) && v > 0) ||
    !["linear", "smoothstep", "natural"].includes(value.profile)
  )
    throw new Error("Invalid Lake terrain modifier identity, datum or profile.");
}
