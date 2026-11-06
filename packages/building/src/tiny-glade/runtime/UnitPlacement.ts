import { parseBoundaryArrangement, type BoundaryArrangement } from "./BoundaryPlacement";
import { materialArrangement, arrangementRules, type MaterialUnit, type ArrangementRule } from "./UnitPlacementStyle";
export function resolvedArrangement(binding: UnitPlacementBinding) {
  return binding.rule.type === "auto" ? materialArrangement(binding.unit_id) : binding.rule.type;
}
export interface UnitPlacementBinding {
  id: string;
  geometry_id: string;
  variationKey?: string;
  rule: {
    type: ArrangementRule;
    /** Rule for the upper boundary band on a flat roof. Omitted = material preset.
     * Uses the same unit/footprint as this binding, independently of deck rows. */
    boundary?: BoundaryArrangement;
  };
  unit_id: MaterialUnit;
  /** Target unit specification. Recovered variable-size rules scale their native
   * spans relative to the v1 reference (.5, .4375, .1); chart grids use direct
   * pitches. Boundary pieces are fitted/cut, not forced to identical boxes. */
  footprint: { width: number; height: number; depth: number };
  seed: "source" | number;
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Expected author object");
  return v as Record<string, unknown>;
};
const keys = (r: Record<string, unknown>, ks: string[]) => {
  if (Object.keys(r).some((k) => !ks.includes(k))) throw Error("Unsupported author field");
};
const id = (v: unknown) => {
  if (typeof v !== "string" || !v) throw Error("Stable author ID required");
  return v;
};
const unit = (v: unknown): MaterialUnit => {
  if (v !== "brick" && v !== "roof_tile" && v !== "wooden_plank") throw Error("Unsupported material unit");
  return v;
};
export function parseUnitPlacement(
  input: unknown,
  geometry: { boundary: boolean; strip: boolean }
): UnitPlacementBinding {
  const b = object(input);
  keys(b, ["id", "geometry_id", "rule", "unit_id", "footprint", "seed", "variationKey"]);
  const rule = object(b.rule);
  keys(rule, ["type", "boundary"]);
  const boundary = rule.boundary === undefined ? undefined : parseBoundaryArrangement(rule.boundary);
  if (boundary && !geometry.boundary)
    throw Error("Boundary arrangement requires a roof boundary; wall and foundation bindings have no such band");
  if (!arrangementRules.includes(rule.type as ArrangementRule)) throw Error("Unknown arrangement rule");
  if (rule.type === "posts_and_rails" && !geometry.strip)
    throw Error("Posts and rails require strip geometry; materials are unrestricted");
  const footprint = object(b.footprint);
  keys(footprint, ["width", "height", "depth"]);
  for (const k of ["width", "height", "depth"])
    if (typeof footprint[k] !== "number" || !Number.isFinite(footprint[k]) || Number(footprint[k]) <= 0)
      throw Error("Positive finite unit footprint required");
  if (b.seed !== "source" && (!Number.isSafeInteger(b.seed) || Number(b.seed) < 0))
    throw Error("Source or nonnegative safe integer seed required");
  return {
    id: id(b.id),
    geometry_id: id(b.geometry_id),
    ...(b.variationKey !== undefined ? { variationKey: id(b.variationKey) } : {}),
    rule: { type: rule.type as ArrangementRule, ...(boundary ? { boundary } : {}) },
    unit_id: unit(b.unit_id),
    footprint: { width: Number(footprint.width), height: Number(footprint.height), depth: Number(footprint.depth) },
    seed: b.seed as "source" | number
  };
}

export interface UnitPlacementOverride {
  id: string;
  binding_id: string;
  region: { space: "surface_uv"; polygon: number[][] };
  effect: { unit_id?: MaterialUnit; hidden?: boolean };
}

/** Validate local placement edits independently of any building author model. */
export function parseUnitPlacementOverrides(
  input: unknown,
  bindings: readonly Pick<UnitPlacementBinding, "id">[]
): UnitPlacementOverride[] {
  if (!Array.isArray(input)) throw Error("Local edits must be an array");
  const overrides = input.map((x) => {
    const o = object(x);
    keys(o, ["id", "binding_id", "region", "effect"]);
    const binding_id = id(o.binding_id);
    if (!bindings.some((b) => b.id === binding_id)) throw Error("Unknown local edit binding");
    const r = object(o.region),
      e = object(o.effect);
    keys(r, ["space", "polygon"]);
    keys(e, ["unit_id", "hidden"]);
    if (
      r.space !== "surface_uv" ||
      !Array.isArray(r.polygon) ||
      r.polygon.length < 3 ||
      r.polygon.some(
        (p) => !Array.isArray(p) || p.length !== 2 || p.some((v) => typeof v !== "number" || !Number.isFinite(v))
      )
    )
      throw Error("Finite surface UV polygon required");
    if (e.hidden !== undefined && typeof e.hidden !== "boolean") throw Error("Hidden must be boolean");
    if (e.unit_id === undefined && e.hidden === undefined) throw Error("Local edit requires an effect");
    return {
      id: id(o.id),
      binding_id,
      region: { space: "surface_uv" as const, polygon: r.polygon.map((p) => [...p]) },
      effect: {
        ...(e.unit_id !== undefined ? { unit_id: unit(e.unit_id) } : {}),
        ...(e.hidden !== undefined ? { hidden: e.hidden as boolean } : {})
      }
    };
  });
  if (new Set(overrides.map((o) => o.id)).size !== overrides.length) throw Error("Duplicate local edit identity");
  return overrides;
}
