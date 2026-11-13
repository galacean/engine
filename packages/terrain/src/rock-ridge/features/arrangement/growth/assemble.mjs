import { random } from "../../../ridge-utils.mjs";
import { growStructure, massFrame } from "./plan.mjs";

// Fit complete seeded atoms to spatial mass envelopes. Their original rounded
// bodies and optional carving remain owned by the independent shaping stage.
export function assembleGrowthScene(source, geometries, inputSeed) {
  const plan = growStructure(inputSeed),
    rng = random(plan.seed, "growth-atom-fit-1");
  const rocks = plan.masses.map((mass, index) => {
    const slots =
      mass.role === "link"
        ? ["shoulder", "shoulder2", "cliff", "cliff2"]
        : mass.role === "foundation"
          ? ["bank", "bank2"]
          : ["peak", "peak2", "cliff", "cliff2"];
    const mesh = slots[Math.floor(rng() * slots.length)],
      g = geometries[mesh],
      span = g.bounds[1].map((v, d) => v - g.bounds[0][d]),
      scale = mass.size.map((v, d) => v / span[d]),
      axes = massFrame(mass);
    const local = g.bounds[1].map((v, d) => (v + g.bounds[0][d]) * 0.5 * scale[d]);
    const center = mass.center.map((v, d) => v - axes.reduce((sum, axis, k) => sum + axis[d] * local[k], 0));
    return {
      id: "growth-mass-" + index,
      mesh,
      x: center[0],
      y: center[1],
      z: center[2],
      yaw: mass.yaw,
      frame: axes,
      scale: 1,
      longitudinalScale: scale[0],
      verticalScale: scale[1],
      lateralScale: scale[2],
      role: mass.role
    };
  });
  return {
    ...source,
    id: "growth",
    name: "Seeded structure",
    rocks,
    fitMode: "contain",
    structure: { version: plan.version, seed: plan.seed, plan },
    terrain: { positions: [-56, 0, -42, 56, 0, -42, 56, 0, 42, -56, 0, 42], indices: [0, 2, 1, 0, 3, 2] },
    guides: plan.edges.map((e, i) => ({ kind: "target", curveId: "growth-" + i, points: e.points, liftM: 0 })),
    labels: [],
    notes: "Spatial masses and connections generated from the seed.",
    camera: { target: [0, 20, 0], yaw: 0.58, pitch: 0.52, span: 120 },
    metrics: { rocks: rocks.length, triangles: rocks.reduce((s, r) => s + geometries[r.mesh].indices.length / 3, 0) }
  };
}
