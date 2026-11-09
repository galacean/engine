import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  interpolateGridTriangle,
  sampleFloat32GridTriangle
} from "@galacean/engine-terrain/geometry/GridInterpolation";
import {
  cellularAdjacency,
  decodeCellularModule,
  type CellularModule
} from "@galacean/engine-terrain/rock-formation/CellularModule";
import {
  formationHeightfield,
  generateRockFormation
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import {
  rockGroundHeight,
  sampleRockGround
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Ground";
import { sampleRockField } from "@galacean/engine-terrain/rock-formation/AscentMask";
import { constrainRockGroundContact } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GroundContact";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import type {
  RockFormationJob,
  RockFormationMesh,
  RockGround,
  RockHeightMode,
  RockSurfaceMode
} from "@galacean/engine-terrain/rock-formation/types";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";

let module: CellularModule;
beforeAll(() => {
  const bytes = readFileSync(
    new URL("../../../packages/terrain/src/rock-formation/assets/asymmetric.glb", import.meta.url)
  );
  module = decodeCellularModule(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
});

const settings = () => readRockFormationSettings({ entities: {} } as PlanningDocument);
const surfaces: RockSurfaceMode[] = ["cellular-curvature", "vertex-slabs"];
const heights: RockHeightMode[] = ["perlin-ascent", "random-ascent"];
type Terrain = "flat" | "inclined" | "trough";

function fixture(terrain: Terrain, heightMode: RockHeightMode, scale = 1): RockFormationJob {
  const columns = 21;
  const ground: RockGround = {
    minX: -40 * scale,
    minZ: -40 * scale,
    spacingX: 4 * scale,
    spacingZ: 4 * scale,
    columns,
    rows: columns,
    heights: Float32Array.from({ length: columns * columns }, (_, i) => {
      const x = -40 + (i % columns) * 4;
      const z = -40 + Math.floor(i / columns) * 4;
      const y =
        terrain === "flat"
          ? 0
          : terrain === "inclined"
            ? 0.5 * x + 0.2 * z
            : -2 * Math.exp(-((x + 17) ** 2 + (z + 15) ** 2) / 14);
      return y * scale;
    })
  };
  return {
    id: "ground-contact",
    seed: 17,
    origin: [0, 0, 0],
    guides: [
      {
        id: "a",
        ownerId: "rock:obb:a",
        heightMode,
        center: [0, 18 * scale, 0],
        size: [48 * scale, 36 * scale, 40 * scale],
        axes: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ]
      }
    ],
    domain: { minX: -32 * scale, minZ: -28 * scale, width: 64 * scale, depth: 56 * scale, resolution: 65 },
    ground
  };
}

/** Read the rendered fixed-grid triangles independently of the rock ground adapter. */
function terrainHeight(ground: RockGround, x: number, z: number): number {
  return sampleFloat32GridTriangle(
    {
      origin: [ground.minX, ground.minZ],
      spacing: ground.spacingX,
      spacingZ: ground.spacingZ,
      columns: ground.columns,
      rows: ground.rows
    },
    x,
    z,
    (column, row) => ground.heights[column + row * ground.columns]
  );
}

function boundaryEdges(indices: Uint32Array): [number, number][] {
  const edges = new Map<string, { count: number; vertices: [number, number] }>();
  for (let face = 0; face < indices.length; face += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const a = indices[face + corner];
      const b = indices[face + ((corner + 1) % 3)];
      const key = a < b ? `${a}/${b}` : `${b}/${a}`;
      const existing = edges.get(key);
      if (existing) existing.count++;
      else edges.set(key, { count: 1, vertices: [a, b] });
    }
  }
  expect([...edges.values()].every((edge) => edge.count <= 2)).toBe(true);
  return [...edges.values()].filter((edge) => edge.count === 1).map((edge) => edge.vertices);
}

function expectBuriedEdges(positions: Float32Array, indices: Uint32Array, ground: RockGround): void {
  const edges = boundaryEdges(indices);
  expect(edges.length).toBeGreaterThan(0);
  let maximumClearance = -Infinity;
  let worstPoint: number[] = [];
  for (const [a, b] of edges) {
    const ai = a * 3;
    const bi = b * 3;
    const length = Math.hypot(positions[ai] - positions[bi], positions[ai + 2] - positions[bi + 2]);
    // Endpoints alone miss a straight rock edge bridging a terrain trough.
    const intervals = Math.max(32, Math.ceil(length / (Math.min(ground.spacingX, ground.spacingZ) / 4)));
    for (let i = 0; i <= intervals; i++) {
      const t = i / intervals;
      const x = positions[ai] * (1 - t) + positions[bi] * t;
      const y = positions[ai + 1] * (1 - t) + positions[bi + 1] * t;
      const z = positions[ai + 2] * (1 - t) + positions[bi + 2] * t;
      const clearance = y - terrainHeight(ground, x, z);
      if (clearance > maximumClearance) {
        maximumClearance = clearance;
        worstPoint = [a, b, t, x, y, z];
      }
    }
  }
  expect(maximumClearance, `Exposed boundary [a,b,t,x,y,z]: ${worstPoint.join(", ")}`).toBeLessThanOrEqual(-0.049);
}

function expectBuriedPerimeter(formation: RockFormationMesh, ground: RockGround): void {
  const { positions, indices } = formation.mesh;
  expectBuriedEdges(positions, indices, ground);
  expect(formation.owners).toHaveLength(indices.length / 3);
  expect(formation.grass!.coverage).toHaveLength(indices.length);
  expect(positions.every(Number.isFinite)).toBe(true);
  expect(formation.mesh.normals!.every(Number.isFinite)).toBe(true);
}

/** Estimate visible footprint from the final triangles, not the heightfield used to build them. */
function surfaceExposure(formation: RockFormationMesh, ground: RockGround) {
  const { positions, indices } = formation.mesh;
  const samples = [
    [1 / 3, 1 / 3, 1 / 3],
    [0.6, 0.2, 0.2],
    [0.2, 0.6, 0.2],
    [0.2, 0.2, 0.6]
  ];
  let area = 0,
    exposed = 0,
    peakY = -Infinity,
    peakClearance = -Infinity;
  for (let face = 0; face < indices.length; face += 3) {
    const corners = [indices[face] * 3, indices[face + 1] * 3, indices[face + 2] * 3];
    const [a, b, c] = corners;
    const projectedArea =
      Math.abs(
        (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]) -
          (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a])
      ) / 2;
    area += projectedArea;
    for (const barycentric of samples) {
      const point = [0, 1, 2].map((axis) =>
        corners.reduce((sum, vertex, i) => sum + positions[vertex + axis] * barycentric[i], 0)
      );
      if (point[1] - terrainHeight(ground, point[0], point[2]) > 0.05) exposed += projectedArea / samples.length;
    }
    for (const vertex of corners)
      if (positions[vertex + 1] > peakY) {
        peakY = positions[vertex + 1];
        peakClearance = peakY - terrainHeight(ground, positions[vertex], positions[vertex + 2]);
      }
  }
  return { area, exposedFraction: exposed / area, peakClearance };
}

describe("generated rock contact with native terrain", () => {
  it.each([
    [0.25, 0.75],
    [0.75, 0.25],
    [0.5, 0.5]
  ])("uses the rendered a--d triangle instead of bilinear height at (%s, %s)", (u, v) => {
    const ground: RockGround = {
      minX: 3,
      minZ: -7,
      spacingX: 4,
      spacingZ: 6,
      columns: 2,
      rows: 2,
      heights: new Float32Array([0, 4, 4, 0])
    };
    const expected = interpolateGridTriangle(0, 4, 4, 0, u, v);
    const bilinear = 4 * u * (1 - v) + 4 * (1 - u) * v;
    expect(expected).not.toBeCloseTo(bilinear, 6);
    expect(sampleRockGround(ground, 3 + u * 4, -7 + v * 6)).toBeCloseTo(expected, 6);
  });

  for (const terrain of ["flat", "inclined", "trough"] as const) {
    for (const heightMode of heights) {
      it.each(surfaces)(`buries the final %s perimeter on ${terrain} terrain using ${heightMode}`, (surfaceMode) => {
        const configuration = settings();
        expect(configuration.curvature.cellSize).toBe(24);
        const job = fixture(terrain, heightMode);
        const snapshot = structuredClone(job);
        const result = generateRockFormation(job, { ...configuration, surfaceMode }, module);
        expectBuriedPerimeter(result, job.ground);
        expect(job).toEqual(snapshot);
      });
    }
  }

  for (const heightMode of heights) {
    it.each(surfaces)(`keeps five world centimetres of burial on small %s rocks using ${heightMode}`, (surfaceMode) => {
      const job = fixture("trough", heightMode, 0.02);
      expect(Math.min(job.guides[0].size[0], job.guides[0].size[2])).toBeLessThan(settings().curvature.cellSize);
      const result = generateRockFormation(job, { ...settings(), surfaceMode }, module);
      expectBuriedPerimeter(result, job.ground);
    });
  }

  for (const heightMode of heights) {
    it.each(surfaces)(
      `allows uphill burial of a low %s formation without inflating its crest using ${heightMode}`,
      (surfaceMode) => {
        const job = fixture("flat", heightMode);
        const guide = job.guides[0];
        guide.size[1] = 6;
        guide.center[1] = 3;
        guide.slopeMode = "manual";
        guide.slopeRate = 2;
        guide.slopeVariation = 0;
        guide.heightVariation = 0;
        // Published placement uses the lowest footprint height; this slope rises
        // 44.4 m across the OBB while its authored body is only 6 m high.
        job.ground.heights = job.ground.heights.map((_, i) => {
          const x = job.ground.minX + (i % job.ground.columns) * job.ground.spacingX;
          const z = job.ground.minZ + Math.floor(i / job.ground.columns) * job.ground.spacingZ;
          return 0.8 * (x + 24) + 0.15 * (z + 20) + 0.05;
        });
        const snapshot = structuredClone(job);
        const result = generateRockFormation(job, { ...settings(), surfaceMode }, module);
        const exposure = surfaceExposure(result, job.ground);
        expect(exposure.area).toBeGreaterThan(100);
        expect(exposure.exposedFraction, JSON.stringify(exposure)).toBeLessThan(0.5);
        // Both the crest and uphill contact points stay inside the height budget.
        const rest = result.mesh.restPositions!;
        for (let vertex = 0; vertex < rest.length; vertex += 3) {
          expect(rest[vertex + 1]).toBeLessThanOrEqual(guide.size[1] + 1e-4);
        }
        expectBuriedPerimeter(result, job.ground);
        expect(job).toEqual(snapshot);
      }
    );
  }

  it.each(surfaces)(
    "preserves the flat-ground guide for %s at the existing five-centimetre burial datum",
    (surfaceMode) => {
      const job = fixture("flat", "random-ascent");
      job.ground.heights.fill(0.05);
      const configuration = { ...settings(), surfaceMode };
      const field = formationHeightfield(job, configuration);
      const result = generateRockFormation(job, configuration, module);
      const positions = result.mesh.restPositions!;
      let maximumError = 0;
      for (let vertex = 0; vertex < positions.length; vertex += 3) {
        const expected = sampleRockField(field.heights, job.domain, positions[vertex], positions[vertex + 2]);
        maximumError = Math.max(maximumError, Math.abs(positions[vertex + 1] - expected));
      }
      expect(maximumError).toBeLessThan(2e-6);
      expectBuriedPerimeter(result, job.ground);
    }
  );

  it.each(surfaces)("ignores an unrelated summit in the padded ground crop for %s", (surfaceMode) => {
    const job = fixture("flat", "random-ascent");
    const configuration = { ...settings(), surfaceMode };
    const flat = generateRockFormation(job, configuration, module);
    job.ground.heights[0] = 1000; // (-40, -40), beyond both the support and its generated domain.
    const distantSummit = generateRockFormation(job, configuration, module);
    expect(distantSummit.mesh.positions).toEqual(flat.mesh.positions);
    expect(distantSummit.mesh.normals).toEqual(flat.mesh.normals);
    expect(distantSummit.mesh.indices).toEqual(flat.mesh.indices);
  });

  it.each(heights)("buries a mixed-surface union without losing per-OBB face ownership for %s", (heightMode) => {
    const job = fixture("trough", heightMode);
    job.guides[0].surfaceMode = "vertex-slabs";
    job.guides[0].center[0] = -8;
    job.guides[0].size[0] = 30;
    job.guides.push({
      ...structuredClone(job.guides[0]),
      id: "b",
      ownerId: "rock:obb:b",
      surfaceMode: "cellular-curvature",
      center: [8, 18, 0]
    });
    const result = generateRockFormation(job, settings(), module);
    expect(new Set(result.triangleSurfaces)).toEqual(new Set([0, 1]));
    expect(new Set(result.owners)).toEqual(new Set(["rock:obb:a", "rock:obb:b"]));
    result.owners.forEach((owner, triangle) => {
      expect(result.triangleSurfaces![triangle]).toBe(owner === "rock:obb:a" ? 0 : 1);
    });
    expectBuriedPerimeter(result, job.ground);
  });
});

describe("local terrain fitting preserves the authored crest", () => {
  it.each([-20, 0, 3, 6, 20, 60])("does not raise a six-metre crest when terrain is %s metres", (terrain) => {
    expect(rockGroundHeight(6, terrain, 0, 6)).toBe(6);
    expect(rockGroundHeight(0, terrain, 0, 6)).toBeCloseTo(Math.min(6, terrain - 0.05));
    for (let step = 0; step <= 100; step++) {
      const y = rockGroundHeight(step * 0.06, terrain, 0, 6);
      expect(y).toBeLessThanOrEqual(6);
      if (terrain > 6) expect(y).toBeLessThan(terrain);
    }
  });
});

describe("retained rock boundary constraints", () => {
  it("closes an edge bridging a terrain trough even with buried endpoints and an inactive neighboring face", () => {
    const ground: RockGround = {
      minX: 0,
      minZ: 0,
      spacingX: 1,
      spacingZ: 1,
      columns: 5,
      rows: 2,
      heights: new Float32Array([0, -1, -2, -1, 0, 0, -1, -2, -1, 0])
    };
    const positions = new Float32Array([0, -0.1, 0.25, 4, -0.1, 0.25, 0, -0.1, 0.75, 2, 42, -1]);
    // The second face exists in the baked topology but will be omitted from rendering.
    const indices = new Uint32Array([0, 2, 1, 0, 1, 3]);
    const neighbors = cellularAdjacency(indices, positions.length / 3).neighbors;
    const active = new Float32Array([1, 0]);
    expect(positions[1] - terrainHeight(ground, 0, 0.25)).toBeLessThan(-0.09);
    expect(positions[4] - terrainHeight(ground, 4, 0.25)).toBeLessThan(-0.09);
    expect((positions[1] + positions[4]) / 2 - terrainHeight(ground, 2, 0.25)).toBeGreaterThan(1.8);
    expect(constrainRockGroundContact(positions, indices, neighbors, active, ground)).toBeGreaterThan(0);
    expectBuriedEdges(positions, indices.subarray(0, 3), ground);
    expect(Array.from(positions.subarray(9))).toEqual([2, 42, -1]);
    expect(active).toEqual(new Float32Array([1, 0]));
  });

  it("closes a one-cell saddle gap at the terrain diagonal without a grid-line crossing", () => {
    const ground: RockGround = {
      minX: 0,
      minZ: 0,
      spacingX: 1,
      spacingZ: 1,
      columns: 2,
      rows: 2,
      heights: new Float32Array([0, 4, 4, 0])
    };
    const positions = new Float32Array([1, 3.9, 0, 0, 3.9, 1, 0, -0.1, 0]);
    const indices = new Uint32Array([0, 2, 1]);
    const neighbors = cellularAdjacency(indices, positions.length / 3).neighbors;
    const alreadyBuriedCorner = positions.slice(6);
    expect(positions[1] - terrainHeight(ground, 1, 0)).toBeLessThan(-0.09);
    expect(positions[4] - terrainHeight(ground, 0, 1)).toBeLessThan(-0.09);
    expect((positions[1] + positions[4]) / 2 - terrainHeight(ground, 0.5, 0.5)).toBeGreaterThan(3.8);
    expect(constrainRockGroundContact(positions, indices, neighbors, new Float32Array([1]), ground)).toBe(2);
    expectBuriedEdges(positions, indices, ground);
    expect(positions.slice(6)).toEqual(alreadyBuriedCorner);
  });

  it("preserves a fan interior, X/Z and connectivity and does no further work once its perimeter is buried", () => {
    const ground: RockGround = {
      minX: 0,
      minZ: 0,
      spacingX: 2,
      spacingZ: 2,
      columns: 2,
      rows: 2,
      heights: new Float32Array(4)
    };
    const positions = new Float32Array([0, 0.5, 0, 2, 0.8, 0, 2, 0.2, 2, 0, 0.3, 2, 1, 5, 1]);
    const indices = new Uint32Array([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0]);
    const neighbors = cellularAdjacency(indices, positions.length / 3).neighbors;
    const active = new Float32Array(4).fill(1);
    const original = positions.slice();
    const connectivity = indices.slice();
    const adjacency = neighbors.slice();
    expect(constrainRockGroundContact(positions, indices, neighbors, active, ground)).toBe(4);
    expectBuriedEdges(positions, indices, ground);
    expect(positions.slice(12)).toEqual(original.slice(12));
    expect(positions.filter((_, i) => i % 3 !== 1)).toEqual(original.filter((_, i) => i % 3 !== 1));
    expect(indices).toEqual(connectivity);
    expect(neighbors).toEqual(adjacency);
    expect(active).toEqual(new Float32Array(4).fill(1));
    const accepted = positions.slice();
    expect(constrainRockGroundContact(positions, indices, neighbors, active, ground)).toBe(0);
    expect(positions).toEqual(accepted);
  });
});
