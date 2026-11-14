import type { AnimalAssetReference } from "./AnimalAssetLibrary";

/**
 * JSON save record for an animal instance. Content lives in the catalog/GLB; this record stores only
 * stable identity and placement. Loading keeps id unchanged; spawning a new animal assigns a new id.
 * Behavior resumes from the host's idle command, rather than serializing transient animation clocks.
 */
export interface AnimalInstanceDocument extends Required<AnimalAssetReference> {
  readonly version: 1;
  readonly id: string;
  /** World-space position in metres. */
  readonly position: readonly [number, number, number];
  /** Continuous yaw in radians around world +Y. */
  readonly heading: number;
  /** Absolute calibration scale, initialized from the registered asset's scale. */
  readonly scale: number;
}

/**
 * Validate and detach a saved record before the host resolves its type and appearance against a catalog.
 * @param source Parsed JSON; no model URLs, source clips, binary data or live behavior objects are accepted.
 * @returns A JSON-compatible record preserving instance and content identities exactly.
 */
export function readAnimalInstanceDocument(source: unknown): AnimalInstanceDocument {
  const value = source as AnimalInstanceDocument;
  if (
    value?.version !== 1 ||
    ![value.id, value.typeId, value.appearanceId].every((id) => typeof id === "string" && id.trim().length > 0) ||
    !Array.isArray(value.position) ||
    value.position.length !== 3 ||
    !value.position.every(Number.isFinite) ||
    !Number.isFinite(value.heading) ||
    !Number.isFinite(value.scale) ||
    value.scale <= 0
  )
    throw new Error("Invalid animal instance document");
  return {
    version: 1,
    id: value.id,
    typeId: value.typeId,
    appearanceId: value.appearanceId,
    position: [value.position[0], value.position[1], value.position[2]],
    heading: value.heading,
    scale: value.scale
  };
}
