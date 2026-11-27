import { describe, expect, it } from "vitest";
import { buildBeveledBrickGeometry } from "../src/building/runtime/BeveledBrickGeometry";

describe("buildBeveledBrickGeometry", () => {
  it("builds a closed 44-triangle outward-wound chamfered unit brick in [-0.5, +0.5]^3", () => {
    const geom = buildBeveledBrickGeometry();
    expect(geom.indexCount).toBe(44 * 3);
    expect(geom.indices.length).toBe(132);
    expect(geom.positions.length).toBe(geom.vertexCount * 3);
    expect(geom.normals.length).toBe(geom.vertexCount * 3);
    expect(geom.isBevel.length).toBe(geom.vertexCount);

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    let flatVerts = 0;
    let bevelVerts = 0;

    for (let i = 0; i < geom.vertexCount; i++) {
      const px = geom.positions[i * 3]!;
      const py = geom.positions[i * 3 + 1]!;
      const pz = geom.positions[i * 3 + 2]!;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      minZ = Math.min(minZ, pz);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
      maxZ = Math.max(maxZ, pz);

      const nx = geom.normals[i * 3]!;
      const ny = geom.normals[i * 3 + 1]!;
      const nz = geom.normals[i * 3 + 2]!;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      // Outward normal agrees with vertex direction from origin
      expect(px * nx + py * ny + pz * nz).toBeGreaterThan(0);

      if (geom.isBevel[i]! > 0.5) bevelVerts++;
      else flatVerts++;
    }

    expect(minX).toBeCloseTo(-0.5, 5);
    expect(minY).toBeCloseTo(-0.5, 5);
    expect(minZ).toBeCloseTo(-0.5, 5);
    expect(maxX).toBeCloseTo(0.5, 5);
    expect(maxY).toBeCloseTo(0.5, 5);
    expect(maxZ).toBeCloseTo(0.5, 5);
    expect(flatVerts).toBe(24);
    expect(bevelVerts).toBe(72);

    // Every triangle must have strictly outward CCW winding matching its vertex normal.
    for (let t = 0; t < geom.indexCount; t += 3) {
      const i0 = geom.indices[t]!;
      const i1 = geom.indices[t + 1]!;
      const i2 = geom.indices[t + 2]!;
      const ax = geom.positions[i1 * 3]! - geom.positions[i0 * 3]!;
      const ay = geom.positions[i1 * 3 + 1]! - geom.positions[i0 * 3 + 1]!;
      const az = geom.positions[i1 * 3 + 2]! - geom.positions[i0 * 3 + 2]!;
      const bx = geom.positions[i2 * 3]! - geom.positions[i0 * 3]!;
      const by = geom.positions[i2 * 3 + 1]! - geom.positions[i0 * 3 + 1]!;
      const bz = geom.positions[i2 * 3 + 2]! - geom.positions[i0 * 3 + 2]!;
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      const dot = cx * geom.normals[i0 * 3]! + cy * geom.normals[i0 * 3 + 1]! + cz * geom.normals[i0 * 3 + 2]!;
      expect(dot).toBeGreaterThan(1e-6);
    }
  });
});
