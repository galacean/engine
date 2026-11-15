import { describe, expect, it, vi } from "vitest";
import { PlanningNavigationSurface } from "@galacean/engine-world-planning/spatial/runtime/PlanningNavigationSurface";
import { PlanningAnimalHabitat } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHabitat";
import { RiverNetworkQueryService } from "@galacean/engine-water/water/runtime/river/RiverQueryService";
import { RIVER_QUERY_SAMPLE_COMPONENT as C } from "@galacean/engine-water/water/compiler/river/constants";

vi.mock("@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes", () => ({ planningWhiteboxes: () => [] }));
const plan = { spawn: { x: 0, z: 0 }, parameters: { width: 1024 }, waters: [], bridges: [], roadApproaches: [] } as any;

describe("shared navigation support", () => {
  it("retains exact snapshot heights across updates but refreshes moving water", () => {
    let level = 2;
    const height = vi.fn((x: number) => x + 0.123456789012345);
    const water = {
      sampleSurface: vi.fn((x: number, z: number, out: any) => {
        out.surfacePosition.set(x, level, z);
        out.waterDepth = 1;
        return true;
      })
    };
    const nav = new PlanningNavigationSurface(plan, height, water as any, undefined, true);
    const result = { height: undefined, waterHeight: undefined } as {
      height: number | undefined;
      waterHeight: number | undefined;
    };
    nav.beginAnimalUpdate();
    nav.sampleAnimalSupport(1, 3, result);
    nav.sampleAnimalSupport(1, 3, result);
    nav.endAnimalUpdate();
    expect(height).toHaveBeenCalledTimes(1);
    expect(water.sampleSurface).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ height: 1.123456789012345, waterHeight: 2 });
    level = 4;
    nav.beginAnimalUpdate();
    nav.sampleAnimalSupport(1, 3, result);
    nav.endAnimalUpdate();
    expect(height).toHaveBeenCalledTimes(1);
    expect(water.sampleSurface).toHaveBeenCalledTimes(2);
    expect(result.waterHeight).toBe(4);
    nav.beginAnimalUpdate();
    expect(nav.sampleHeightInterpolated(1 + 1e-10, 3)).toBe(height(1 + 1e-10));
    expect(nav.sampleHeightInterpolated(1, 3)).toBe(1.123456789012345);
    nav.endAnimalUpdate();
  });

  it("invalidates a reused source immediately and leaves mutable providers frame-scoped", () => {
    let level = 1;
    const water = { sampleSurface: () => false } as any;
    const nav = new PlanningNavigationSurface(plan, () => level, water, undefined, true);
    nav.beginAnimalUpdate();
    expect(nav.sampleHeightInterpolated(2, 3)).toBe(1);
    level = 5;
    nav.invalidateAnimalSupport();
    expect(nav.sampleHeightInterpolated(2, 3)).toBe(5);
    nav.endAnimalUpdate();
    const mutable = new PlanningNavigationSurface(plan, () => level, water);
    mutable.beginAnimalUpdate();
    expect(mutable.sampleHeightInterpolated(2, 3)).toBe(5);
    mutable.endAnimalUpdate();
    level = 9;
    mutable.beginAnimalUpdate();
    expect(mutable.sampleHeightInterpolated(2, 3)).toBe(9);
    mutable.endAnimalUpdate();
  });
});

function habitat() {
  return new PlanningAnimalHabitat(
    plan,
    { sampleHeightInterpolated: () => 0, sampleContactIsWater: () => false },
    { spawnRadius: 1024, roamRadius: 1024 }
  );
}
function solid(id: number, x: number, z: number, radius = 1) {
  return {
    id,
    x,
    z,
    cos: 1,
    sin: 0,
    halfX: radius,
    halfZ: radius,
    bottom: 0,
    top: 10,
    seen: 0,
    minX: x - radius,
    maxX: x + radius,
    minZ: z - radius,
    maxZ: z + radius
  };
}
describe("shared obstacle candidates", () => {
  it("shares coarse candidates while rechecking exact corridors, sizes and heights", () => {
    const h = habitat() as any;
    h.solids.add(solid(1, 20, 2));
    expect(h.firstSolid([0, 0], [70, 0], 0, 0, 1)).toBeUndefined();
    expect(h.firstSolid([0, 0], [70, 0], 1.5, 0, 1)?.id).toBe(1);
    expect(h.firstSolid([0, 0], [70, 0], 1.5, 20, 21)).toBeUndefined();
    expect(h.firstSolid([0, 1.1], [70, 1.1], 0, 0, 1)?.id).toBe(1);
  });

  it("preserves first-discovery tie order and invalidates empty results when solids change", () => {
    const h = habitat() as any;
    expect(h.firstSolid([0, 0], [100, 0], 0, 0, 1)).toBeUndefined();
    h.solids.add(solid(7, 20, 0, 40));
    h.solids.add(solid(8, 20, 0, 40));
    expect(h.firstSolid([0, 0], [100, 0], 0, 0, 1)?.id).toBe(7);
    expect(h.firstSolid([0, 0], [100, 0], 0, 0, 1)?.id).toBe(7);
    expect((habitat() as any).firstSolid([0, 0], [100, 0], 0, 0, 1)).toBeUndefined();
  });

  it("matches uncached exact obstacle checks against the original grid scan across different query bounds", () => {
    const h = habitat() as any;
    for (let i = 0; i < 50; i++) h.solids.add(solid(i, (i * 37) % 1000, (i * 61) % 1000, 4));
    for (let i = 0; i < 400; i++) {
      const a = [(i * 19) % 900, (i * 17) % 900],
        b = [(i * 41) % 1000, (i * 13) % 1000];
      const first = h.firstSolid(a, b, i % 4, 0, 2)?.id;
      expect(h.firstSolid(a, b, i % 4, 0, 2)?.id).toBe(first);
      const sharedQuery = h.solids.some;
      h.solids.some = function (bounds: any, predicate: (item: any) => boolean) {
        const seen = new Set();
        for (let x = Math.floor(bounds.minX / 32); x <= Math.floor(bounds.maxX / 32); x++) {
          for (let z = Math.floor(bounds.minZ / 32); z <= Math.floor(bounds.maxZ / 32); z++) {
            for (const item of this.bins.get(`${x}:${z}`) ?? []) {
              if (seen.has(item)) continue;
              seen.add(item);
              if (
                item.minX > bounds.maxX ||
                item.maxX < bounds.minX ||
                item.minZ > bounds.maxZ ||
                item.maxZ < bounds.minZ
              )
                continue;
              if (predicate(item)) return true;
            }
          }
        }
        return false;
      };
      expect(h.firstSolid(a, b, i % 4, 0, 2)?.id).toBe(first);
      h.solids.some = sharedQuery;
    }
    for (let i = 0; i < 300; i++) h.firstSolid([i * 32, 0], [i * 32 + 64, 0], 0, 0, 1);
    expect(h.solids.rows.reduce((n: number, row: any) => n + row.cells.length, 0)).toBe(h.solids.bins.size);
  });
});

// Keep the real geometry/normal/flow interpolation; control only the time-dependent wave field.
vi.mock("@galacean/engine-water/water/compiler/river/RiverSurfaceMotion", async (original) => ({
  ...(await original<any>()),
  evaluateRiverSurfaceMotion: (_data: unknown, _coordinates: unknown, time: number, out: any) => {
    out.height = time * 0.25;
    out.verticalVelocity = 0.25;
    out.acrossDerivative = time * 0.01;
    out.downstreamDerivative = time * -0.02;
  }
}));

function river(height = 0) {
  const indices = new Uint32Array([0, 1, 2, 1, 3, 2]);
  const geometry = {
    positions: [
      [-5, height, 0],
      [5, height, 0],
      [-5, height, 10],
      [5, height, 10]
    ],
    indices: { at: (i: number) => indices[i], borrowTypedArray: () => indices },
    drawStart: 0,
    drawCount: 6,
    tangents: Array.from({ length: 4 }, () => [1, 0, 0]),
    normals: Array.from({ length: 4 }, () => [0, 1, 0]),
    uv1s: Array.from({ length: 4 }, () => [2, 0]),
    uv2s: Array.from({ length: 4 }, () => [0, 0]),
    uv3s: Array.from({ length: 4 }, () => [5, 0])
  };
  const samples = new Float32Array(20);
  samples[C.width] = samples[10 + C.width] = 10;
  samples[C.depth] = samples[10 + C.depth] = 2;
  samples[10 + C.z] = 10;
  return Object.assign(Object.create(RiverNetworkQueryService.prototype), {
    _primitiveSourceIndices: [0],
    _primitiveLocalIndices: [0],
    _reachSamples: [samples],
    _reachSampleStrides: [10],
    _data: { reaches: [{ id: "river", artifact: { surfaceGeometry: geometry, querySource: { sampleCount: 2 } } }] },
    _geometryTriangleScratch: {},
    _motionCoordinates: {},
    _motionScratch: {},
    _writeResult(
      out: any,
      _kind: any,
      _index: any,
      _id: any,
      bank: number,
      surfaceHeight: number,
      velocity: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      flowX: number,
      flowY: number,
      flowZ: number,
      nx: number,
      ny: number,
      nz: number
    ) {
      Object.assign(out, {
        bank,
        height: surfaceHeight,
        velocity,
        depth,
        x,
        y,
        z,
        flow: [flowX, flowY, flowZ],
        normal: [nx, ny, nz]
      });
    }
  }) as any;
}
function riverSample(q: any, x: number, time?: number) {
  q._selectedGeometryTriangle = false;
  const out = {};
  q._sampleReachSpan(0, x, 7, 4.123456789, -Infinity, out, time);
  return out as any;
}
describe("shared river vertex facts", () => {
  it("retains exact interpolation while reevaluating moving surfaces", () => {
    const q = river(1);
    const before = riverSample(q, 0.123456789);
    expect(before.height).toBe(1);
    expect(before.normal).toEqual([0, 1, 0]);
    expect(before.flow).toEqual([2, 0, 0]);
    expect(riverSample(q, 0.123456789)).toEqual(before);
    const animated = riverSample(q, 0.123456789, 9);
    expect(animated.height).toBeCloseTo(3.25, 14);
    expect(animated.velocity).toBe(0.25);
    expect(animated.normal).not.toEqual(before.normal);
    q._vertexSampleCache = undefined;
    expect(riverSample(q, 0.123456789, 9)).toEqual(animated);
    expect(riverSample(q, 0.123456789)).toEqual(before);
    expect(riverSample(q, 0.123456789 + 1e-10).bank).not.toBe(before.bank);
  });

  it("does not reuse facts from edited geometry and keeps bounded storage", () => {
    const before = river(1),
      after = river(3);
    const original = riverSample(before, -1);
    expect(riverSample(after, 1).height).toBe(3);
    const geometry = after._data.reaches[0].artifact.surfaceGeometry;
    geometry.tangents[0] = [0, 0, 1];
    geometry.normals[0] = [1, 1, 0];
    before._vertexSampleCache.sample(geometry, 0);
    const cache = before._vertexSampleCache;
    expect(cache.values.byteLength + cache.indices.byteLength).toBe(69632);
    expect(cache.geometries).toHaveLength(1024);
    expect(riverSample(before, -1)).toEqual(original);
  });
});
