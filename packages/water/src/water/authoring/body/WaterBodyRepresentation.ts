/** Engine-object-free semantic and representation axes for WaterBody. */

/** Bounded planar water is `lake`; `heightfield` names only its representation/backend. */
export type WaterBodyKind = "river" | "lake" | "pool" | "ocean";

export type WaterDomainKind = "bounded-grid" | "spline-network" | "bounded-polygon" | "world-space-ocean";

export type WaterMacroSurfaceKind = "flat" | "heightfield" | "flow-deformed" | "gerstner";

export interface WaterRepresentationV1 {
  readonly domain: WaterDomainKind;
  readonly macroSurface: WaterMacroSurfaceKind;
}

const WATER_DOMAIN_KINDS = Object.freeze([
  "bounded-grid",
  "spline-network",
  "bounded-polygon",
  "world-space-ocean"
] as const satisfies readonly WaterDomainKind[]);

const WATER_MACRO_SURFACE_KINDS = Object.freeze([
  "flat",
  "heightfield",
  "flow-deformed",
  "gerstner"
] as const satisfies readonly WaterMacroSurfaceKind[]);

export function createWaterRepresentationV1(source: Readonly<WaterRepresentationV1>): Readonly<WaterRepresentationV1> {
  if (!WATER_DOMAIN_KINDS.includes(source.domain)) {
    throw new TypeError(`Unsupported Water domain '${String(source.domain)}'.`);
  }
  if (!WATER_MACRO_SURFACE_KINDS.includes(source.macroSurface)) {
    throw new TypeError(`Unsupported Water macro surface '${String(source.macroSurface)}'.`);
  }
  if (source.domain === "world-space-ocean" && source.macroSurface !== "gerstner") {
    throw new Error("World-space Ocean representation requires a Gerstner macro surface.");
  }
  if (source.domain === "spline-network" && source.macroSurface !== "flow-deformed") {
    throw new Error("Spline-network representation requires a flow-deformed macro surface.");
  }
  if (
    (source.domain === "bounded-grid" || source.domain === "bounded-polygon") &&
    source.macroSurface !== "flat" &&
    source.macroSurface !== "heightfield"
  ) {
    throw new Error(`Finite domain '${source.domain}' requires a flat or heightfield macro surface.`);
  }
  return Object.freeze({
    domain: source.domain,
    macroSurface: source.macroSurface
  });
}

export function isWaterBodyKind(value: unknown): value is WaterBodyKind {
  return value === "river" || value === "lake" || value === "pool" || value === "ocean";
}
