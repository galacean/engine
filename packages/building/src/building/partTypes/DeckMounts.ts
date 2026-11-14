// Part-type layer: prefabs that stand on a flat roof's deck, such as hatches and roof lamps.
// - A deck mount has a point "mount" on the deck under its plan position. It stands upright
//   and faces the nearest edge of the deck (a hatch) or the house's front (a lamp).
// - What passes down through the deck opens it.
import {
  scale,
  type BuildingRegistry,
  type ConnectionRule,
  type GeometryElement,
  type GeometryGenerator,
  type OccupiedUnit,
  type ParticipantView,
  type Rect,
  type Vec3
} from "../core";
import { prefabFacts, prefabScale } from "./Openings";
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

/** Element "mount". The prefab's origin stands on the deck under the plan position, raised by
 * `bottom`; its footprint must stay inside the walls' inner face. */
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
  const [sx, , sz] = prefabScale(facts, p.width ?? max[0] - min[0], p.height ?? max[1] - min[1]);
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
      frame: { origin: at, x, y, z },
      on: { host, element: "deck", u, v }
    }
  };
  return { elements };
};

/** How far a member must reach below the deck to pass through it, in metres. */
const THROUGH_DECK = 0.05;
/** The rectangle of the deck a unit opens: where its members pass down through the deck. On a
 * round deck a unit can stand turned by any angle; the rectangle is then the largest square of
 * the deck inside what passes through. */
function deckRect({ matrix: m, solids }: OccupiedUnit, deck: RoofDeckParams): Rect | undefined {
  const level = deck.origin[1];
  const through = solids.filter(
    (s) => !s.cover && m[5] * s.y[0] + m[13] < level - THROUGH_DECK && m[5] * s.y[1] + m[13] > level
  );
  if (!through.length) return undefined;
  const lx = Math.hypot(m[0], m[2]),
    lz = Math.hypot(m[8], m[10]);
  const hull = through.flatMap((s) => s.hull);
  const span = (k: number, scale: number) => {
    const values = hull.map((q) => q[k] * scale);
    return [Math.min(...values), Math.max(...values)];
  };
  const [x0, x1] = span(0, lx),
    [z0, z1] = span(1, lz);
  const ax = [m[0] / lx, m[2] / lx],
    az = [m[8] / lz, m[10] / lz];
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const center = [m[12] + ax[0] * cx + az[0] * cz - deck.origin[0], m[14] + ax[1] * cx + az[1] * cz - deck.origin[2]];
  const [cu, cv] = [deck.x[0] * center[0] + deck.x[2] * center[1], deck.y[0] * center[0] + deck.y[2] * center[1]];
  const cos = Math.abs(deck.x[0] * ax[0] + deck.x[2] * ax[1]),
    sin = Math.abs(deck.y[0] * ax[0] + deck.y[2] * ax[1]);
  const [w, h] = [x1 - x0, z1 - z0];
  const turned = Math.min(w, h) / 2 / (cos + sin);
  const [hu, hv] = Math.min(cos, sin) > 1e-9 ? [turned, turned] : cos > sin ? [w / 2, h / 2] : [h / 2, w / 2];
  return [cu - hu, cv - hv, cu + hu, cv + hv];
}

/** Attach rule of a deck mount: what passes through the deck comes out of it. */
export const deckOpening: ConnectionRule = ({ guest, hosts }) => {
  const deckHost = hosts.find((h) => deckOf(h));
  if (!guest || !deckHost) return {};
  const deck = deckOf(deckHost)!;
  return {
    modify: guest.occupied.flatMap((unit) => {
      const rect = deckRect(unit, deck);
      return rect ? [{ part: deckHost.key, modification: { element: "deck", op: "removeArea" as const, rect } }] : [];
    })
  };
};

/** Registers the deck mount part types into a registry. */
export function registerDeckMountTypes(registry: BuildingRegistry): BuildingRegistry {
  registry.geometry.register("houseDeckMount", houseDeckMountGeometry);
  registry.rules.register("deckOpening", deckOpening);
  for (const type of ["hatch", "roofLamp"]) registry.defaults.attach(type, ["roofDeck"], "deckOpening");
  return registry;
}
