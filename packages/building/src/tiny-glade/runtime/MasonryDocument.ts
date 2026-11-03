import { parseBoundaryArrangement, type BoundaryArrangement } from "./BoundaryPlacement";
import { parseConstructionSource } from "./ConstructionSource";
import type { ConstructionSource } from "./ConstructionSource";
export type MaterialUnit = "brick" | "roof_tile" | "wooden_plank";
export type ArrangementRule =
  | "auto"
  | "overlap_rows"
  | "staggered_rows"
  | "grid"
  | "horizontal_rows"
  | "parallel_rows"
  | "posts_and_rails";
export const arrangementRules: [ArrangementRule, ...ArrangementRule[]] = [
  "auto",
  "overlap_rows",
  "staggered_rows",
  "grid",
  "horizontal_rows",
  "parallel_rows",
  "posts_and_rails"
];
export function materialArrangement(unit: MaterialUnit): Exclude<ArrangementRule, "auto"> {
  return unit === "brick" ? "staggered_rows" : unit === "roof_tile" ? "overlap_rows" : "parallel_rows";
}
export function resolvedArrangement(binding: MasonryBinding) {
  return binding.rule.type === "auto" ? materialArrangement(binding.unit_id) : binding.rule.type;
}
export interface MasonryBinding {
  id: string;
  geometry_id: string;
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
export interface MasonryOverride {
  id: string;
  binding_id: string;
  region: { space: "surface_uv"; polygon: number[][] };
  effect: { unit_id?: MaterialUnit; hidden?: boolean };
}
export interface MasonryDocument {
  version: 1;
  construction: ConstructionSource;
  bindings: MasonryBinding[];
  overrides: MasonryOverride[];
  placement?: { position: number[]; rotationY: number };
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
export function parseMasonryDocument(input: unknown): MasonryDocument {
  const d = object(input);
  keys(d, ["version", "construction", "bindings", "overrides", "placement"]);
  if (d.version !== 1) throw Error("Unsupported masonry document");
  const construction = parseConstructionSource(d.construction);
  let placement: MasonryDocument["placement"];
  if (d.placement !== undefined) {
    const p = object(d.placement);
    keys(p, ["position", "rotationY"]);
    if (
      !Array.isArray(p.position) ||
      p.position.length !== 3 ||
      p.position.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
      typeof p.rotationY !== "number" ||
      !Number.isFinite(p.rotationY)
    )
      throw Error("Placement requires three meter coordinates and a finite yaw in radians");
    placement = { position: [...p.position], rotationY: p.rotationY };
  }
  if (!Array.isArray(d.bindings) || !Array.isArray(d.overrides)) throw Error("Bindings and local edits must be arrays");
  const geometryRules = new Map(
    construction.buildings.map((b) => [
      b.id + (b.kind ? "-surface" : "-roof"),
      b.kind === "wall" ? "staggered_rows" : b.kind === "fence" ? "posts_and_rails" : "overlap_rows"
    ])
  );
  const requiredIds = new Set(geometryRules.keys());
  for (const b of construction.buildings)
    if (!b.kind) {
      geometryRules.set(b.id + "-wall", "staggered_rows");
      if (b.foundation) geometryRules.set(b.id + "-foundation", "staggered_rows");
    }
  const geometryIds = new Set(geometryRules.keys());
  const bindings = d.bindings.map((x) => {
    const b = object(x);
    keys(b, ["id", "geometry_id", "rule", "unit_id", "footprint", "seed"]);
    const geometry_id = id(b.geometry_id);
    if (!geometryIds.has(geometry_id)) throw Error("Unknown roof geometry " + geometry_id);
    const rule = object(b.rule);
    keys(rule, ["type", "boundary"]);
    const boundary = rule.boundary === undefined ? undefined : parseBoundaryArrangement(rule.boundary);
    if (boundary && !construction.buildings.some((v) => !v.kind && v.id + "-roof" === geometry_id))
      throw Error("Boundary arrangement requires a roof boundary; wall and foundation bindings have no such band");
    if (!arrangementRules.includes(rule.type as ArrangementRule)) throw Error("Unknown arrangement rule");
    if (
      rule.type === "posts_and_rails" &&
      !construction.buildings.some((b) => b.kind && b.id + "-surface" === geometry_id)
    )
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
      geometry_id,
      rule: { type: rule.type as MasonryBinding["rule"]["type"], ...(boundary ? { boundary } : {}) },
      unit_id: unit(b.unit_id),
      footprint: { width: Number(footprint.width), height: Number(footprint.height), depth: Number(footprint.depth) },
      seed: b.seed as "source" | number
    };
  });
  if (
    new Set(bindings.map((b) => b.id)).size !== bindings.length ||
    new Set(bindings.map((b) => b.geometry_id)).size !== bindings.length
  )
    throw Error("Duplicate roof binding");
  if ([...requiredIds].some((id) => !bindings.some((b) => b.geometry_id === id)))
    throw Error("Each roof needs a placement binding");
  const overrides = d.overrides.map((x) => {
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
  return { version: 1, construction, bindings, overrides, ...(placement ? { placement } : {}) };
}
