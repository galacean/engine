import { random, createSurfaceSampler } from "../../ridge-utils.mjs";
import { createMountainNetwork } from "./mountain-network.mjs";
import { assembleRidgeTarget } from "./ridge.mjs";

export const MOUNTAIN_PROFILE_VERSION = "seeded-mountain-profile-1";
// Shared authoring domain for candidate comparison and native publication.
export const MOUNTAIN_PROFILE_SOURCE = {
  id: "peaks",
  extent: [-56, 56, -41, 42],
  rocks: [],
  guides: [],
  labels: [],
  terrain: { positions: [-56, 0, -41, 56, 0, -41, 56, 0, 42, -56, 0, 42], indices: [0, 2, 1, 0, 3, 2] },
  camera: { target: [0, 15, 0] }
};

// Vary the established mountain profile, rather than growing arbitrary shapes.
// The mountain generator still owns the connected summit/saddle/spur topology.
// Bounded profile changes retain a dominant crown, descending flanks and toes.
export function createMountainProfile(source, inputSeed, options = {}) {
  const seed = Number(inputSeed) >>> 0,
    r = random(seed, MOUNTAIN_PROFILE_VERSION),
    range = (a, b) => a + (b - a) * r();
  const plan = createMountainNetwork(source, seed, options.topology),
    ground = createSurfaceSampler(source, {}, true);
  const profile = {
    version: MOUNTAIN_PROFILE_VERSION,
    along: range(0.78, 1.2),
    across: range(0.78, 1.2),
    height: range(0.8, 1.3),
    flankWidth: range(0.82, 1.12)
  };
  const [x0, x1, z0, z1] = source.extent,
    cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  const original = new Map(plan.nodes.map((n) => [n.id, { ...n, position: [...n.position] }]));
  const primary = plan.nodes.find((n) => n.primary),
    crown = (primary.y - ground(primary.position[0], primary.position[2])) * profile.height;
  // Scale around the footprint centre; retain clearance for the same broad atoms.
  let fit = 1;
  for (const n of plan.nodes) {
    fit = Math.min(
      fit,
      ((x1 - x0) / 2 - 14) / Math.max(1, Math.abs(n.position[0] - cx) * profile.along),
      ((z1 - z0) / 2 - 12) / Math.max(1, Math.abs(n.position[2] - cz) * profile.across)
    );
  }
  for (const n of plan.nodes) {
    const old = original.get(n.id),
      oldGround = ground(old.position[0], old.position[2]);
    n.position[0] = cx + (old.position[0] - cx) * profile.along * fit;
    n.position[2] = cz + (old.position[2] - cz) * profile.across * fit;
    const floor = ground(n.position[0], n.position[2]);
    n.y =
      floor + (n.primary ? crown : n.role === "peak" ? crown * range(0.6, 0.92) : (old.y - oldGround) * profile.height);
  }
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  for (const curve of plan.curves) {
    const start = byId.get(curve.knots[0].id),
      end = byId.get(curve.knots.at(-1).id);
    for (const k of curve.knots.slice(1, -1)) {
      const n = byId.get(k.id),
        floor = ground(n.position[0], n.position[2]);
      if (n.role === "saddle") n.y = floor + (Math.min(start.y, end.y) - floor) * range(0.62, 0.86);
      else {
        const a = original.get(start.id).y,
          b = original.get(end.id).y,
          u = (original.get(n.id).y - b) / Math.max(0.001, a - b);
        n.y = end.y + (start.y - end.y) * u;
      }
    }
  }
  for (const n of plan.nodes) n.position[1] = n.y;
  for (const curve of plan.curves) {
    let t = 0;
    curve.knots = curve.knots.map((k, i) => {
      const n = byId.get(k.id);
      if (i) {
        const previous = byId.get(curve.knots[i - 1].id);
        t += Math.hypot(n.position[0] - previous.position[0], n.position[2] - previous.position[2]);
      }
      return { ...n, position: [...n.position], t };
    });
  }
  return { ...plan, profile };
}

export function generateMountainProfileScene(source, geometries, seed, options = {}) {
  const scene = assembleRidgeTarget(source, geometries, createMountainProfile(source, seed, options), options);
  return { ...scene, fitMode: "contain", name: "Mountain peak variation" };
}
