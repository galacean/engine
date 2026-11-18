import { describe, expect, it, vi } from "vitest";
import { PlanningNavigationSurface } from "@galacean/engine-world-planning/spatial/runtime/PlanningNavigationSurface";
import {
  animalContentChange,
  animalCollisionChanges,
  animalWaterChange,
  planningAnimalSnapshotId,
  emptyAnimalWorldChange
} from "@galacean/engine-world-planning/spatial/runtime/PlanningAnimalWorldChange";
import { PlanningAnimalHost } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHost";
import { PlanningAnimalRuntime } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalRuntime";
import {
  PlanningAnimalHabitat,
  liveAnimalRouteQuery
} from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHabitat";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { finishAnimalPlanningTask } from "@galacean/engine-animals/gameplay/animal/AnimalPlanningTask";

const region = { minX: 0, minZ: 0, maxX: 3, maxZ: 3 };
function plan() {
  return {
    parameters: { width: 100, depth: 100, seed: 1 },
    spawn: { x: 0, z: 0 },
    rocks: [],
    buildings: [],
    bridges: [],
    roadApproaches: [],
    waters: []
  } as any;
}

describe("provider-owned support invalidation", () => {
  it("invalidates exact local samples and leaves outside heights and water cached", () => {
    const p = plan();
    let height = 1,
      level = 3;
    const ground = vi.fn(() => height),
      water = vi.fn((x, z, out) => {
        out.surfacePosition.set(x, level, z);
        out.waterDepth = 10;
        return true;
      });
    const nav = new PlanningNavigationSurface(p, ground, { sampleSurface: water } as any, undefined, true);
    const out = { height: undefined, waterHeight: undefined } as any;
    nav.beginAnimalUpdate();
    nav.sampleAnimalSupport(1, 2, out);
    nav.sampleAnimalSupport(20, 30, out);
    height = 2;
    level = 4;
    nav.invalidateAnimalSupport({ ...emptyAnimalWorldChange(p), terrain: [region] });
    nav.sampleAnimalSupport(20, 30, out);
    expect(out).toEqual({ height: 1, waterHeight: 3 });
    expect(ground).toHaveBeenCalledTimes(2);
    expect(water).toHaveBeenCalledTimes(2);
    nav.sampleAnimalSupport(1, 2, out);
    expect(out).toEqual({ height: 2, waterHeight: 4 });
    level = 5;
    nav.invalidateAnimalSupport({ ...emptyAnimalWorldChange(p), water: [region] });
    nav.sampleAnimalSupport(1, 2, out);
    expect(out.waterHeight).toBe(5);
    expect(ground).toHaveBeenCalledTimes(3);
    nav.endAnimalUpdate();
    nav.beginAnimalUpdate();
    nav.sampleAnimalSupport(20, 30, out);
    expect(out.waterHeight).toBe(5);
    expect(ground).toHaveBeenCalledTimes(3);
  });

  it("inherits immutable heights outside an edit without mutating the accepted cache", () => {
    const p = plan(),
      oldHeight = vi.fn(() => 1),
      newHeight = vi.fn(() => 2);
    const old = new PlanningNavigationSurface(p, oldHeight, { sampleSurface: () => false } as any, undefined, true);
    old.beginAnimalUpdate();
    old.sampleHeightInterpolated(1, 2);
    old.sampleHeightInterpolated(20, 30);
    const next = new PlanningNavigationSurface(p, newHeight, { sampleSurface: () => false } as any, undefined, true);
    next.inheritAnimalSupport(old, { ...emptyAnimalWorldChange(p), terrain: [region] });
    next.beginAnimalUpdate();
    expect(next.sampleHeightInterpolated(20, 30)).toBe(1);
    expect(next.sampleHeightInterpolated(1, 2)).toBe(2);
    expect(newHeight).toHaveBeenCalledTimes(1);
    expect(old.sampleHeightInterpolated(1, 2)).toBe(1);
    expect(oldHeight).toHaveBeenCalledTimes(2);
  });
});

describe("publication change classification", () => {
  function withBox(x = 10) {
    const p = plan();
    p.rocks = [
      {
        id: "rock",
        groupId: "rocks",
        boxes: [{ id: "solid", center: { x, z: 10 }, sizeX: 4, sizeZ: 2, sizeY: 3, yaw: Math.PI / 4, collision: true }]
      }
    ];
    return p;
  }
  it("ignores appearance/labels but includes both ends of a moved or removed solid", () => {
    const a = withBox(),
      b = structuredClone(a);
    b.rocks[0].boxes[0].label = "changed";
    b.rocks[0].boxes[0].color = "red";
    expect(animalContentChange(a, b, () => 0)?.obstacles).toEqual([]);
    b.rocks[0].boxes[0].center.x = 30;
    const change = animalContentChange(a, b, () => 0)!;
    expect(change.terrain).toEqual([]);
    expect(change.obstacles).toHaveLength(2);
    expect(change.obstacles[0].minX).toBeLessThan(8);
    expect(change.obstacles[1].maxX).toBeGreaterThan(32);
    b.rocks = [];
    expect(animalContentChange(a, b, () => 0)?.obstacles).toHaveLength(1);
  });
  it("includes the whole solid when terrain changes its grounding", () => {
    const a = withBox();
    expect(
      animalCollisionChanges(
        a,
        a,
        () => 0,
        () => 2
      )
    ).toHaveLength(2);
  });
  it("distinguishes a water appearance edit from physical surface changes and fails closed for missing bounds", () => {
    const a = plan(),
      b = plan();
    a.waters = b.waters = [
      {
        id: "lake",
        outline: [
          { x: 10, z: 20 },
          { x: 30, z: 40 }
        ]
      }
    ];
    expect(animalWaterChange(a, b, { bodyId: "lake", surface: false })?.water).toEqual([]);
    expect(animalWaterChange(a, b, { bodyId: "lake", surface: true })?.water).toHaveLength(2);
    expect(animalWaterChange(a, b, { bodyId: "unknown", surface: true })).toBeUndefined();
  });
  it("merges consecutive queued publications and falls back on a missing base", () => {
    const host = new PlanningAnimalHost({} as any, () => ({ x: 0, z: 0 })) as any;
    const a = plan(),
      b = plan(),
      c = plan(),
      nav = {},
      config = { enabled: true };
    host.synchronize(b, config, nav, {
      preservePopulation: true,
      change: { ...emptyAnimalWorldChange(a), terrain: [region] }
    });
    host.synchronize(c, config, nav, {
      preservePopulation: true,
      change: { ...emptyAnimalWorldChange(b), water: [region] }
    });
    expect(host.pending.change.previousSnapshot).toBe(planningAnimalSnapshotId(a));
    expect(host.pending.change.terrain).toHaveLength(1);
    expect(host.pending.change.water).toHaveLength(1);
    host.synchronize(plan(), config, nav, { preservePopulation: true, change: emptyAnimalWorldChange(plan()) });
    expect(host.pending.change).toBeUndefined();
  });
});

function animal() {
  return Object.assign(Object.create(ConfiguredAnimal.prototype), {
    canOccupy: () => true,
    options: { ground: { staticRouteQuery: () => ({ canTraverse: () => true, obstruction: () => undefined }) } },
    config: { bounds: { min: [0, 0, 0], max: [1, 1, 1] } },
    motion: { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
    root: { transform: { position: { x: 0, y: 0, z: 0 } } },
    groundSteering: { maxAngularSpeed: 0.3, turnSpeedRatio: 0.5, arrivalRadius: 0.1 },
    scale: 1,
    speedMultiplier: 1,
    baseRadius: 0.25,
    velocity: 0,
    system: { time: 0 },
    planningRevision: 0,
    updateCrowdIntent() {},
    behavior: { worldChanged: vi.fn() }
  });
}

describe("local animal dependencies", () => {
  it.each(["ground", "water", "air"] as const)("keeps %s routes inside the individual birth disk", medium => {
    const canTraverse = vi.fn(() => true);
    const read = () => ({ staticRouteQuery: () => ({ canTraverse, obstruction: () => undefined }) });
    const route = liveAnimalRouteQuery(read, 0.5, 1, medium, { x: 80, z: 90, radius: 32 });
    expect(route.canTraverse([80, 90], [112, 90])).toBe(true);
    expect(route.canTraverse([80, 90], [107, 117])).toBe(false);
    expect(route.canTraverse([113, 90], [112, 90])).toBe(false);
    expect(canTraverse).toHaveBeenCalledOnce();
  });
  it("retains obstacle identities across unrelated index rebuilds for suspended searches", () => {
    const before = plan();
    before.rocks = [0, 20].map((x, i) => ({
      id: `rock-${i}`,
      groupId: `group-${i}`,
      boxes: [{ id: `box-${i}`, center: { x, z: 10 }, sizeX: 2, sizeY: 3, sizeZ: 2, yaw: 0, collision: true }]
    }));
    const after = structuredClone(before);
    after.rocks.shift();
    const nav = { sampleHeightInterpolated: () => 0 };
    const range = { spawnRadius: 100, roamRadius: 100 } as any;
    let habitat = new PlanningAnimalHabitat(before, nav, range);
    const query = liveAnimalRouteQuery(() => habitat, 0.5, 1, "ground");
    const removed = query.obstruction([-3, 10], [3, 10], 0)!;
    const retained = query.obstruction([17, 10], [23, 10], 0)!;
    habitat = new PlanningAnimalHabitat(after, nav, range);
    const next = query.obstruction([17, 10], [23, 10], 0)!;
    expect(next.key).toBe(retained.key);
    expect(next.key).not.toBe(removed.key);
    expect(next.corners).toEqual(retained.corners);
  });
  it("uses the new habitat for future queries of an unaffected suspended route", () => {
    let habitat = { staticRouteQuery: () => ({ canTraverse: () => true, obstruction: () => undefined }) };
    const query = liveAnimalRouteQuery(() => habitat, 0.5, 1, "ground");
    expect(query.canTraverse([0, 0], [1, 1])).toBe(true);
    habitat = { staticRouteQuery: () => ({ canTraverse: () => false, obstruction: () => undefined }) };
    expect(query.canTraverse([30, 30], [31, 31])).toBe(false);
  });
  it("preserves unrelated queued work but invalidates a pending target far from the animal", () => {
    const a = animal(),
      task = a.createRouteTask([0, 20], 2, "ground");
    task.next();
    a.refreshWorld([{ minX: 100, maxX: 101, minZ: 100, maxZ: 101 }]);
    expect(a.planningRevision).toBe(0);
    a.refreshWorld([{ minX: -1, maxX: 1, minZ: 19, maxZ: 21 }]);
    expect(a.planningRevision).toBe(1);
    task.return(false);
    expect(a.planningBounds.size).toBe(0);
  });
  it("records the validated curve, not just the chord or animal position", () => {
    const a = animal();
    const points: number[][] = [];
    a.options.ground.staticRouteQuery = () => ({
      canTraverse: (_from: number[], to: number[]) => {
        points.push([...to]);
        return true;
      },
      obstruction: () => undefined
    });
    expect(finishAnimalPlanningTask(a.createRouteTask([4, 4], 2, "ground"))).toBe(true);
    const curve = points.slice(3).sort((a, b) => Math.abs(b[0] - b[1]) - Math.abs(a[0] - a[1]))[0];
    expect(Math.abs(curve[0] - curve[1])).toBeGreaterThan(0.5);
    a.refreshWorld([{ minX: curve[0], maxX: curve[0], minZ: curve[1], maxZ: curve[1] }]);
    expect(a.planningRevision).toBe(1);
    expect(a.preparedRoute).toBeUndefined();
  });
  it("surface-only changes wake behavior without cancelling route validation", () => {
    const a = animal();
    a.refreshWorld([region], false);
    expect(a.planningRevision).toBe(0);
    expect(a.behavior.worldChanged).toHaveBeenCalledOnce();
  });
  it("checks only overlapping body footprints when revalidating support", () => {
    const traverse = vi.fn(() => true);
    const actors = [1, 3.2, 20].map((x) => ({
      supportValid: true,
      x,
      z: 1,
      footprint: { radius: 0.5, height: 1 },
      birth: { medium: "ground" },
      asset: { profile: {} }
    }));
    (PlanningAnimalRuntime.prototype as any).revalidateSupport({ actors, habitat: { canTraverse: traverse } }, [
      region
    ]);
    expect(traverse).toHaveBeenCalledTimes(2);
  });
});
