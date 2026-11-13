import { describe, expect, it } from "vitest";
import { buildRockGrassSurface, compileRockGrassPatch } from "../../../packages/terrain/src/rock-formation/GrassSurface.ts";
import type { RockFormationMesh } from "../../../packages/terrain/src/rock-formation/types.ts";

/** A meadow meeting a 85-degree face along canonical vertices 0 and 1. */
function foldedSurface(bothSteep = false): RockFormationMesh {
  const rise = 4 * Math.tan((85 * Math.PI) / 180);
  return {
    id: "coverage-fold",
    origin: [0, 0, 0],
    owners: ["left", "right"],
    mesh: {
      positions: new Float32Array([0, 0, 0, 0, 0, 4, -4, bothSteep ? rise : 0, 0, 4, rise, 0]),
      indices: new Uint32Array([0, 2, 1, 0, 1, 3]),
      // An upward guide deliberately isolates the final-surface slope decision.
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])
    },
    stats: { bodies: 0, vertices: 0 }
  };
}

function cover(formation: RockFormationMesh) {
  formation.grass = buildRockGrassSurface(formation, formation.mesh.normals!);
  return formation.grass;
}

function coverageByVertex(formation: RockFormationMesh): Map<number, number> {
  const result = new Map<number, number>();
  formation.mesh.indices.forEach((vertex, corner) => {
    const value = formation.grass!.coverage[corner];
    if (result.has(vertex)) expect(value).toBe(result.get(vertex));
    result.set(vertex, value);
  });
  return result;
}

describe("continuous rock grass material coverage", () => {
  it("blends through shared edges instead of assigning a different mask to each triangle", () => {
    const formation = foldedSurface(),
      grass = cover(formation);
    const values = coverageByVertex(formation);
    expect(values.get(0)).toBeGreaterThan(0);
    expect(values.get(0)).toBeLessThan(1);
    expect(values.get(1)).toBeGreaterThan(0);
    expect(values.get(1)).toBeLessThan(1);
    expect(values.get(2)).toBe(1);
    expect(values.get(3)).toBe(0);
    // Compare both rendered sides of the shared edge at multiple barycentric points.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const left = (1 - t) * grass.coverage[0] + t * grass.coverage[2];
      const right = (1 - t) * grass.coverage[3] + t * grass.coverage[4];
      expect(left).toBe(right);
    }
  });

  it("keeps actual grass roots off a steep face even when its material edge is blended", () => {
    const formation = foldedSurface(),
      grass = cover(formation);
    expect(grass.coverage[3]).toBeGreaterThan(0);
    expect(grass.normals[4]).toBeLessThan(Math.SQRT1_2);
    expect(grass.areas[1]).toBe(0);
    expect(grass.patches.every((patch) => [...patch.triangles].every((triangle) => triangle === 0))).toBe(true);
    const metrics = { candidates: 0, accepted: 0, unsupported: 0, excluded: 0 };
    const roots: number[][] = [];
    for (const patch of grass.patches) {
      for (const chunk of compileRockGrassPatch(
        formation,
        patch,
        [0, 0, 0],
        {
          density: 20,
          minimumScale: 0.2,
          maximumScale: 0.2,
          rootRadius: 0,
          allowed: () => true
        },
        metrics
      )) {
        if (chunk) for (let i = 0; i < chunk.length; i += 13) roots.push([...chunk.subarray(i, i + 13)]);
      }
    }
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.every((root) => root[0] <= 0 && Math.abs(root[1] - 0.015) < 1e-6)).toBe(true);
    expect(roots.every((root) => root[10] === 0 && root[11] === 1 && root[12] === 0)).toBe(true);
  });

  it("does not turn opposed steep faces into a false upward-facing meadow", () => {
    const formation = foldedSurface(true),
      grass = cover(formation);
    // Their horizontal normal components cancel at the seam, but both faces remain steep.
    expect(grass.normals[0] * grass.normals[3]).toBeLessThan(0);
    expect(grass.normals[1]).toBeLessThan(Math.SQRT1_2);
    expect(grass.normals[4]).toBeLessThan(Math.SQRT1_2);
    expect([...grass.coverage].every((value) => value === 0)).toBe(true);
    expect(grass.patches).toHaveLength(0);
  });

  it("keeps isolated walls and undersides bare and without root candidates", () => {
    for (const positions of [
      [0, 0, 0, 0, 0, 4, 0, 4, 0],
      [0, 0, 0, 4, 0, 0, 0, 0, 4]
    ]) {
      const formation = foldedSurface();
      formation.mesh.positions = new Float32Array(positions);
      formation.mesh.indices = new Uint32Array([0, 1, 2]);
      formation.mesh.normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
      formation.owners = ["unsupported"];
      const grass = cover(formation);
      expect([...grass.coverage]).toEqual([0, 0, 0]);
      expect(grass.patches).toHaveLength(0);
    }
  });

  it("preserves coverage under triangle reordering and a coplanar face split", () => {
    const original = foldedSurface();
    cover(original);
    const expected = coverageByVertex(original);
    const reordered = foldedSurface();
    reordered.mesh.indices = new Uint32Array([0, 1, 3, 0, 2, 1]);
    reordered.owners.reverse();
    cover(reordered);
    expect(coverageByVertex(reordered)).toEqual(expected);

    const split = foldedSurface(),
      p = split.mesh.positions;
    split.mesh.positions = new Float32Array([...p, (p[3] + p[9]) / 2, (p[4] + p[10]) / 2, (p[5] + p[11]) / 2]);
    split.mesh.normals = new Float32Array([...split.mesh.normals!, 0, 1, 0]);
    split.mesh.indices = new Uint32Array([0, 2, 1, 0, 1, 4, 0, 4, 3]);
    split.owners = ["left", "right", "right"];
    cover(split);
    const actual = coverageByVertex(split);
    for (const [vertex, value] of expected) expect(actual.get(vertex)).toBeCloseTo(value, 6);
  });

});
