import { add, finite, positive, scale, vec3 } from "./math";
import { compareKeys } from "./identity";
import { Registry } from "./registry";
import {
  curveSampler,
  extrusionSurface,
  planeSurface,
  type BuildingEnvironment,
  type BuildingGeometry,
  type CurveData,
  type GeometryElement,
  type SurfaceKind
} from "./geometry";
import {
  alongCurves,
  coverSurfaces,
  noLaying,
  placeAtPoints,
  surfaceGrid,
  type LayingAlgorithm,
  type LayingInfo
} from "./algorithms";
import { RuleDefaults, type ConnectionRule, type JoinDetector, type ParticipantView } from "./connection";
import { unitBox } from "./unit";

export interface GeometryContext {
  /** Hosts of the part's attach connection, in connection order, with original geometry. */
  readonly hosts: readonly ParticipantView[];
  readonly environment: BuildingEnvironment;
}
export type GeometryGenerator<P = any> = (params: P, context: GeometryContext) => BuildingGeometry;

/** Everything the core can resolve by name. Each design context owns its own registry,
 * so applications and tests never share mutable global state. */
export interface BuildingRegistry {
  readonly geometry: Registry<GeometryGenerator>;
  readonly surfaces: Registry<SurfaceKind>;
  readonly algorithms: Registry<LayingAlgorithm>;
  readonly rules: Registry<ConnectionRule>;
  readonly defaults: RuleDefaults;
  readonly detectors: Registry<JoinDetector>;
}

/** Literal elements. */
const elementsGenerator: GeometryGenerator<{ elements: BuildingGeometry["elements"] }> = (p) => ({
  elements: p.elements
});
/** A curve swept along its up direction: surface "face", curves "base" and "top", and
 * one "corner:i" point per vertex. */
const extrudeGenerator: GeometryGenerator<{ curve: CurveData; height: number }> = (p) => {
  const height = positive(p.height, "Extrusion height");
  const sampler = curveSampler(p.curve);
  const elements: Record<string, GeometryElement> = {
    face: { kind: "surface", surface: { kind: "extrusion", params: { curve: p.curve, height } } },
    base: { kind: "curve", curve: p.curve }
  };
  const points = p.curve.points.map((point) => vec3(point, "Curve point"));
  const up = sampler.frame(0).y;
  elements.top = {
    kind: "curve",
    curve: { ...p.curve, points: points.map((point) => add(point, scale(up, height))) }
  };
  points.forEach((_, i) => (elements[`corner:${i}`] = { kind: "point", frame: sampler.frame(sampler.vertex(i)) }));
  return { elements };
};
interface HostPoint {
  readonly id?: string;
  readonly host?: number;
  readonly element?: string;
  readonly u: number;
  readonly v: number;
  readonly offset?: number;
}
/** Points on host surfaces, in host (u, v). Each point records its location for rules. */
const onHostGenerator: GeometryGenerator<HostPoint | { points: readonly HostPoint[] }> = (p, context) => {
  const list = "points" in p ? p.points : [{ id: "point", ...p }];
  if (!Array.isArray(list) || !list.length) throw Error("onHost needs at least one point");
  const elements: Record<string, GeometryElement> = {};
  for (const point of list) {
    const id = point.id ?? "point";
    if (elements[id]) throw Error(`Duplicate point id "${id}"`);
    const host = point.host ?? 0;
    const view = context.hosts[host];
    if (!view) throw Error(`onHost refers to missing host ${host}`);
    const surfaces = view.geometry.ids("surface");
    const element = point.element ?? view.element ?? (surfaces.length === 1 ? surfaces[0] : undefined);
    if (!element) throw Error("onHost needs an element when the host has several surfaces");
    const u = finite(point.u, "u"),
      v = finite(point.v, "v");
    const frame = view.geometry.surface(element).frame(u, v);
    const origin = add(frame.origin, scale(frame.z, finite(point.offset ?? 0, "offset")));
    elements[id] = { kind: "point", frame: { ...frame, origin }, on: { host, element, u, v } };
  }
  return { elements };
};
/** Reuse selected elements of a host, e.g. lay a second layer on a host surface. */
const hostElementsGenerator: GeometryGenerator<{ host?: number; elements?: readonly string[] }> = (p, context) => {
  const view = context.hosts[p.host ?? 0];
  if (!view) throw Error(`hostElements refers to missing host ${p.host ?? 0}`);
  const source = view.geometry.original.elements;
  const ids = p.elements ?? Object.keys(source).sort(compareKeys);
  const elements: Record<string, GeometryElement> = {};
  for (const id of ids) {
    if (!source[id]) throw Error(`Host has no element "${id}"`);
    elements[id] = source[id];
  }
  return { elements };
};

const noRule: ConnectionRule = () => ({});
/** Generic opening: removes the host area covered by the guest unit at each located point.
 * The area is the unit box in the point frame; `params.size` replaces it, `params.margin` grows it. */
const voidUnderGuest: ConnectionRule = (context) => {
  const guest = context.guest;
  if (!guest) return { diagnostics: ["voidUnderGuest only applies to attach connections"] };
  const size = context.params.size as readonly [number, number] | undefined;
  const margin = finite(context.params.margin ?? 0, "margin");
  const box = size ? undefined : guest.unit && unitBox(guest.unit);
  if (!size && !box) return { diagnostics: ["voidUnderGuest needs params.size or a guest unit with bounds"] };
  const modify = [];
  for (const id of guest.geometry.ids("point")) {
    const at = guest.geometry.location(id);
    if (!at) continue;
    const host = context.hosts[at.host];
    if (!host) return { diagnostics: [`Point "${id}" refers to missing host ${at.host}`] };
    // Unit x and y follow the host's u and v at a located point.
    const [x0, y0, x1, y1] = size
      ? [-positive(size[0], "size") / 2, -positive(size[1], "size") / 2, size[0] / 2, size[1] / 2]
      : [box!.min[0], box!.min[1], box!.max[0], box!.max[1]];
    modify.push({
      part: host.key,
      modification: {
        element: at.element,
        op: "removeArea" as const,
        rect: [at.u + x0 - margin, at.v + y0 - margin, at.u + x1 + margin, at.v + y1 + margin] as const
      }
    });
  }
  if (!modify.length) return { diagnostics: ["Guest has no point located on a host surface"] };
  return { modify };
};

export function createBuildingRegistry(): BuildingRegistry {
  const registry: BuildingRegistry = {
    geometry: new Registry("Geometry generator"),
    surfaces: new Registry("Surface kind"),
    algorithms: new Registry("Laying algorithm"),
    rules: new Registry("Connection rule"),
    defaults: new RuleDefaults(),
    detectors: new Registry("Join detector")
  };
  registry.geometry.register("elements", elementsGenerator);
  registry.geometry.register("extrude", extrudeGenerator);
  registry.geometry.register("onHost", onHostGenerator);
  registry.geometry.register("hostElements", hostElementsGenerator);
  registry.surfaces.register("extrusion", extrusionSurface);
  registry.surfaces.register("plane", planeSurface);
  registry.algorithms.register("none", noLaying);
  registry.algorithms.register("placeAtPoints", placeAtPoints);
  registry.algorithms.register("alongCurves", alongCurves);
  registry.algorithms.register("surfaceGrid", surfaceGrid);
  registry.algorithms.register("coverSurfaces", coverSurfaces);
  registry.rules.register("none", noRule);
  registry.rules.register("voidUnderGuest", voidUnderGuest);
  return registry;
}

/** Every registered laying algorithm with its description, sorted by name. */
export function describeLaying(registry: BuildingRegistry): ({ name: string } & Partial<LayingInfo>)[] {
  return registry.algorithms.ids().map((name) => ({ name, ...registry.algorithms.get(name)!.info }));
}
