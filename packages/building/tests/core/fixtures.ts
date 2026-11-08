// A minimal part-type layer used only by the core tests. Domain knowledge (what a wall
// or a window is, which rule applies between them) lives here, never in the core.
import {
  createBuildingRegistry,
  expandUnits,
  type ExpandablePart,
  joinPairKey,
  type BuildingCoreDraft,
  type BuildingUnit,
  type ConnectionRule,
  type JoinDetector,
  type ParticipantView,
  type Vec3
} from "../../src/building/core";

const box = (source: string, w: number, h: number, d: number): BuildingUnit => ({
  source,
  bounds: { min: [-w / 2, -h / 2, -d / 2], max: [w / 2, h / 2, d / 2] }
});
export const brick = box("brick", 0.5, 0.25, 0.1);
export const windowUnit = box("window", 1, 1.2, 0.2);
export const stitch = box("stitch", 0.2, 0.5, 0.2);
export const capTile = box("cap-tile", 0.25, 0.25, 0.02);

function baseSegment(view: ParticipantView): [Vec3, Vec3] {
  const base = view.geometry.original.elements.base;
  if (base?.kind !== "curve") throw Error("Expected an extruded part with a base curve");
  return [base.curve.points[0], base.curve.points[1]];
}
/** Crossing of two segments in XZ, as fractions along each. */
function crossing(a: [Vec3, Vec3], b: [Vec3, Vec3]): { t: number; s: number } | undefined {
  const [p, p1] = a,
    [q, q1] = b;
  const r = [p1[0] - p[0], p1[2] - p[2]],
    d = [q1[0] - q[0], q1[2] - q[2]];
  const den = r[0] * d[1] - r[1] * d[0];
  if (Math.abs(den) < 1e-12) return;
  const w = [q[0] - p[0], q[2] - p[2]];
  const t = (w[0] * d[1] - w[1] * d[0]) / den,
    s = (w[0] * r[1] - w[1] * r[0]) / den;
  if (t <= 0 || t >= 1 || s <= 0 || s >= 1) return;
  return { t, s };
}
const segmentLength = ([a, b]: [Vec3, Vec3]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export const basesCross: JoinDetector = (a, b) => !!crossing(baseSegment(a), baseSegment(b));
/** Peer rule: both parts give way around the crossing, and the connection owns a seam. */
export const crossingRule: ConnectionRule = ({ parts }) => {
  const [a, b] = parts;
  const sa = baseSegment(a),
    sb = baseSegment(b);
  const hit = crossing(sa, sb);
  if (!hit) return { diagnostics: ["Parts do not cross"] };
  const height = Math.min(a.geometry.surface("face").domain.v[1], b.geometry.surface("face").domain.v[1]);
  const x = sa[0][0] + (sa[1][0] - sa[0][0]) * hit.t,
    z = sa[0][2] + (sa[1][2] - sa[0][2]) * hit.t;
  const gap = (view: ParticipantView, u: number) => ({
    part: view.key,
    modification: { element: "face", op: "removeArea" as const, rect: [u - 0.3, 0, u + 0.3, height] as const }
  });
  return {
    modify: [gap(a, hit.t * segmentLength(sa)), gap(b, hit.s * segmentLength(sb))],
    derive: [
      {
        localId: "seam",
        type: "seam",
        geometry: {
          elements: {
            line: {
              kind: "curve",
              curve: {
                points: [
                  [x, 0, z],
                  [x, height, z]
                ],
                up: [1, 0, 0]
              }
            }
          }
        },
        algorithm: { type: "alongCurves", params: { spacing: 0.5 } },
        unit: stitch
      }
    ]
  };
};
/** Insert that opens its host and derives a cap, which then joins the same host. */
export const capOnHost: ConnectionRule = ({ guest, hosts }) => {
  const at = guest!.geometry.location("point")!;
  const frame = guest!.geometry.point("point");
  const origin: Vec3 = [
    frame.origin[0] - frame.x[0] * 0.5,
    frame.origin[1] - frame.x[1] * 0.5,
    frame.origin[2] - frame.x[2] * 0.5
  ];
  return {
    modify: [
      {
        part: hosts[0].key,
        modification: { element: at.element, op: "removeArea", rect: [at.u - 0.5, at.v - 0.5, at.u + 0.5, at.v + 0.5] }
      }
    ],
    derive: [
      {
        localId: "cap",
        type: "cap",
        geometry: {
          elements: {
            face: {
              kind: "surface",
              surface: { kind: "plane", params: { origin, x: frame.x, y: frame.y, size: [1, 1] } }
            }
          }
        },
        algorithm: { type: "surfaceGrid", params: { cell: [0.25, 0.25] } },
        unit: capTile
      }
    ],
    connect: [{ kind: "join", localId: "cap-joint", parts: [{ derived: "cap" }, { part: hosts[0].key }] }]
  };
};
/** Peer rule between a derived cap and its host: the cap loses its lowest row. */
export const trimCap: ConnectionRule = ({ parts }) => {
  const cap = parts.find((p) => p.type === "cap")!;
  return { modify: [{ part: cap.key, modification: { element: "face", op: "removeArea", rect: [0, 0, 1, 0.25] } }] };
};

/** Laid units of a part, expanded on demand with the test registry. */
export const unitsOf = (part: ExpandablePart) => expandUnits(part, testRegistry());

export function testRegistry() {
  const registry = createBuildingRegistry();
  registry.defaults.attach("window", ["wall"], "voidUnderGuest");
  registry.defaults.attach("halfDormer", ["wall", "roof"], "voidUnderGuest");
  registry.rules.register("crossing", crossingRule);
  registry.defaults.join("wall", "wall", "crossing");
  registry.detectors.register(joinPairKey("wall", "wall"), basesCross);
  registry.rules.register("capOnHost", capOnHost);
  registry.defaults.attach("dormer", ["roof"], "capOnHost");
  registry.rules.register("trimCap", trimCap);
  registry.defaults.join("cap", "roof", "trimCap");
  return registry;
}

const wallPart = (id: string, group: string) => ({
  id,
  group,
  type: "wall",
  geometry: { generator: "extrude", params: { curve: { "@shared": "footprint" }, height: { "@shared": "height" } } },
  algorithm: { type: "surfaceGrid", params: { stagger: 0.5 } },
  unit: brick
});
/** One 8 m straight wall with a window at u = windowU. */
export function houseDraft(windowU = 2): BuildingCoreDraft {
  return {
    groups: [
      {
        id: "house",
        seed: 7,
        shared: {
          footprint: {
            points: [
              [0, 0, 0],
              [8, 0, 0]
            ]
          },
          height: 3
        }
      }
    ],
    parts: [
      wallPart("wall", "house"),
      {
        id: "window",
        group: "house",
        type: "window",
        geometry: { generator: "onHost", params: { u: windowU, v: 1.5 } },
        algorithm: { type: "placeAtPoints" },
        unit: windowUnit
      }
    ],
    connections: [{ kind: "attach", id: "window-on-wall", guest: "window", hosts: [{ part: "wall", element: "face" }] }]
  };
}
/** Two groups whose walls cross at (4, 0, 0). */
export function crossingDraft(): BuildingCoreDraft {
  const group = (id: string, seed: number, from: Vec3, to: Vec3) => ({
    id,
    seed,
    shared: { footprint: { points: [from, to] }, height: 3 }
  });
  return {
    groups: [group("a", 1, [0, 0, 0], [8, 0, 0]), group("b", 2, [4, 0, -3], [4, 0, 3])],
    parts: [wallPart("wall-a", "a"), wallPart("wall-b", "b")],
    connections: []
  };
}
export function roofPart(id: string, group: string) {
  return {
    id,
    group,
    type: "roof",
    geometry: {
      generator: "elements",
      params: {
        elements: {
          slope: {
            kind: "surface",
            surface: { kind: "plane", params: { origin: [0, 3, 0], x: [1, 0, 0], y: [0, 0.6, -0.8], size: [8, 4] } }
          }
        }
      }
    },
    algorithm: { type: "surfaceGrid", params: { cell: [0.5, 0.5] } },
    unit: { source: "roof-tile", bounds: { min: [-0.25, -0.25, -0.02], max: [0.25, 0.25, 0.02] } }
  } as const;
}
