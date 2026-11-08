import type { ConstructionDecorationSpec } from "./ConstructionDecorations.ts";
import {
  constructionDecorationDefinition,
  resolveConstructionDecorationType
} from "./ConstructionDecorationCatalog.ts";

/** Initial variation for generated attachments. Persist the result when assigning
 * a Scene identity: runtime geometry must not re-seed when that identity changes. */
export function generatedDecorationSeed(ownerSeed: number, localId: string): number {
  let seed = ownerSeed >>> 0;
  for (let i = 0; i < localId.length; i++) seed = Math.imul(seed ^ localId.charCodeAt(i), 16777619) >>> 0;
  return seed;
}

/** Shared interpretation of author config. No generated geometry or persisted revision. */
export function resolveDecorationConfig(spec: ConstructionDecorationSpec, flatRoof: boolean) {
  const type = resolveConstructionDecorationType(spec, flatRoof);
  const definition = type === undefined ? undefined : constructionDecorationDefinition(type);
  return {
    ...spec,
    type,
    kind: definition && definition.purpose !== "light" ? definition.purpose : spec.kind,
    host: spec.host ?? "wall",
    rank: spec.rank ?? definition?.defaultRank ?? 1,
    enabled: spec.enabled !== false
  };
}

// Every new author field must explicitly declare its structural responsibility.
// Placement/variant changes affect occupancy; finish and illumination do not.
const fields = {
  id: "structure",
  kind: "structure",
  type: "structure",
  host: "structure",
  u: "structure",
  uv: "structure",
  rank: "structure",
  seed: "structure",
  variationKey: "structure",
  bottom: "structure",
  width: "structure",
  height: "structure",
  enabled: "structure",
  woodColor: "appearance",
  frameMaterial: "appearance",
  lightIntensity: "appearance",
  lightColor: "appearance"
} as const satisfies Record<keyof ConstructionDecorationSpec, "structure" | "appearance">;

type StructuralKey = {
  [K in keyof typeof fields]: (typeof fields)[K] extends "structure" ? K : never;
}[keyof typeof fields];
export type DecorationStructureConfig = Pick<ReturnType<typeof resolveDecorationConfig>, StructuralKey>;

/** Compare the same effective placement and variant consumed by generation. */
export function decorationStructureConfig(
  spec: ConstructionDecorationSpec,
  flatRoof: boolean
): DecorationStructureConfig | null {
  const resolved = resolveDecorationConfig(spec, flatRoof);
  if (!resolved.enabled || resolved.kind === "wall-lamp" || resolved.kind === "lantern") return null;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (fields[key] !== "structure") continue;
    if ((key === "u" && resolved.host !== "wall") || (key === "uv" && resolved.host !== "roof")) continue;
    const value = resolved[key];
    if (value !== undefined) result[key] = Array.isArray(value) ? [...value] : value;
  }
  return result as DecorationStructureConfig;
}
