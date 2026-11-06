import { f32 } from "./RecoveredRoofMath";

/** Parameters of individual geometric algorithms, independent of a house document. */
export interface ProfileFootprint {
  circle?: { center: number[]; radius: number; phase: number };
  rectangle?: { center: number[]; size: number[]; rotation: number };
}
export interface ProfileRoofParameters {
  tip: number[];
  profile: number;
  height: number;
  ridge_length: number;
  eave: number;
  ridge_direction: 0 | 1;
  flat_rim: 0 | 1;
  color: number;
}
export interface ProfileFoundationParameters {
  height: number;
  mode?: "auto" | "pillars" | "solid";
}
export interface ProfileFinishParameters {
  enabled: boolean;
  wear: number;
  color: number;
  tint?: [number, number, number] | null;
}
export interface ProfileFloorParameters {
  enabled: boolean;
  interval: number;
}

function record(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error(label + " must be an object");
  return v as Record<string, unknown>;
}
function only(v: Record<string, unknown>, keys: string[], label: string) {
  for (const k of Object.keys(v)) if (!keys.includes(k)) throw Error("Unsupported " + label + " field " + k);
}
export function profileNumber(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isFinite(f32(v)))
    throw Error(label + " requires a finite f32 number");
  return f32(v);
}
function uint(v: unknown, label: string) {
  profileNumber(v, label);
  if (!Number.isInteger(v) || Number(v) < 0 || Number(v) > 0xffffffff) throw Error(label + " requires uint32");
  return Number(v);
}
function pair(v: unknown, label: string) {
  if (!Array.isArray(v) || v.length !== 2) throw Error(label + " requires two coordinates");
  return v.map((x) => profileNumber(x, label));
}
function flag(v: unknown, label: string): 0 | 1 {
  if (v !== 0 && v !== 1) throw Error(label + " requires the original 0 or 1 enum");
  return v;
}
export function normalizeProfileHeight(value: unknown) {
  const height = profileNumber(value, "height");
  if (!(height > 0)) throw Error("Wall height must be positive");
  return height;
}
export function normalizeProfileFootprint(input: { circle?: unknown; rectangle?: unknown }): ProfileFootprint {
  if (!!input.circle === !!input.rectangle) throw Error("Exactly one shape required");
  if (input.circle) {
    const c = record(input.circle, "circle");
    only(c, ["center", "radius", "phase"], "circle");
    const radius = profileNumber(c.radius, "radius");
    if (!(radius > 0)) throw Error("Circle radius must be positive");
    return { circle: { center: pair(c.center, "center"), radius, phase: profileNumber(c.phase ?? 0, "phase") } };
  }
  const r = record(input.rectangle, "rectangle");
  only(r, ["center", "size", "rotation"], "rectangle");
  const size = pair(r.size, "size");
  if (size.some((v) => v <= 0)) throw Error("Rectangle dimensions must be positive");
  return {
    rectangle: { center: pair(r.center, "center"), size, rotation: profileNumber(r.rotation ?? 0, "rotation") }
  };
}
export function normalizeProfileRoof(input: unknown = {}): ProfileRoofParameters {
  const roof = record(input, "roof");
  only(roof, ["tip", "profile", "height", "ridge_length", "eave", "ridge_direction", "flat_rim", "color"], "roof");
  const result: ProfileRoofParameters = {
    tip: pair(roof.tip ?? [0, 0], "tip"),
    profile: profileNumber(roof.profile ?? 0, "profile"),
    height: profileNumber(roof.height ?? 0.35, "roof.height"),
    ridge_length: profileNumber(roof.ridge_length ?? 0.6, "ridge_length"),
    eave: profileNumber(roof.eave ?? 0.3, "eave"),
    ridge_direction: flag(roof.ridge_direction ?? 0, "ridge_direction"),
    flat_rim: flag(roof.flat_rim ?? 0, "flat_rim"),
    color: uint(roof.color ?? 2, "color")
  };
  if (result.color > 12) throw Error("Roof color outside original palette");
  for (const v of [result.height, result.profile, result.ridge_length, result.eave])
    if (v < 0 || v > 1) throw Error("Roof control must be in [0,1]");
  return result;
}
export function normalizeProfileFoundation(input: unknown): ProfileFoundationParameters {
  const f = record(input, "foundation");
  only(f, ["height", "mode"], "foundation");
  const height = profileNumber(f.height, "foundation.height");
  if (height < 0) throw Error("Foundation height must be nonnegative");
  if (f.mode !== undefined && !["auto", "pillars", "solid"].includes(f.mode as string))
    throw Error("Unknown foundation mode");
  return { height, ...(f.mode !== undefined ? { mode: f.mode as ProfileFoundationParameters["mode"] } : {}) };
}
export function normalizeProfileFinish(input: unknown): ProfileFinishParameters {
  const p = record(input, "plaster");
  only(p, ["enabled", "wear", "color", "tint"], "plaster");
  if (typeof p.enabled !== "boolean") throw Error("Plaster enabled must be boolean");
  const wear = profileNumber(p.wear, "plaster.wear"),
    color = uint(p.color, "plaster.color");
  if (wear < 0 || wear > 1) throw Error("Plaster wear must be in [0,1]");
  if (color > 7) throw Error("Plaster color outside original palette");
  const result: ProfileFinishParameters = { enabled: p.enabled, wear, color };
  if (p.tint !== undefined) {
    if (
      p.tint !== null &&
      (!Array.isArray(p.tint) ||
        p.tint.length !== 3 ||
        !p.tint.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1))
    )
      throw Error("Plaster tint must be three sRGB channels in [0,1] or null");
    result.tint = p.tint === null ? null : ([...p.tint] as [number, number, number]);
  }
  return result;
}
export function normalizeProfileFloors(input: unknown): ProfileFloorParameters {
  const f = record(input, "floors");
  only(f, ["enabled", "interval"], "floors");
  if (typeof f.enabled !== "boolean") throw Error("Floor bands enabled must be boolean");
  const interval = profileNumber(f.interval, "floors.interval");
  if (!(interval > 0)) throw Error("Invalid floor band spacing");
  return { enabled: f.enabled, interval };
}
