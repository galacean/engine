import type { ConstructionDecorationSpec } from "./ConstructionDecorations.ts";
import {
  constructionDecorationDefinition,
  resolveConstructionDecorationType
} from "./ConstructionDecorationCatalog.ts";

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
