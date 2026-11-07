import { describe, expect, it, vi } from "vitest";
import {
  buildRockGrassSurface,
  compileRockGrassPatch,
  ROCK_GRASS_UPLOAD_INSTANCES
} from "../../../packages/terrain/src/rock-formation/GrassSurface.ts";
import { RockGrassPatches } from "../../../packages/terrain/src/rock-formation/GrassPatches.ts";
import { rockFormationPlacements } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Placement.ts";
import { rockGrassExclusions } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/GrassExclusions.ts";
import { rockSurfaceAttributes } from "../../../packages/terrain/src/rock-formation/SurfaceAttributes.ts";
import { sharedRockTransitionCoverage } from "../../../packages/terrain/src/rock-formation/TransitionCoverage.ts";
import type { RockFormationMesh, V3 } from "../../../packages/terrain/src/rock-formation/types.ts";
import type { IslandPlan } from "../../../packages/world-planning/src/semantic-study/IslandPlanModel.ts";
import type { SeedWorldFields } from "../../../packages/world-planning/src/runtime/SeedWorldFields.ts";
import { generateRockFormation } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Generate.ts";
import { readRockFormationSettings } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Settings.ts";
import { NATURAL_VEGETATION_DEFAULTS } from "../../../packages/world-planning/src/planning-data/NaturalVegetationProfile.ts";
import { readSeedWorldGrassRootRadius } from "../../../packages/world-planning/src/runtime/SeedWorldRockSurfaceGrass.ts";
import { Matrix } from "@galacean/engine-math";

vi.hoisted(() => Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true }));

function plane(id = "a", y = 0, width = 8): RockFormationMesh {
  const mesh = {
    positions: new Float32Array([0, y, 0, width, y, 0, 0, y, 8, width, y, 8]),
    indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])
  };
  const formation: RockFormationMesh = {
    id,
    origin: [0, 0, 0],
    owners: [id, id],
    mesh,
    stats: { bodies: 0, vertices: 0, generationMs: 0 }
  };
  formation.grass = buildRockGrassSurface(formation, mesh.normals);
  return formation;
}
const sampling = { density: 15, minimumScale: 0.2, maximumScale: 0.4, allowed: () => true };
describe("shared rock shading coverage", () => {
  it("joins incident faces without changing grass sampling coverage", () => {
    const formation = plane();
    formation.grass!.coverage.set([1, 1, 1, 0, 0, 0]);
    const before = formation.grass!.coverage.slice();
    expect(Array.from(sharedRockTransitionCoverage(formation))).toEqual([1, 0.5, 0.5, 0]);
    expect(formation.grass!.coverage).toEqual(before);
  });

  it("weights unequal triangles by area and handles unsupported vertices", () => {
    const formation = plane();
    formation.mesh.positions[9] = 24;
    formation.grass!.coverage.set([1, 1, 1, 0, 0, 0]);
    expect(Array.from(sharedRockTransitionCoverage(formation))).toEqual([1, 0.25, 0.25, 0]);
    const degenerate = plane();
    degenerate.mesh.positions.fill(0);
    expect(Array.from(sharedRockTransitionCoverage(degenerate))).toEqual([0, 0, 0, 0]);
  });
});
const metrics = () => ({ candidates: 0, accepted: 0, unsupported: 0, excluded: 0 });
function compile(formation: RockFormationMesh, origin: V3 = [0, 0, 0], overrides = {}) {
  const chunks: Float32Array[] = [],
    counts = metrics();
  for (const patch of formation.grass!.patches)
    for (const chunk of compileRockGrassPatch(formation, patch, origin, { ...sampling, ...overrides }, counts))
      if (chunk) chunks.push(chunk);
  return {
    chunks,
    counts,
    records: chunks.flatMap((chunk) =>
      Array.from({ length: chunk.length / 13 }, (_, i) => Array.from(chunk.subarray(i * 13, i * 13 + 13)))
    )
  };
}

describe("generated rock surface grass", () => {
  it("finishes the blade fringe before bare stone without thinning meadow interiors", () => {
    const rock = plane();
    const dense = compile(rock).records;
    rock.grass!.coverage.fill(0.2);
    expect(compile(rock).records).toHaveLength(0);
    rock.grass!.coverage.fill(0.45);
    const fringe = compile(rock).records;
    expect(fringe.length).toBeGreaterThan(0);
    expect(Math.max(...fringe.map(r => r[5]))).toBeLessThan(Math.min(...dense.map(r => r[5])));
    rock.grass!.coverage.fill(1);
    expect(compile(rock).records).toEqual(dense);
  });
  it("matches grass roots to their projected substrate and metre-sized tiling", () => {
    const rock = plane(); rock.textureScale = 4;
    rock.grass!.coverage.set([0.2, 0.6, 1, 1, 0.6, 0.8]);
    const records = compile(rock).records;
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      const x = record[0] / 8, z = record[2] / 8;
      const expected = x + z <= 1 ? 0.2 * (1 - x - z) + 0.6 * z + x
        : (1 - z) + 0.6 * (1 - x) + 0.8 * (x + z - 1);
      expect(record).toHaveLength(13);
      expect(record[7]).toBeCloseTo(expected, 5);
      expect(record.slice(8, 10)).toEqual([4, 1]);
    }
  });
  it("measures the native asset's roots independently of tall overhanging leaves", () => {
    const source = {
      id: "grass",
      lods: [
        {
          renderer: {
            localMatrix: new Matrix(),
            mesh: {
              getPositions: () => [
                { x: -0.2, y: 0, z: 0 },
                { x: 0.2, y: 0, z: 0 },
                { x: 3, y: 4, z: 0 }
              ]
            }
          }
        }
      ]
    } as any;
    expect(readSeedWorldGrassRootRadius(source)).toBeCloseTo(0.2);
    expect(readSeedWorldGrassRootRadius(source)).toBeCloseTo(0.2);
  });
  it("separates grass coverage from rock activation and gives rendering the same corner mask", () => {
    const rock = plane();
    expect([...rock.grass!.coverage]).toEqual([1, 1, 1, 1, 1, 1]);
    const attributes = rockSurfaceAttributes(rock);
    expect(Array.from({ length: 6 }, (_, i) => attributes.data[i * attributes.stride + 9])).toEqual([
      ...rock.grass!.coverage
    ]);
    // Shading normals cannot erase the explicitly authored roof mask.
    const steepGuide = rock.mesh.normals!.map((_, i) => (i % 3 === 0 ? .9 : i % 3 === 1 ? .43589 : 0));
    const roof = buildRockGrassSurface(rock, steepGuide, new Float32Array(4).fill(1));
    expect([...roof.coverage]).toEqual([1,1,1,1,1,1]);
  });

  it("rejects walls and undersides using final geometric normals", () => {
    const rock = plane();
    rock.mesh.positions = new Float32Array([0, 0, 0, 8, 0, 0, 0, 8, 0, 8, 8, 0]);
    expect(buildRockGrassSurface(rock, rock.mesh.normals!).patches).toHaveLength(0);
    const underside = plane();
    underside.mesh.indices = new Uint32Array([0, 1, 2, 1, 3, 2]);
    expect(buildRockGrassSurface(underside, underside.mesh.normals!).patches).toHaveLength(0);
  });

  it("roots both stacked levels on the final mesh and preserves the actual displayed elevation", () => {
    const rock = plane(),
      upper = plane("a", 5);
    rock.mesh.positions = new Float32Array([...rock.mesh.positions, ...upper.mesh.positions]);
    rock.mesh.indices = new Uint32Array([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]);
    rock.mesh.normals = new Float32Array([...rock.mesh.normals!, ...upper.mesh.normals!]);
    rock.owners = ["a", "a", "a", "a"];
    rock.grass = buildRockGrassSurface(rock, rock.mesh.normals);
    const placements = rockFormationPlacements({ rocks: [{ groupId: "a", baseHeight: 12 }] } as any, [rock]);
    const result = compile(rock, placements[0].origin);
    expect(result.counts.accepted).toBeGreaterThan(100);
    expect(new Set(result.records.map((r) => Math.round(r[1] * 1000)))).toEqual(new Set([12015, 17015]));
    expect(result.records.every((r) => r[10] === 0 && r[11] === 1 && r[12] === 0)).toBe(true);
    expect(result.chunks.every((chunk) => chunk.length <= ROCK_GRASS_UPLOAD_INSTANCES * 13)).toBe(true);
  });

  it("requires a supported root footprint without reserving the whole blade's swept area", () => {
    expect(compile(plane("narrow", 0, 0.03), [0, 0, 0], { density: 200 }).counts.accepted).toBe(0);
    const result = compile(plane());
    expect(result.counts.unsupported).toBeGreaterThan(0);
    expect(result.records.some((r) => r[0] < 0.2)).toBe(true);
    expect(result.records.every((r) => r[0] >= 0.059 && r[0] <= 7.941)).toBe(true);
  });

  it("is deterministic, preserves roots through triangle reordering, and honors explicit zero density", () => {
    const a = plane(),
      b = plane();
    b.mesh.indices = new Uint32Array([1, 2, 3, 0, 2, 1]);
    b.grass = buildRockGrassSurface(b, b.mesh.normals!);
    const sorted = (rock: RockFormationMesh) =>
      compile(rock)
        .records.map((r) => r.join(","))
        .sort();
    expect(sorted(a)).toEqual(sorted(b));
    expect(compile(a).records).toEqual(compile(a).records);
    expect(compile(a, [0, 0, 0], { density: 0 }).records).toEqual([]);
  });

  it("applies roads, water and occupied building volumes at the root's height", () => {
    const plan = {
      buildings: [
        {
          outline: [
            { x: 1, z: 1 },
            { x: 2, z: 1 },
            { x: 2, z: 2 },
            { x: 1, z: 2 }
          ],
          baseHeight: 5,
          height: 2
        }
      ],
      routes: [
        {
          points: [
            { x: 0, z: 4 },
            { x: 8, z: 4 }
          ],
          width: 2
        }
      ],
      bridges: [],
      parameters: { seed: 1 }
    } as unknown as IslandPlan;
    const fields = {
      sizeMetres: 8,
      worldOrigin: [0, 0],
      heightResolution: 2,
      surfaceHeights: new Float32Array(4)
    } as unknown as SeedWorldFields;
    const allowed = rockGrassExclusions(plan, fields, (_x, y) => y < -1);
    expect(allowed(4, 0, 4)).toBe(false);
    expect(allowed(4, 5, 4)).toBe(true);
    expect(allowed(4, -2, 4)).toBe(false);
    expect(allowed(1.5, 5, 1.5)).toBe(false);
    expect(allowed(1.5, 10, 1.5)).toBe(true);
    const barePlan = {
      ...plan,
      naturalVegetation: { world: { grass: 0 }, regions: {}, settings: NATURAL_VEGETATION_DEFAULTS }
    };
    expect(rockGrassExclusions(barePlan, fields, () => false)(4, 5, 4)).toBe(0);
  });
});

function runtime() {
  let time = 0;
  const created: { key: string; data: Float32Array; visible: boolean; destroyed: boolean }[] = [];
  const manager = new RockGrassPatches({
    now: () => (time += 0.01),
    create: (data, key) => {
      const batch = { key, data, visible: false, destroyed: false };
      created.push(batch);
      return batch;
    },
    visible: (batch, visible) => {
      batch.visible = visible;
    },
    destroy: (batch) => {
      batch.destroyed = true;
    }
  });
  const tick = (config = sampling) => manager.update([4, 2, 4], 100, true, config);
  const settle = () => {
    for (let i = 0; i < 2000; i++) {
      tick();
      if (!manager.diagnostics.pendingPatches) return;
    }
    throw Error("Grass did not settle");
  };
  return { manager, created, tick, settle };
}

describe("incremental rock grass publication", () => {
  it("removes existing companion grass when publishing a bare surface while retaining neighboring rock grass", () => {
    const r = runtime(), companion = plane("companion"), main = plane("main");
    const placements = (formation: RockFormationMesh) => [
      { formation, origin: [0, 0, 0] as V3 }, { formation: main, origin: [10, 0, 0] as V3 }
    ];
    r.manager.prepare(placements(companion), () => true).commit();
    r.settle();
    const originalCompanion = r.created.filter(batch => batch.key.startsWith("companion/"));
    const originalMain = r.created.filter(batch => batch.key.startsWith("main/"));
    expect(originalCompanion.length).toBeGreaterThan(0);
    expect(originalMain.length).toBeGreaterThan(0);
    const { grass, ...bare } = companion;
    const frame = r.manager.prepare(placements(bare), () => true);
    expect(originalCompanion.every(batch => batch.visible)).toBe(true);
    frame.commit();
    expect(originalCompanion.every(batch => !batch.visible)).toBe(true);
    for (let i = 0; i <= originalCompanion.length; i++) r.tick();
    expect(originalCompanion.every(batch => batch.destroyed)).toBe(true);
    expect(originalMain.every(batch => batch.visible && !batch.destroyed)).toBe(true);
    expect(r.created).toHaveLength(originalCompanion.length + originalMain.length);
    r.manager.destroy();
  });

  it("hides resident grass without rebuilding it and releases it when the camera leaves", () => {
    const r = runtime(),
      rock = plane();
    r.manager.prepare([{ formation: rock, origin: [0, 0, 0] }], () => true).commit();
    r.settle();
    const count = r.created.length;
    r.manager.update([4, 2, 4], 100, false, sampling);
    expect(r.created.every((batch) => !batch.visible && !batch.destroyed)).toBe(true);
    r.tick();
    expect(r.created).toHaveLength(count);
    expect(r.created.every((batch) => batch.visible)).toBe(true);
    for (let i = 0; i < count + 1; i++) r.manager.update([1000, 2, 1000], 100, true, sampling);
    expect(r.created.every((batch) => batch.destroyed)).toBe(true);
    r.manager.destroy();
  });
  it("stages without work and replaces only the edited formation's batches", () => {
    const r = runtime(),
      a = plane("a"),
      b = plane("b");
    r.manager
      .prepare(
        [
          { formation: a, origin: [0, 0, 0] },
          { formation: b, origin: [10, 0, 0] }
        ],
        () => true
      )
      .commit();
    r.settle();
    const originalB = r.created.filter((batch) => batch.key.startsWith("b/"));
    const originalA = r.created.filter((batch) => batch.key.startsWith("a/"));
    expect(originalB.length).toBeGreaterThan(0);
    const before = r.created.length,
      changed = plane("a", 3);
    const frame = r.manager.prepare(
      [
        { formation: changed, origin: [0, 0, 0] },
        { formation: b, origin: [10, 0, 0] }
      ],
      () => true
    );
    expect(r.created).toHaveLength(before);
    expect(originalA.every((batch) => batch.visible)).toBe(true);
    expect(frame.metrics).toMatchObject({ grassFormationsChanged: 1, grassFormationsRetained: 1 });
    frame.commit();
    expect(originalA.every((batch) => !batch.visible)).toBe(true);
    r.settle();
    expect(r.created.filter((batch) => batch.key.startsWith("b/"))).toEqual(originalB);
    expect(originalB.every((batch) => batch.visible && !batch.destroyed)).toBe(true);
    r.manager.destroy();
    expect(r.created.every((batch) => batch.destroyed)).toBe(true);
  });

  it("discards/supersedes staged changes without touching resident neighbors or publishing stale queued roots", () => {
    const r = runtime(),
      a = plane();
    r.manager.prepare([{ formation: a, origin: [0, 0, 0] }], () => true).commit();
    r.tick();
    const next = () => r.manager.prepare([{ formation: plane("a", 4), origin: [0, 0, 0] }], () => true);
    const discarded = next();
    discarded.discard();
    expect(() => discarded.commit()).toThrow("Stale");
    const stale = next(),
      accepted = next();
    accepted.commit();
    expect(() => stale.commit()).toThrow("Stale");
    const count = r.created.length;
    r.settle();
    expect(r.created.slice(count).every((batch) => Math.abs(batch.data[1] - 4.015) < 1e-5)).toBe(true);
    r.manager.destroy();
  });

  it("bounds candidate work and GPU uploads even for dense and rejection-heavy patches", () => {
    const r = runtime(),
      rock = plane();
    const allowed = vi.fn(() => false);
    r.manager.prepare([{ formation: rock, origin: [0, 0, 0] }], allowed).commit();
    r.tick({ ...sampling, density: 100000 });
    expect(allowed.mock.calls.length).toBeLessThanOrEqual(1024);
    expect(r.manager.diagnostics.pendingPatches).toBeGreaterThan(0);
    expect(r.created).toHaveLength(0);
    r.manager.prepare([{ formation: plane("changed"), origin: [0, 0, 0] }], () => true).commit();
    for (let i = 0; i < 10; i++) {
      const before = r.created.length;
      r.tick({ ...sampling, density: 100000 });
      expect(r.created.length - before).toBeLessThanOrEqual(1);
    }
    expect(r.created.length).toBeGreaterThan(0);
    expect(r.created.every((batch) => batch.data.length <= ROCK_GRASS_UPLOAD_INSTANCES * 13)).toBe(true);
    r.manager.destroy();
  });

  it("isolates a failed grass upload and disposes completed resources exactly once", () => {
    const destroy = vi.fn(),
      manager = new RockGrassPatches({
        create: (_data, key) => {
          if (key.startsWith("a/")) throw Error("upload failed");
          return key;
        },
        visible: () => {},
        destroy
      });
    manager
      .prepare(
        [
          { formation: plane("a"), origin: [0, 0, 0] },
          { formation: plane("b"), origin: [0, 0, 0] }
        ],
        () => true
      )
      .commit();
    for (let i = 0; i < 300; i++) manager.update([4, 2, 4], 100, true, sampling);
    expect(manager.diagnostics.error).toContain("upload failed");
    expect(manager.diagnostics.formations.find((f) => f.id === "b")!.batches).toBeGreaterThan(0);
    manager.destroy();
    manager.destroy();
    expect(new Set(destroy.mock.calls.map(([key]) => key)).size).toBe(destroy.mock.calls.length);
  });

  it("measures resumable sampling on actual generated procedural rocks while retaining the neighboring grass", async () => {
    const settings = readRockFormationSettings({ entities: {} } as any);
    const job = {
      id: "a",
      seed: 17,
      origin: [80, 12, 65] as V3,
      guides: [
        {
          id: "a",
          ownerId: "a:obb:0",
          center: [0, 18, 0] as V3,
          size: [48, 36, 40] as V3,
          axes: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
          ] as [V3, V3, V3]
        }
      ],
    };
    const a = generateRockFormation(job, settings);
    expect(a.grass!.patches.length).toBeGreaterThan(0);
    expect(a.grass!.coverage.length).toBe(a.mesh.indices.length);
    const b = generateRockFormation({ ...job, id: "b", origin: [120, 12, 65] }, settings);
    const uploads: { key: string; data: Float32Array }[] = [];
    const manager = new RockGrassPatches({
      create: (data, key) => {
        const batch = { key, data: data.slice() };
        uploads.push(batch);
        return batch;
      },
      visible: () => {},
      destroy: () => {}
    });
    const times: number[] = [];
    let turns = 0;
    const settle = async () => {
      for (let i = 0; i < 20000; i++) {
        const before = performance.now(),
          count = uploads.length;
        manager.update([90, 30, 65], 100, true, sampling);
        times.push(performance.now() - before);
        expect(uploads.length - count).toBeLessThanOrEqual(1);
        if (!manager.diagnostics.pendingPatches) return;
        turns++;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      throw Error("Generated rock grass did not settle");
    };
    manager
      .prepare(
        [
          { formation: a, origin: a.origin },
          { formation: b, origin: b.origin }
        ],
        () => true
      )
      .commit();
    await settle();
    const neighbor = uploads.filter((batch) => batch.key.startsWith("b/"));
    const changed = generateRockFormation(
      { ...job, guides: [{ ...job.guides[0], size: [54, 30, 40] }] },
      settings
    );
    const frame = manager.prepare(
      [
        { formation: changed, origin: changed.origin },
        { formation: b, origin: b.origin }
      ],
      () => true
    );
    expect(frame.metrics).toMatchObject({ grassFormationsChanged: 1, grassFormationsRetained: 1 });
    frame.commit();
    await settle();
    expect(uploads.filter((batch) => batch.key.startsWith("b/"))).toEqual(neighbor);
    expect(neighbor.length).toBeGreaterThan(0);
    expect(turns).toBeGreaterThan(1);
    const ordered = times.slice().sort((a, b) => a - b);
    console.info(
      "Generated rock grass CPU sample (upload simulated by typed-array copy)",
      JSON.stringify({
        triangles: a.mesh.indices.length / 3,
        grassPatches: a.grass!.patches.length,
        frames: times.length,
        uploads: uploads.length,
        unchangedNeighborUploads: neighbor.length,
        p95SliceMs: ordered[Math.floor(ordered.length * 0.95)],
        maxSliceMs: ordered[ordered.length - 1],
        maxQuantumMs: manager.diagnostics.maxQuantumMs,
        lastEdit: manager.diagnostics.lastEdit
      })
    );
    manager.destroy();
  }, 30000);
});
