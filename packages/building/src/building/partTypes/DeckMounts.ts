// Part-type layer: prefabs that stand on a flat roof's deck, such as hatches and roof lamps.
// - A deck mount has a point "mount" on the deck under its plan position. It stands upright
//   and faces the nearest edge of the deck (a hatch) or the house's front (a lamp).
// - A prefab that opens the deck names its opening in its own x/z plane; the geometry turns it
//   into rectangles of the deck, "opening0", "opening1", ..., which the attach rule removes
//   from the deck.
import {
  scale,
  type BuildingRegistry,
  type ConnectionRule,
  type GeometryElement,
  type GeometryGenerator,
  type ParticipantView,
  type Rect,
  type Vec3
} from "../core";
import { mountFor, prefabFacts, prefabScale } from "./Openings";
import type { RoofDeckParams } from "./Roof";

/** Where a deck mount stands: the building prefab it installs, a plan position (x, z), a
 * height above the deck, the size of its installation (default: the prefab's own), and which
 * way it faces. */
export interface DeckMountParams {
  readonly prefab: string;
  readonly at: readonly [number, number];
  readonly bottom: number;
  readonly width?: number;
  readonly height?: number;
  /** "edge": out through the nearest edge of the deck, or away from the middle of a round
   * deck. "front": the way the house faces. */
  readonly facing: "edge" | "front";
}

const deckOf = (part: ParticipantView): RoofDeckParams | undefined => {
  const e = part.geometry.original.elements.deck;
  return e?.kind === "surface" && e.surface.kind === "roofDeck" ? (e.surface.params as RoofDeckParams) : undefined;
};
const dot2 = (a: Vec3, x: number, z: number) => a[0] * x + a[2] * z;

/** Elements "mount" and "opening<i>". The prefab's origin stands on the deck under the plan
 * position, raised by `bottom`; its footprint must stay inside the walls' inner face. Each
 * opening rectangle of the prefab becomes the largest rectangle of the deck inside it. */
export const houseDeckMountGeometry: GeometryGenerator<DeckMountParams> = (p, { hosts, environment }) => {
  const facts = prefabFacts(environment, p.prefab);
  const host = hosts.findIndex((h) => deckOf(h));
  if (host < 0) throw Error("A deck mount attaches to a roof deck");
  const deck = deckOf(hosts[host])!;
  const [W, D] = deck.size;
  const u = dot2(deck.x, p.at[0] - deck.origin[0], p.at[1] - deck.origin[2]),
    v = dot2(deck.y, p.at[0] - deck.origin[0], p.at[1] - deck.origin[2]);
  const lx = u - W / 2,
    lz = v - D / 2;
  let out: Vec3;
  if (p.facing === "front") out = scale(deck.y, -1);
  else if (deck.round) {
    const l = Math.hypot(lx, lz);
    out = l < 0.01 ? deck.x : [(deck.x[0] * lx + deck.y[0] * lz) / l, 0, (deck.x[2] * lx + deck.y[2] * lz) / l];
  } else out = Math.abs(lx / W) > Math.abs(lz / D) ? scale(deck.x, lx > 0 ? 1 : -1) : scale(deck.y, lz >= 0 ? 1 : -1);
  const z = out,
    x: Vec3 = [z[2], 0, -z[0]],
    y: Vec3 = [0, 1, 0];
  const { min, max } = facts.bounds;
  const [sx, sy, sz] = prefabScale(facts, p.width ?? max[0] - min[0], p.height ?? max[1] - min[1]);
  // A point of the prefab's x/z plane in the deck's centered coordinates.
  const local = (px: number, pz: number): [number, number] => {
    const wx = x[0] * px * sx + z[0] * pz * sz,
      wz = x[2] * px * sx + z[2] * pz * sz;
    return [lx + dot2(deck.x, wx, wz), lz + dot2(deck.y, wx, wz)];
  };
  const rim = deck.rim ?? 0;
  const inside = ([cx, cz]: [number, number]) =>
    deck.round
      ? Math.hypot(cx, cz) <= W / 2 - rim + 1e-9
      : Math.abs(cx) <= W / 2 - rim + 1e-9 && Math.abs(cz) <= D / 2 - rim + 1e-9;
  const footprint = [
    [min[0], min[2]],
    [max[0], min[2]],
    [max[0], max[2]],
    [min[0], max[2]]
  ].map(([px, pz]) => local(px, pz));
  if (!footprint.every(inside)) throw Error("The prefab stands outside the roof deck");
  const at: Vec3 = [p.at[0], deck.origin[1] + p.bottom, p.at[1]];
  const elements: Record<string, GeometryElement> = {
    mount: {
      kind: "point",
      frame: { origin: mountFor(at, { x, y, z }, facts, sx, sy), x, y, z },
      on: { host, element: "deck", u, v }
    }
  };
  // The prefab's x/z plane lies on the deck square to its sides or, on a round deck, turned by
  // any angle; then the largest deck rectangle inside an opening is a square, smaller by
  // |cos| + |sin|.
  const cos = Math.abs(dot2(deck.x, x[0], x[2])),
    sin = Math.abs(dot2(deck.y, x[0], x[2]));
  facts.openings.forEach((o, i) => {
    const [cu, cv] = local((o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2);
    const w = (o.max[0] - o.min[0]) * sx,
      h = (o.max[1] - o.min[1]) * sz;
    const turned = Math.min(w, h) / 2 / (cos + sin);
    const [hu, hv] = Math.min(cos, sin) > 1e-9 ? [turned, turned] : cos > sin ? [w / 2, h / 2] : [h / 2, w / 2];
    const origin: Vec3 = [
      deck.origin[0] + deck.x[0] * (cu + W / 2 - hu) + deck.y[0] * (cv + D / 2 - hv),
      deck.origin[1],
      deck.origin[2] + deck.x[2] * (cu + W / 2 - hu) + deck.y[2] * (cv + D / 2 - hv)
    ];
    const params: RoofDeckParams = { origin, x: deck.x, y: deck.y, size: [2 * hu, 2 * hv] };
    elements[`opening${i}`] = { kind: "surface", surface: { kind: "roofDeck", params } };
  });
  return { elements };
};

/** Attach rule of a deck mount: each of its openings comes out of the deck. */
export const deckOpening: ConnectionRule = ({ guest, hosts }) => {
  const deckHost = hosts.find((h) => deckOf(h));
  if (!guest || !deckHost) return {};
  const deck = deckOf(deckHost)!;
  const rects = Object.values(guest.geometry.original.elements).flatMap((e): Rect[] => {
    if (e.kind !== "surface" || e.surface.kind !== "roofDeck") return [];
    const o = e.surface.params as RoofDeckParams;
    const u = dot2(deck.x, o.origin[0] - deck.origin[0], o.origin[2] - deck.origin[2]),
      v = dot2(deck.y, o.origin[0] - deck.origin[0], o.origin[2] - deck.origin[2]);
    return [[u, v, u + o.size[0], v + o.size[1]]];
  });
  return {
    modify: rects.map((rect) => ({
      part: deckHost.key,
      modification: { element: "deck", op: "removeArea" as const, rect }
    }))
  };
};

/** Registers the deck mount part types into a registry. */
export function registerDeckMountTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.geometry.register("houseDeckMount", houseDeckMountGeometry);
  registry.rules.register("deckOpening", deckOpening);
  for (const type of ["hatch", "roofLamp"]) registry.defaults.attach(type, ["roofDeck"], "deckOpening");
  return registry;
}
