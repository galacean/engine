import { describe, expect, it, vi } from "vitest";
import { LakeBoundaryQueryIndex } from "@galacean/engine-water/water/compiler/lake/LakeBoundaryQueryIndex";
import { PlanningNavigationSurface } from "@galacean/engine-world-planning/spatial/runtime/PlanningNavigationSurface";
import { PlanningAnimalHabitat } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHabitat";
import { AnimalSystem } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";

vi.mock("@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes", () => ({ planningWhiteboxes: () => [] }));

describe("animal pathfinding performance invariants", () => {
  it("matches LakeBoundaryQueryIndex.sample >= -tolerance across concave bays and inner dry islands", () => {
    // Concave outer lake with an inner dry sandbar island (even-odd hole).
    const outer = [
      [-40, -30],
      [-10, -30],
      [-5, -10],
      [5, -10],
      [10, -30],
      [40, -30],
      [40, 30],
      [-40, 30]
    ] as const;
    const island = [
      [8, -5],
      [22, -5],
      [22, 8],
      [8, 8]
    ] as const;
    const index = new LakeBoundaryQueryIndex([outer, island]);
    for (const tol of [0, 0.05, 0.5]) {
      for (let z = -35; z <= 35; z += 1.75) {
        for (let x = -45; x <= 45; x += 1.75) {
          const expected = index.sample(x, z) >= -tol;
          expect(index.containsOrWithinTolerance(x, z, tol)).toBe(expected);
        }
      }
      // Explicitly verify points inside the dry island hole are rejected beyond tolerance.
      expect(index.containsOrWithinTolerance(15, 1.5, tol)).toBe(false);
      // Points inside the concave bay notch outside the lake.
      expect(index.containsOrWithinTolerance(0, -20, tol)).toBe(false);
      // Points inside the lake water.
      expect(index.containsOrWithinTolerance(-20, 0, tol)).toBe(true);
      // Boundary point right on the outer edge and island edge.
      expect(index.containsOrWithinTolerance(-40, 0, tol)).toBe(true);
      expect(index.containsOrWithinTolerance(8, 0, tol)).toBe(true);
    }
  });

  it("retains static water cache across frames, skips water queries on dry tiles, and invalidates on edits", () => {
    const plan = {
      spawn: { x: 0, z: 0 },
      parameters: { width: 256, depth: 256 },
      waters: [],
      bridges: [
        {
          id: "b1",
          a: { x: 40, z: 40, y: 2 },
          b: { x: 48, z: 40, y: 2 },
          width: 4,
          deckY: 2
        }
      ],
      roadApproaches: []
    } as any;
    let waterRegionActive = false;
    let waterRevision = 1;
    const sampleSurface = vi.fn((x: number, z: number, out: any) => {
      if (waterRegionActive && x >= 10 && x <= 18 && z >= 10 && z <= 18) {
        out.surfacePosition.set(x, 5, z);
        out.waterDepth = 3;
        return true;
      }
      return false;
    });
    const hasWaterInBounds = vi.fn((minX: number, minZ: number, maxX: number, maxZ: number) => {
      if (!waterRegionActive) return false;
      return maxX >= 10 && minX <= 18 && maxZ >= 10 && minZ <= 18;
    });
    const water = {
      staticNavigationWater: true as const,
      get navigationWaterRevision() {
        return waterRevision;
      },
      sampleSurface,
      hasWaterInBounds
    };
    const nav = new PlanningNavigationSurface(plan, () => 1, water as any, undefined, true);
    const out = { height: undefined as number | undefined, waterHeight: undefined as number | undefined };

    // Provably dry tile skips sampleSurface completely.
    nav.beginAnimalUpdate();
    expect(nav.isBoundsDefinitelyDry(11, 11, 13, 13)).toBe(true);
    nav.sampleAnimalSupport(12, 12, out);
    expect(out.waterHeight).toBeUndefined();
    expect(sampleSurface).not.toHaveBeenCalled();
    // Bridge tile is conservatively treated as mixed, never DEFINITELY_DRY.
    expect(nav.isBoundsDefinitelyDry(41, 39, 43, 41)).toBe(false);
    nav.endAnimalUpdate();

    // Activate water and bump revision: dry tile cache and point cache automatically invalidate.
    waterRegionActive = true;
    waterRevision = 2;
    nav.beginAnimalUpdate();
    expect(nav.isBoundsDefinitelyDry(11, 11, 13, 13)).toBe(false);
    nav.sampleAnimalSupport(12, 12, out);
    expect(out.waterHeight).toBe(5);
    expect(sampleSurface).toHaveBeenCalledTimes(1);
    nav.endAnimalUpdate();

    // Next frame retains static water cache without calling sampleSurface again.
    nav.beginAnimalUpdate();
    nav.sampleAnimalSupport(12, 12, out);
    expect(out.waterHeight).toBe(5);
    expect(sampleSurface).toHaveBeenCalledTimes(1);
    nav.endAnimalUpdate();

    // Explicit water edit invalidates only the edited region.
    nav.invalidateAnimalSupport({
      previousSnapshot: "prev",
      terrain: [],
      water: [{ minX: 10, maxX: 18, minZ: 10, maxZ: 18 }],
      obstacles: [],
      surface: []
    });
    nav.beginAnimalUpdate();
    nav.sampleAnimalSupport(12, 12, out);
    expect(sampleSurface).toHaveBeenCalledTimes(2);
    nav.endAnimalUpdate();
  });

  it("detects mid-corridor obstacles in a valley even when endpoints are elevated", () => {
    const plan = {
      spawn: { x: 0, z: 0 },
      parameters: { width: 200, depth: 200 },
      waters: [],
      bridges: [],
      roadApproaches: []
    } as any;
    // Endpoints at x=0 and x=20 are at y=10; valley at x=10 dips to y=0.
    const heightAt = (x: number) => (x > 6 && x < 14 ? 0 : 10);
    const habitat = new PlanningAnimalHabitat(
      plan,
      {
        sampleHeightInterpolated: (x) => heightAt(x),
        sampleContactIsWater: () => false,
        isBoundsDefinitelyDry: () => true
      },
      { spawnRadius: 200, roamRadius: 200 }
    ) as any;
    // Rock sits in the valley (bottom=0, top=4): below endpoint height 10, but blocks valley floor at y=0!
    habitat.solidCount++;
    habitat.solids.add({
      id: "valley-rock",
      x: 10,
      z: 0,
      cos: 1,
      sin: 0,
      halfX: 1,
      halfZ: 1,
      bottom: 0,
      top: 4,
      seen: 0,
      minX: 9,
      maxX: 11,
      minZ: -1,
      maxZ: 1
    });
    expect(habitat.canTraverse({ x: 0, z: 0 }, { x: 20, z: 0 }, 0.5, 1.5, "ground")).toBe(false);
    // An overhang at bottom=15 (above every point along the corridor) does NOT block.
    habitat.solids.add({
      id: "high-arch",
      x: 10,
      z: 5,
      cos: 1,
      sin: 0,
      halfX: 1,
      halfZ: 1,
      bottom: 15,
      top: 20,
      seen: 0,
      minX: 9,
      maxX: 11,
      minZ: 4,
      maxZ: 6
    });
    expect(habitat.canTraverse({ x: 0, z: 5 }, { x: 20, z: 5 }, 0.5, 1.5, "ground")).toBe(true);
  });

  it("prioritizes urgent planning without starving normal background planning tasks", () => {
    const system = new AnimalSystem(32, 1000, 10);
    const makeAgent = () => {
      const a = {
        evaluateBehavior() {},
        advanceMotion() {},
        dispose() {
          system.remove(a);
        }
      };
      system.register(a);
      return a;
    };
    const normalOwner = makeAgent();
    const urgentOwner = makeAgent();
    let normalSteps = 0;
    let urgentSteps = 0;
    const order: string[] = [];
    system.plan(
      normalOwner,
      (function* () {
        for (let i = 0; i < 20; i++) {
          normalSteps++;
          order.push("N");
          yield;
        }
      })(),
      () => {},
      false
    );
    system.plan(
      urgentOwner,
      (function* () {
        for (let i = 0; i < 20; i++) {
          urgentSteps++;
          order.push("U");
          yield;
        }
      })(),
      () => {},
      true
    );
    system.update(1 / 60);
    // Urgent runs first (70% = 7 steps), normal still receives guaranteed 30% = 3 steps!
    expect(urgentSteps).toBe(7);
    expect(normalSteps).toBe(3);
    expect(order.slice(0, 7).every((x) => x === "U")).toBe(true);
    expect(order.slice(7, 10).every((x) => x === "N")).toBe(true);
    system.dispose();
  });

  it("merges straight ground cruise checks while keeping airborne validation at exact 1/15s cadence", () => {
    const run = (medium: "ground" | "air") => {
      const canTraverse = vi.fn(() => true);
      const canTraverseAir = vi.fn(() => true);
      const animal: any = Object.create(ConfiguredAnimal.prototype);
      Object.assign(animal, {
        options: {
          ground: {
            staticRouteQuery: () => ({ canTraverse, obstruction: () => undefined }),
            heightAt: () => 0,
            canTraverseAir
          }
        },
        config: { bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] } },
        scale: 1,
        speedMultiplier: 1,
        baseRadius: 0.5,
        motion: { x: 0, z: 0, heading: 0, speed: 1.5, angularSpeed: 0 },
        root: { transform: { position: { y: 0 } } },
        system: { time: 1 },
        groundSteering: { maxAngularSpeed: 0.3, turnSpeedRatio: 0.5, arrivalRadius: 0.15 },
        airSteering: { maxAngularSpeed: 0.8, turnSpeedRatio: 0.65, arrivalRadius: 0.3 },
        canOccupy: () => true
      });
      expect(animal.prepareRoute([0, 12], 1.5, medium)).toBe(true);
      return { canTraverseCalls: canTraverse.mock.calls.length, airCalls: canTraverseAir.mock.calls.length };
    };
    const ground = run("ground");
    const air = run("air");
    // 12m at 1.5 m/s would be ~120 steps unmerged; merged ground cruise does < 30 calls!
    expect(ground.canTraverseCalls).toBeLessThan(35);
    // Airborne stays at exact 1/15s cadence (~120+ air vertical sweep checks).
    expect(air.airCalls).toBeGreaterThan(100);
  });
});
