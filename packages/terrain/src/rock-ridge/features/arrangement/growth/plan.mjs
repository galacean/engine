import { random } from "../../../ridge-utils.mjs";

export const GROWTH_VERSION = "seeded-spatial-growth-1";
const growthUnit = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
const growthCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const growthMix = (a, b, u) => a + (b - a) * u;

// One stochastic construction process, not a catalogue of named shape recipes.
// Seeded controls vary continuously: radial concentration, anisotropy, breadth,
// elevation, connection density, clearance and branching. Graph cycles and
// disconnected components are outcomes of the same spatial growth process.
export function growStructure(inputSeed) {
  const seed = Number(inputSeed) >>> 0,
    r = random(seed, GROWTH_VERSION),
    range = (a, b) => growthMix(a, b, r());
  const count = 3 + Math.floor(r() * 7),
    angle = range(0, Math.PI * 2),
    aspect = Math.exp(range(-0.85, 0.85));
  const spread = range(18, 34),
    radialBias = r() ** 2,
    flatness = r() ** 2,
    relief = range(9, 44);
  const breadth = range(7, 24),
    fragmentation = r() ** 3,
    cycles = r() ** 2,
    clearance = r() ** 1.5;
  const bend = range(-0.5, 0.5),
    nodes = [],
    edges = [],
    masses = [];
  const spin = ([x, y, z]) => [Math.cos(angle) * x - Math.sin(angle) * z, y, Math.sin(angle) * x + Math.cos(angle) * z];
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * (i + r() * 0.55)) / count,
      rad = spread * growthMix(Math.sqrt(range(0.05, 1)), range(0.88, 1.06), radialBias);
    const x = Math.cos(a) * rad * aspect,
      z = (Math.sin(a) * rad) / aspect;
    const h = relief * growthMix(range(0.2, 1.0), 0.72, flatness),
      width = breadth * range(0.75, 1.25);
    nodes.push({
      id: i,
      position: spin([x, h, z]),
      height: h,
      width,
      depth: width * range(0.65, 1.35),
      weight: range(0.7, 1.3)
    });
  }
  // Euclidean minimum spanning growth followed by seeded pruning and local
  // reconnection. No fixed main axis, prescribed branch count, or required loop.
  const visited = new Set([0]),
    candidates = [];
  for (let i = 0; i < count; i++)
    for (let j = i + 1; j < count; j++) {
      const a = nodes[i].position,
        b = nodes[j].position;
      candidates.push({ a: i, b: j, length: Math.hypot(a[0] - b[0], a[2] - b[2]) });
    }
  candidates.sort((a, b) => a.length - b.length);
  const tree = [];
  while (visited.size < count) {
    const edge = candidates.find((e) => visited.has(e.a) !== visited.has(e.b));
    tree.push(edge);
    visited.add(edge.a);
    visited.add(edge.b);
  }
  for (const edge of tree) if (r() > fragmentation * 0.82) edges.push({ ...edge });
  const degree = (id) => edges.filter((e) => e.a === id || e.b === id).length;
  for (const edge of candidates) {
    if (edges.length >= count + 2 || edge.length > spread * 2.0) break;
    if (edges.some((e) => e.a === edge.a && e.b === edge.b) || degree(edge.a) > 2 || degree(edge.b) > 2) continue;
    if (r() < cycles * 0.7) edges.push({ ...edge });
  }
  for (const node of nodes) {
    const size = [node.width, node.height + 1, node.depth];
    masses.push({
      center: [node.position[0], node.height / 2 - 0.3, node.position[2]],
      size,
      yaw: angle + range(-0.65, 0.65),
      role: "support"
    });
  }
  for (const edge of edges) {
    const a = nodes[edge.a],
      b = nodes[edge.b],
      dx = b.position[0] - a.position[0],
      dz = b.position[2] - a.position[2],
      run = Math.hypot(dx, dz);
    const bulge = bend * run * range(0.3, 0.8),
      sag = range(-0.22, 0.18) * Math.min(a.height, b.height);
    const heightAt = (u) => growthMix(a.height, b.height, u) + Math.sin(Math.PI * u) * sag;
    const path = (u) => [
      growthMix(a.position[0], b.position[0], u) - (dz / run) * bulge * Math.sin(Math.PI * u),
      heightAt(u),
      growthMix(a.position[2], b.position[2], u) + (dx / run) * bulge * Math.sin(Math.PI * u)
    ];
    const pitch = range(10, 17),
      steps = Math.max(1, Math.ceil(run / pitch));
    const points = Array.from({ length: steps + 1 }, (_, i) => path(i / steps));
    edge.points = points;
    for (let i = 0; i < steps; i++) {
      const u = (i + 0.5) / steps,
        p = path(u),
        before = path(Math.max(0, u - 0.01)),
        after = path(Math.min(1, u + 0.01));
      const tangent = growthUnit(after.map((v, d) => v - before[d])),
        outward = growthUnit([-tangent[2], 0, tangent[0]]),
        up = growthCross(outward, tangent);
      const clear = clearance * Math.sin(Math.PI * u) ** 0.5;
      const thickness = Math.max(4, p[1] * (1 - clear)),
        depth = breadth * range(0.65, 1.15);
      // Elevated links leave real three-dimensional space underneath. Grounded
      // links use vertical walls; lifted links may tilt with the spatial curve.
      const tilt = clearance > 0.52,
        frame = tilt ? [tangent, up, outward] : undefined;
      masses.push({
        center: [p[0], p[1] - thickness * 0.5, p[2]],
        size: [(run / steps) * 1.62 + 3, thickness + 1, depth],
        yaw: Math.atan2(dz, dx),
        ...(frame ? { frame } : {}),
        role: "link"
      });
    }
  }
  // Additional low, broad foundations are stochastic mass growth, not debris.
  if (r() < 0.4) {
    const p = nodes[Math.floor(r() * nodes.length)],
      height = Math.max(2, p.height * range(0.15, 0.4));
    masses.push({
      center: [p.position[0], height / 2 - 0.6, p.position[2]],
      size: [p.width * range(1.3, 2), height, p.depth * range(1.3, 2)],
      yaw: angle,
      role: "foundation"
    });
  }
  // Put every structure on the same ground plane and centre its own footprint.
  // Uniform normalization preserves the generated aspect ratio and empty space.
  const corners = masses.flatMap((m) => massCorners(m)),
    lo = [0, 1, 2].map((d) => Math.min(...corners.map((p) => p[d]))),
    hi = [0, 1, 2].map((d) => Math.max(...corners.map((p) => p[d])));
  // A tilted link can extend below the nominal support bottoms. Extend every
  // grounded mass down to the common base instead of leaving its feet floating.
  for (const m of masses)
    if (!m.frame) {
      const top = m.center[1] + m.size[1] / 2;
      m.size[1] = top - lo[1];
      m.center[1] = (top + lo[1]) / 2;
    }
  const scale = Math.min(94 / (hi[0] - lo[0]), 72 / (hi[2] - lo[2]), 52 / (hi[1] - lo[1])),
    offset = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  for (const m of masses) {
    m.center = m.center.map((v, d) => (v - offset[d]) * scale);
    m.size = m.size.map((v) => v * scale);
  }
  for (const n of nodes) {
    n.position = n.position.map((v, d) => (v - offset[d]) * scale);
    n.height = n.position[1];
    n.width *= scale;
    n.depth *= scale;
  }
  for (const e of edges) {
    e.points = e.points.map((p) => p.map((v, d) => (v - offset[d]) * scale));
    e.length *= scale;
  }
  return {
    version: GROWTH_VERSION,
    seed,
    nodes,
    edges,
    masses,
    parameters: { count, aspect, spread, radialBias, flatness, relief, breadth, fragmentation, cycles, clearance }
  };
}

export function massFrame(m) {
  const c = Math.cos(m.yaw ?? 0),
    s = Math.sin(m.yaw ?? 0);
  return (
    m.frame ?? [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c]
    ]
  );
}
export function massCorners(m) {
  const frame = massFrame(m),
    corners = [];
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5])
      for (const z of [-0.5, 0.5])
        corners.push(
          m.center.map(
            (v, d) => v + frame[0][d] * m.size[0] * x + frame[1][d] * m.size[1] * y + frame[2][d] * m.size[2] * z
          )
        );
  return corners;
}
