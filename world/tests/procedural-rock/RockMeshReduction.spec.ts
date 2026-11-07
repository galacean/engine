import { describe, expect, it } from "vitest";
import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock, simplifierReady } from "../../../packages/terrain/src/rock-formation/generator/simplify-rock.js";
import { ROCK_SCENE_PRESETS } from "../../demos/procedural-rock/presets.js";
import { compareSilhouettes } from "./SilhouetteMeasurement.js";
import { buildGrassCoverage } from "../../demos/procedural-rock/GrassCoverage";

type RockMesh = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; surfaceRoles?: Float32Array };
type Edge = { faces: number[]; orientation: number };

function auditGeometry(mesh: RockMesh) {
  const { positions, indices } = mesh;
  const vertexCount = positions.length / 3,
    faceCount = indices.length / 3;
  const normals: number[][] = [],
    edges = new Map<string, Edge>();
  const vertexFaces = Array.from({ length: vertexCount }, () => [] as number[]);
  const faceNeighbors = Array.from({ length: faceCount }, () => [] as number[]);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let minDoubleArea = Infinity,
    maxFaceTurn = 0;
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  for (let face = 0; face < faceCount; face++) {
    const a = indices[face * 3],
      b = indices[face * 3 + 1],
      c = indices[face * 3 + 2];
    const u = [0, 1, 2].map((axis) => positions[b * 3 + axis] - positions[a * 3 + axis]);
    const v = [0, 1, 2].map((axis) => positions[c * 3 + axis] - positions[a * 3 + axis]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const doubleArea = Math.hypot(...cross);
    minDoubleArea = Math.min(minDoubleArea, doubleArea);
    normals.push(cross.map((value) => value / doubleArea));
    for (const vertex of [a, b, c]) vertexFaces[vertex].push(face);
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a]
    ]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const edge = edges.get(key) ?? { faces: [], orientation: 0 };
      edge.faces.push(face);
      edge.orientation += from < to ? 1 : -1;
      edges.set(key, edge);
    }
  }
  let openOrNonManifoldEdges = 0,
    inconsistentEdges = 0;
  for (const edge of edges.values()) {
    if (edge.faces.length !== 2) {
      openOrNonManifoldEdges++;
      continue;
    }
    if (edge.orientation !== 0) inconsistentEdges++;
    const [a, b] = edge.faces;
    faceNeighbors[a].push(b);
    faceNeighbors[b].push(a);
    const cosine = normals[a].reduce((sum, value, axis) => sum + value * normals[b][axis], 0);
    maxFaceTurn = Math.max(maxFaceTurn, (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI);
  }
  const connectedFaces = new Set<number>(),
    pending = [0];
  while (pending.length) {
    const face = pending.pop()!;
    if (connectedFaces.has(face)) continue;
    connectedFaces.add(face);
    pending.push(...faceNeighbors[face]);
  }
  let disconnectedVertexFans = 0;
  for (const faces of vertexFaces) {
    if (!faces.length) {
      disconnectedVertexFans++;
      continue;
    }
    const remaining = new Set(faces),
      fan = [faces[0]];
    while (fan.length) {
      const face = fan.pop()!;
      if (!remaining.delete(face)) continue;
      for (const neighbor of faceNeighbors[face]) if (remaining.has(neighbor)) fan.push(neighbor);
    }
    if (remaining.size) disconnectedVertexFans++;
  }
  return {
    min,
    max,
    minDoubleArea,
    maxFaceTurn,
    openOrNonManifoldEdges,
    inconsistentEdges,
    disconnectedVertexFans,
    connectedFaces: connectedFaces.size,
    eulerCharacteristic: vertexCount - edges.size + faceCount
  };
}

const cases = [
  { name: "default", parameters: {} },
  {
    name: "flat slab",
    parameters: {
      seed: 3291,
      resolution: 48,
      obbWidth: 7,
      obbHeight: 2.5,
      obbDepth: 3.2,
      topRoughness: 0,
      topSlope: 24
    }
  },
  {
    name: "pointed bottom",
    parameters: {
      seed: 5917,
      resolution: 48,
      obbWidth: 4.6,
      obbHeight: 6.5,
      obbDepth: 3.8,
      topScale: 0.76,
      bottomScale: 0,
      shoulderScale: 1,
      shoulderHeight: 0.76,
      topRoughness: 0.08,
      topSlope: 12,
      topDirection: 230,
      wallCount: 9,
      wallOverlap: 0.42,
      wallLength: 1.8,
      wallProtrusion: 0.6,
      wallTilt: -14,
      wallStrength: 0.7
    }
  },
  {
    name: "narrow top",
    parameters: { seed: 6249, resolution: 48, obbWidth: 6, obbHeight: 18, obbDepth: 5.5, topScale: 0.08, topSlope: 18 }
  },
  {
    name: "wide cap",
    parameters: {
      seed: 4659,
      resolution: 72,
      obbWidth: 13,
      obbHeight: 14,
      obbDepth: 10,
      topScale: 1,
      bottomScale: 0.13,
      shoulderScale: 1,
      shoulderHeight: 0.73,
      topRoughness: 0.16,
      topSlope: 13,
      topDirection: 40,
      wallCount: 18,
      wallOverlap: 0.66,
      wallLength: 1.35,
      wallProtrusion: 0.95,
      wallTilt: -12,
      wallStrength: 0.78
    }
  },
  {
    name: "highly tilted roof",
    parameters: { obbWidth: 18, obbHeight: 32, obbDepth: 8, topSlope: 47, topRoughness: 0.3 }
  },
  {
    name: "user 31 degree roof",
    parameters: {
      obbWidth: 10,
      obbHeight: 16,
      obbDepth: 8,
      topScale: 1,
      shoulderScale: 0.56,
      shoulderHeight: 0.23,
      bottomScale: 0,
      topRoughness: 0.58,
      topSlope: 31
    }
  },
  { name: "flat extreme", parameters: { obbWidth: 80, obbHeight: 1, obbDepth: 80, bottomScale: 0, wallProtrusion: 1 } },
  { name: "tall extreme", parameters: { obbWidth: 1, obbHeight: 120, obbDepth: 1, bottomScale: 0, wallProtrusion: 1 } }
];

describe("rock render mesh reduction", () => {
  it.each(cases)("preserves closed topology, obtuse turns, bounds and roof attributes: $name", ({ parameters }) => {
    const raw = buildRock(parameters),
      mesh = simplifyRock(raw);
    const measured = auditGeometry(mesh),
      source = auditGeometry(raw);
    expect(mesh.indices.length).toBeLessThanOrEqual(raw.indices.length);
    expect(measured.minDoubleArea).toBeGreaterThan(0);
    expect(measured.openOrNonManifoldEdges).toBe(0);
    expect(measured.inconsistentEdges).toBe(0);
    expect(measured.disconnectedVertexFans).toBe(0);
    expect(measured.connectedFaces).toBe(mesh.indices.length / 3);
    expect(measured.eulerCharacteristic).toBe(2);
    expect(measured.maxFaceTurn).toBeLessThanOrEqual(90.1);
    expect(mesh.stats.maxFaceTurn).toBeCloseTo(measured.maxFaceTurn, 4);
    expect(mesh.stats.sharpEdges).toBe(0);
    expect(measured.min).toEqual(source.min);
    expect(measured.max).toEqual(source.max);
    expect(mesh.bounds).toEqual(raw.bounds);
    expect(mesh.envelopeBounds).toEqual(raw.envelopeBounds);
    expect(mesh.composition).toBe(raw.composition);
    // Every retained position still carries its matching source normal and roof role.
    const sourceVertices = new Map<string, number>();
    for (let i = 0; i < raw.positions.length; i += 3)
      sourceVertices.set(Array.from(raw.positions.slice(i, i + 3)).join(","), i / 3);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const sourceVertex = sourceVertices.get(Array.from(mesh.positions.slice(i, i + 3)).join(","))!;
      expect(sourceVertex).toBeDefined();
      expect(mesh.surfaceRoles[i / 3]).toBe(raw.surfaceRoles[sourceVertex]);
      expect(mesh.normals.slice(i, i + 3)).toEqual(raw.normals.slice(sourceVertex * 3, sourceVertex * 3 + 3));
    }
    const coverage = buildGrassCoverage(mesh, mesh.surfaceRoles);
    for (let i = 0; i < mesh.surfaceRoles.length; i++) if (mesh.surfaceRoles[i] === 1) expect(coverage[i]).toBe(1);
    if (parameters.bottomScale === 0) {
      let count = 0;
      for (let i = 0; i < mesh.positions.length; i += 3)
        if (mesh.positions[i + 1] === measured.min[1]) {
          count++;
          expect(mesh.positions[i]).toBe(0);
          expect(mesh.positions[i + 2]).toBe(0);
        }
      expect(count).toBe(1);
    }
    expect(mesh.stats.meshBytes).toBe(
      mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength + mesh.surfaceRoles.byteLength
    );
    expect(mesh.stats.triangles).toBe(mesh.indices.length / 3);
    expect(mesh.stats.rawTriangles).toBe(raw.indices.length / 3);
    if (!mesh.stats.retainedRaw) expect(mesh.stats.acceptedError).toBeLessThanOrEqual(mesh.stats.requestedError);
  });

  it("removes redundant flat-cap triangles while keeping the planar roof", () => {
    const raw = buildRock({ topRoughness: 0, topSlope: 0 }),
      mesh = simplifyRock(raw);
    const capFaces = (m: typeof raw) => {
      let count = 0;
      for (let i = 0; i < m.indices.length; i += 3)
        if ([0, 1, 2].every((j) => m.surfaceRoles[m.indices[i + j]] === 1)) count++;
      return count;
    };
    expect(mesh.stats.retainedRaw).toBe(false);
    expect(capFaces(mesh)).toBeLessThan(capFaces(raw) * 0.15);
    expect(mesh.indices.length).toBeLessThan(raw.indices.length * 0.4);
    const heights = [];
    for (let i = 0; i < mesh.surfaceRoles.length; i++)
      if (mesh.surfaceRoles[i] === 1) heights.push(mesh.positions[i * 3 + 1]);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1e-6);
  });

  it("is deterministic, leaves input arrays intact, and can return the unmodified mesh", () => {
    const raw = buildRock({ resolution: 48 });
    const before = [raw.positions.slice(), raw.normals.slice(), raw.indices.slice(), raw.surfaceRoles.slice()];
    const a = simplifyRock(raw),
      b = simplifyRock(raw);
    expect(a.indices).toEqual(b.indices);
    expect(a.positions).toEqual(b.positions);
    expect([raw.positions, raw.normals, raw.indices, raw.surfaceRoles]).toEqual(before);
    const disabled = simplifyRock(raw, { enabled: false });
    expect(disabled.indices).toBe(raw.indices);
    expect(disabled.positions).toBe(raw.positions);
    expect(disabled.stats.reduction).toBe(0);
    expect(disabled.stats.simplifyMs).toBe(0);
    expect(disabled.stats.simplificationMethod).toBe("disabled");
  });

  it.each([0.001, 0.004, 0.008])("enforces topology and face angles at error budget %s", (error) => {
    const mesh = simplifyRock(buildRock({ wallProtrusion: 1, wallCount: 28, topRoughness: 1, topSlope: 45 }), {
      error
    });
    const measured = auditGeometry(mesh);
    expect(measured.openOrNonManifoldEdges).toBe(0);
    expect(measured.disconnectedVertexFans).toBe(0);
    expect(measured.maxFaceTurn).toBeLessThanOrEqual(90.1);
    expect(mesh.stats.retainedRaw || mesh.stats.acceptedError <= error).toBe(true);
  });
});

await simplifierReady;

describe("budgeted rock reduction", () => {
  it("keeps 100 varied rocks within 100,000 triangles, without opening the surface or adding acute hinges", async () => {
    await simplifierReady;
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const preset = ROCK_SCENE_PRESETS[i % ROCK_SCENE_PRESETS.length];
      const parameters = { ...preset.parameters, seed: preset.parameters.seed + Math.floor(i / 9) * 997 };
      if (i === 98)
        Object.assign(parameters, { obbWidth: 1, obbHeight: 120, obbDepth: 1, bottomScale: 0, wallProtrusion: 1 });
      if (i === 99)
        Object.assign(parameters, { obbWidth: 80, obbHeight: 1, obbDepth: 80, bottomScale: 0, wallProtrusion: 1 });
      const raw = buildRock(parameters),
        mesh = simplifyRock(raw, { targetTriangles: 1000 });
      const audit = auditGeometry(mesh),
        source = auditGeometry(raw);
      const context = `${preset.id} seed=${parameters.seed}`;
      expect(mesh.stats.triangles, context).toBeLessThanOrEqual(1000);
      expect(mesh.stats.budgetMet, context).toBe(true);
      expect(mesh.stats.attempts, context).toBeLessThanOrEqual(5);
      expect(mesh.stats.retainedRaw, context).toBe(false);
      expect(audit.minDoubleArea, context).toBeGreaterThan(0);
      expect(audit.maxFaceTurn, context).toBeLessThanOrEqual(90.1);
      expect(audit.openOrNonManifoldEdges, context).toBe(0);
      expect(audit.inconsistentEdges, context).toBe(0);
      expect(audit.disconnectedVertexFans, context).toBe(0);
      expect(audit.connectedFaces, context).toBe(mesh.indices.length / 3);
      expect(audit.eulerCharacteristic, context).toBe(2);
      expect(audit.min, context).toEqual(source.min);
      expect(audit.max, context).toEqual(source.max);
      total += mesh.stats.triangles;
      if (i < 9) {
        // 512px object framing, six axes plus four oblique views. The tolerance
        // is visible/quantized, not an assertion of lossless surface geometry.
        const quality = compareSilhouettes(raw, mesh).summary;
        expect(quality.minIoU, context).toBeGreaterThan(0.98);
        expect(quality.maxP95BoundaryDeviationPx, context).toBeLessThanOrEqual(3);
        expect(quality.maxBoundaryDeviationPx, context).toBeLessThanOrEqual(8);
        const coverage = buildGrassCoverage(mesh, mesh.surfaceRoles);
        for (let v = 0; v < mesh.surfaceRoles.length; v++) if (mesh.surfaceRoles[v] === 1) expect(coverage[v]).toBe(1);
      }
    }
    expect(total).toBeLessThanOrEqual(100000);
  }, 60000);

  it("changes budgets deterministically and retains the original buffers for comparison", async () => {
    await simplifierReady;
    const raw = buildRock(ROCK_SCENE_PRESETS[4].parameters),
      before = raw.indices.slice();
    const a = simplifyRock(raw, { targetTriangles: 1000 }),
      b = simplifyRock(raw, { targetTriangles: 1000 });
    const finer = simplifyRock(raw, { targetTriangles: 2000 });
    expect(a.indices).toEqual(b.indices);
    expect(a.positions).toEqual(b.positions);
    expect(finer.stats.triangles).toBeGreaterThan(a.stats.triangles);
    expect(finer.stats.triangles).toBeLessThanOrEqual(2000);
    expect(raw.indices).toEqual(before);
    expect(simplifyRock(raw, { enabled: false, targetTriangles: 1000 }).positions).toBe(raw.positions);
  });

  it("stops at the error tolerance instead of filling the triangle allowance", () => {
    const raw = buildRock({ topRoughness: 0, topSlope: 0, wallProtrusion: 0, wallStrength: 0 });
    const mesh = simplifyRock(raw, { targetTriangles: 1000 });
    expect(mesh.stats.triangles).toBeLessThan(1000);
    expect(mesh.stats.budgetMet).toBe(true);
    expect(compareSilhouettes(raw, mesh).summary.minIoU).toBeGreaterThan(0.98);
  });

  it("reports quality fallback rather than claiming an impossible triangle budget", async () => {
    await simplifierReady;
    const raw = buildRock(ROCK_SCENE_PRESETS[4].parameters),
      mesh = simplifyRock(raw, { targetTriangles: 12 });
    expect(mesh.stats.budgetMet).toBe(false);
    expect(mesh.stats.triangles).toBeGreaterThan(12);
    const audit = auditGeometry(mesh);
    expect(audit.maxFaceTurn).toBeLessThanOrEqual(90.1);
    expect(audit.openOrNonManifoldEdges).toBe(0);
  });
});
