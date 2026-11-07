import { describe, expect, it } from "vitest";
import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";

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

function roofHeight(mesh: RockMesh, x: number, z: number) {
  let highest = -Infinity;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const points = [0, 1, 2].map((corner) => {
      const offset = mesh.indices[i + corner] * 3;
      return [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]];
    });
    const [a, b, c] = points;
    const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(denominator) < 1e-12) continue;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
    const w = 1 - u - v;
    if (Math.min(u, v, w) >= -1e-8) highest = Math.max(highest, u * a[1] + v * b[1] + w * c[1]);
  }
  expect(Number.isFinite(highest)).toBe(true);
  return highest;
}

const userShape = {
  seed: 4659,
  topScale: 1,
  bottomScale: 0.64,
  topRoughness: 0.63,
  topSlope: 9,
  wallCount: 12,
  wallStrength: 0.45
};
const extreme = { topRoughness: 1, wallStrength: 1, wear: 1, wallCount: 28, wallOverlap: 0, wallStagger: 1 };

describe("procedural rock final geometry", () => {
  it.each([
    { name: "defaults", parameters: {} },
    { name: "zero section converges to a single bottom apex", parameters: { bottomScale: 0 } },
    {
      name: "user's tilted roof with a pointed bottom",
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
    {
      name: "extremely flat pointed bottom",
      parameters: {
        obbWidth: 80,
        obbHeight: 1,
        obbDepth: 80,
        bottomScale: 0,
        wallProtrusion: 1
      }
    },
    {
      name: "extremely tall pointed bottom",
      parameters: {
        obbWidth: 1,
        obbHeight: 120,
        obbDepth: 1,
        bottomScale: 0,
        wallProtrusion: 1
      }
    },
    { name: "current authored rock", parameters: userShape },
    {
      name: "seed 512, narrow base and 152 degree slope",
      parameters: { ...extreme, seed: 512, topScale: 1, bottomScale: 0.08, topSlope: 45, topDirection: 152 }
    },
    {
      name: "seed 13, full sections and 13 degree slope direction",
      parameters: { ...extreme, seed: 13, topScale: 1, bottomScale: 1, topSlope: 45, topDirection: 13 }
    },
    {
      name: "minimum sections and negative slope at zero degrees",
      parameters: {
        ...extreme,
        seed: 7,
        topScale: 0.08,
        bottomScale: 0.08,
        topSlope: -45,
        topDirection: 0,
        resolution: 48
      }
    },
    {
      name: "narrow top at 90 degrees",
      parameters: {
        ...extreme,
        seed: 41,
        topScale: 0.08,
        bottomScale: 1,
        topSlope: 45,
        topDirection: 90,
        resolution: 96
      }
    },
    {
      name: "narrow base and negative slope at 180 degrees",
      parameters: {
        ...extreme,
        seed: 513,
        topScale: 1,
        bottomScale: 0.08,
        topSlope: -45,
        topDirection: 180,
        resolution: 48
      }
    },
    {
      name: "full sections near the direction wrap",
      parameters: {
        ...extreme,
        seed: 999999,
        topScale: 1,
        bottomScale: 1,
        topSlope: 45,
        topDirection: 359.9,
        resolution: 96
      }
    },
    {
      name: "tall pillar with an upper shoulder",
      parameters: {
        obbWidth: 6,
        obbHeight: 20,
        obbDepth: 5,
        topScale: 0.16,
        bottomScale: 0.78,
        shoulderScale: 0.88,
        shoulderHeight: 0.72,
        topSlope: 10,
        wallCount: 14,
        wallOverlap: 0.2,
        wallLength: 1.4,
        wallProtrusion: 0.75,
        wallStrength: 0.8
      }
    },
    {
      name: "wide upper body and a narrow foot",
      parameters: {
        obbWidth: 10,
        obbHeight: 16,
        obbDepth: 8,
        topScale: 0.86,
        bottomScale: 0.24,
        shoulderScale: 0.9,
        shoulderHeight: 0.68,
        topSlope: 12,
        wallCount: 16,
        wallOverlap: 0.35,
        wallLength: 1.2,
        wallProtrusion: 0.75,
        wallStrength: 0.65
      }
    },
    {
      name: "wide shallow OBB with limited roof rise",
      parameters: {
        obbWidth: 30,
        obbHeight: 2,
        obbDepth: 12,
        topSlope: 75,
        topDirection: 30,
        shoulderScale: 1,
        shoulderHeight: 0.5,
        wallProtrusion: 1,
        wallStrength: 1
      }
    },
    {
      name: "tall thin OBB and strongly inclined faces",
      parameters: {
        obbWidth: 2,
        obbHeight: 40,
        obbDepth: 3,
        topScale: 0.12,
        bottomScale: 0.3,
        shoulderScale: 1,
        shoulderHeight: 0.8,
        wallProtrusion: 1,
        wallTilt: 35,
        topSlope: 75
      }
    }
  ])("has closed, nondegenerate geometry with at most 90 degree face turns: $name", ({ parameters }) => {
    const mesh = buildRock(parameters);
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.normals).toBeInstanceOf(Float32Array);
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.surfaceRoles).toBeInstanceOf(Float32Array);
    expect(mesh.surfaceRoles.length).toBe(mesh.positions.length / 3);
    expect(mesh.surfaceRoles.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.normals.every(Number.isFinite)).toBe(true);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(
      mesh.indices.every((index) => Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3)
    ).toBe(true);
    const measured = auditGeometry(mesh);
    expect(measured.minDoubleArea).toBeGreaterThan(0);
    expect(measured.openOrNonManifoldEdges).toBe(0);
    expect(measured.inconsistentEdges).toBe(0);
    expect(measured.disconnectedVertexFans).toBe(0);
    expect(measured.connectedFaces).toBe(mesh.indices.length / 3);
    expect(measured.eulerCharacteristic).toBe(2);
    expect(measured.maxFaceTurn).toBeLessThanOrEqual(90.1);
    const authored = parameters as Record<string, number>;
    const dimensions = [authored.obbWidth ?? 4.2, authored.obbHeight ?? 4.2, authored.obbDepth ?? 4.2];
    for (let axis = 0; axis < 3; axis++) {
      expect(measured.min[axis]).toBeGreaterThanOrEqual(-dimensions[axis] / 2 - 1e-5);
      expect(measured.max[axis]).toBeLessThanOrEqual(dimensions[axis] / 2 + 1e-5);
    }
    expect(measured.min[1]).toBeCloseTo(-dimensions[1] / 2, 5);
    if (authored.bottomScale === 0) {
      const bottomVertices: number[] = [];
      for (let i = 0; i < mesh.positions.length; i += 3)
        if (Math.abs(mesh.positions[i + 1] + dimensions[1] / 2) < 1e-6) bottomVertices.push(i / 3);
      expect(bottomVertices).toHaveLength(1);
      const apex = bottomVertices[0];
      expect(mesh.positions[apex * 3]).toBe(0);
      expect(mesh.positions[apex * 3 + 2]).toBe(0);
      expect(mesh.surfaceRoles[apex]).toBe(0);
    }
  });

  it("labels tilted rough roof interiors independently of their surface slope", () => {
    const mesh = buildRock({
      topScale: 1,
      bottomScale: 0,
      topSlope: 31,
      topRoughness: 0.58,
      shoulderScale: 0.56,
      shoulderHeight: 0.23,
      obbWidth: 10,
      obbHeight: 16,
      obbDepth: 8
    });
    let roofVertices = 0,
      steepRoofVertices = 0;
    for (let vertex = 0; vertex < mesh.surfaceRoles.length; vertex++) {
      if (mesh.surfaceRoles[vertex] !== 1) continue;
      roofVertices++;
      expect(mesh.positions[vertex * 3 + 1]).toBeGreaterThan(-8);
      if (mesh.normals[vertex * 3 + 1] < Math.cos((30 * Math.PI) / 180)) steepRoofVertices++;
    }
    expect(roofVertices).toBeGreaterThan(0);
    expect(steepRoofVertices / roofVertices).toBeGreaterThan(0.1);
  });

  it("produces identical geometry for zero and 360 degree directions", () => {
    const zero = buildRock({ ...userShape, topDirection: 0 });
    const fullTurn = buildRock({ ...userShape, topDirection: 360 });
    expect(fullTurn.positions).toEqual(zero.positions);
    expect(fullTurn.indices).toEqual(zero.indices);
    expect(fullTurn.normals).toEqual(zero.normals);
  });

  it("rotates the actual roof slope from the X axis to the Z axis at 90 degrees", () => {
    const parameters = { seed: 4659, topScale: 1, bottomScale: 1, topRoughness: 0, topSlope: 9 };
    const zero = buildRock({ ...parameters, topDirection: 0 });
    const quarterTurn = buildRock({ ...parameters, topDirection: 90 });
    const xRise = (mesh: RockMesh) => roofHeight(mesh, 0.3, 0) - roofHeight(mesh, -0.3, 0);
    const zRise = (mesh: RockMesh) => roofHeight(mesh, 0, 0.3) - roofHeight(mesh, 0, -0.3);
    expect(xRise(zero)).toBeCloseTo(0.6 * Math.tan((9 * Math.PI) / 180), 5);
    expect(zRise(zero)).toBeCloseTo(0, 5);
    expect(xRise(quarterTurn)).toBeCloseTo(0, 5);
    expect(zRise(quarterTurn)).toBeCloseTo(0.6 * Math.tan((9 * Math.PI) / 180), 5);
  });

  it("ignores a legacy ridge value in saved parameters", () => {
    const current = buildRock(userShape);
    const legacy = buildRock({ ...userShape, ridge: 1 });
    expect(legacy.positions).toEqual(current.positions);
    expect(legacy.indices).toEqual(current.indices);
    expect(legacy.normals).toEqual(current.normals);
  });
});
