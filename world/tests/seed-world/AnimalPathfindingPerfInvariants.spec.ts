import { describe, expect, it, vi } from "vitest";
import { Renderer } from "@galacean/engine-core";
import { animalAnimationLodConfig, animalAnimationLodStride } from "@galacean/engine-animals/gameplay/animal/AnimalLod";
import { readAnimalPopulationConfig } from "@galacean/engine-world-planning/spatial/AnimalPopulationComponent";
import {
  ORIGINAL_WORLD_ANIMAL_ANIMATION_LOD,
  templateAnimalAnimationLod,
  WORLD_TEMPLATE_ART
} from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";
import { LakeBoundaryQueryIndex } from "@galacean/engine-water/water/compiler/lake/LakeBoundaryQueryIndex";
import { PlanningNavigationSurface } from "@galacean/engine-world-planning/spatial/runtime/PlanningNavigationSurface";
import { PlanningAnimalHabitat } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHabitat";
import { AnimalSystem } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { AnimalBlendClock } from "@galacean/engine-animals/gameplay/animal/AnimalBlendClock";
import { AnimalMotionPlayback } from "@galacean/engine-animals/gameplay/animal/AnimalMotionPlayback";
import { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";

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

  it("defers Animator.update across 1/60s substeps for stationary and crossfading poses", () => {
    const makeStubAnimal = (locomotionSpeed: number, blendSeconds: number) => {
      const updateSpy = vi.fn();
      const pose = { sampled: false, finished: false };
      const activeState = { name: "clip", pose };
      const playback = new AnimalMotionPlayback();
      playback.start(2.0, locomotionSpeed, "distance", 1);
      const blendClock = new AnimalBlendClock();
      blendClock.start(blendSeconds);
      const system = { deferringPose: true, markPendingPoseFlush: vi.fn() };
      const engine = { time: { frameCount: 10 } };
      const animal: any = Object.create(ConfiguredAnimal.prototype);
      Object.assign(animal, {
        active: true,
        disposed: false,
        system,
        root: { isActiveInHierarchy: true, engine },
        config: { bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] } },
        scale: 1,
        movementMedium: "ground",
        slopePitch: 0,
        clipStartedFrame: -1,
        activeState,
        activeStateInstance: { speed: 1 },
        verifiedAnimatedState: locomotionSpeed > 0 ? activeState : undefined,
        playback,
        blendClock,
        nativeTransition: { duration: blendSeconds },
        pendingAnimatorSeconds: 0,
        pendingGroundPlacement: false,
        animator: {
          speed: 1,
          findAnimatorState: () => ({ speed: 1 }),
          _isPoseCulled: () => true,
          update: (dt: number) => {
            pose.sampled = true;
            updateSpy(dt);
          }
        },
        correctRootMotion: () => {}
      });
      Object.defineProperty(animal, "duration", { get: () => 2.0 });
      return { animal, system, updateSpy, blendClock };
    };

    // 1. Stationary idle animal (fraction === 0, never verified) defers intermediate substeps & runs Animator.update once.
    const idle = makeStubAnimal(0, 0.3);
    const still = { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 };
    idle.system.deferringPose = true;
    idle.animal.prepareAnimation(1 / 60, still);
    idle.animal.prepareAnimation(1 / 60, still);
    expect(idle.updateSpy).not.toHaveBeenCalled();
    idle.system.deferringPose = false;
    idle.animal.prepareAnimation(1 / 60, still);
    expect(idle.updateSpy).toHaveBeenCalledTimes(1);
    expect(idle.updateSpy.mock.calls[0][0]).toBeCloseTo(3 / 60, 5);
    expect(idle.blendClock.remaining).toBeCloseTo(0.3 - 3 / 60, 5);

    // 2. Moving crossfading animal (verified state, blendClock > 0) defers intermediate substeps & evaluates once.
    const mover = makeStubAnimal(1.5, 0.25);
    const walking = { x: 0, z: 0, heading: 0, speed: 1.5, angularSpeed: 0 };
    mover.system.deferringPose = true;
    expect(mover.animal.prepareAnimation(1 / 60, walking)).toBe(1);
    expect(mover.animal.prepareAnimation(1 / 60, walking)).toBe(1);
    expect(mover.updateSpy).not.toHaveBeenCalled();
    mover.system.deferringPose = false;
    expect(mover.animal.prepareAnimation(1 / 60, walking)).toBe(1);
    expect(mover.updateSpy).toHaveBeenCalledTimes(1);
    expect(mover.updateSpy.mock.calls[0][0]).toBeCloseTo(3 / 60, 5);
    expect(mover.blendClock.remaining).toBeCloseTo(0.25 - 3 / 60, 5);
  });

  it("caches PlanningWaterRuntime spatial fields until revision changes and honors live queryEnabled toggles", () => {
    let sysRevision = 1;
    let bodiesGetterCalls = 0;
    let runtimeInterfacesCalls = 0;
    let queryEnabled = true;
    const maxHeightSpy = vi.fn(() => 2.5);
    const handle = {
      active: true,
      get queryEnabled() {
        return queryEnabled;
      },
      get runtimeInterfaces() {
        runtimeInterfacesCalls++;
        return {
          spatialField: {
            metadata: { bounds: { minX: 0, minZ: 0, maxX: 20, maxZ: 20 } },
            maximumSurfaceHeightInBounds: maxHeightSpy
          }
        };
      }
    };
    const water: any = Object.create(PlanningWaterRuntime.prototype);
    Object.assign(water, {
      destroyed: false,
      publishedRevision: 1,
      queryBounds: { minX: 0, minZ: 0, maxX: 0, maxZ: 0 },
      cachedSpatialFieldsNavRevision: -1,
      cachedSpatialFieldsSystemRevision: -1,
      cachedSpatialFieldsHost: undefined,
      cachedSpatialFieldsConservative: false,
      cachedSpatialFields: [],
      system: {
        runtimeState: { effectiveEnabled: true },
        activeRuntimeHost: { getBodyHandle: () => handle },
        get revision() {
          return sysRevision;
        },
        get bodies() {
          bodiesGetterCalls++;
          return [{ waterId: "lake-1" }];
        }
      }
    });

    // Repeated queries reuse cached spatial field without re-walking system.bodies or re-creating runtimeInterfaces.
    expect(water.hasWaterInBounds(5, 5, 10, 10)).toBe(true);
    expect(water.hasWaterInBounds(30, 30, 35, 35)).toBe(false);
    expect(water.hasWaterInBounds(1, 1, 2, 2)).toBe(true);
    expect(bodiesGetterCalls).toBe(1);
    expect(runtimeInterfacesCalls).toBe(1);

    // Live queryEnabled toggle takes effect immediately even without bumping system.revision.
    queryEnabled = false;
    expect(water.hasWaterInBounds(5, 5, 10, 10)).toBe(false);
    expect(bodiesGetterCalls).toBe(1);
    queryEnabled = true;

    // Bumping system.revision invalidates and rebuilds the cache cleanly.
    sysRevision = 2;
    expect(water.hasWaterInBounds(5, 5, 10, 10)).toBe(true);
    expect(bodiesGetterCalls).toBe(2);
    expect(runtimeInterfacesCalls).toBe(2);
  });

  it("culls newly enabled off-screen renderers after their first unrendered frame (matching ParticleSystemManager)", () => {
    const engine = { time: { frameCount: 10 }, _frameInProcess: false };
    const renderer: any = Object.create(Renderer.prototype);
    renderer._engine = engine;
    renderer._renderFrameCount = undefined;
    renderer._overrideUpdate = false;
    renderer._scene = { _componentsManager: { addRenderer: () => {}, addOnUpdateRenderers: () => {} } };
    Object.defineProperty(renderer, "engine", { get: () => engine });
    Object.defineProperty(renderer, "scene", { get: () => renderer._scene });

    // Enabled between frames (frame 10): stays visible for frame 11's update before first culling pass.
    renderer._onEnableInScene();
    engine.time.frameCount = 11;
    engine._frameInProcess = true;
    expect(renderer.isCulled).toBe(false);

    // Frame 11 finishes without rendering this renderer -> culled on frame 12 update.
    engine.time.frameCount = 12;
    expect(renderer.isCulled).toBe(true);

    // Once rendered on frame 12 -> unculled during frame 13 update.
    renderer._renderFrameCount = 12;
    engine.time.frameCount = 13;
    expect(renderer.isCulled).toBe(false);

    // Re-enabling mid-frame resets _renderFrameCount to frameCount - 1 so it gets one visible frame.
    engine.time.frameCount = 50;
    engine._frameInProcess = true;
    renderer._onEnableInScene();
    expect(renderer.isCulled).toBe(false);
    engine.time.frameCount = 51;
    expect(renderer.isCulled).toBe(true);
  });

  it("validates configurable global/template animation LOD thresholds and ratesHz", () => {
    const defaults = animalAnimationLodConfig();
    expect(animalAnimationLodStride(0, defaults)).toBe(1);
    expect(animalAnimationLodStride(1, defaults)).toBe(2);
    expect(animalAnimationLodStride(2, defaults)).toBe(3);
    expect(animalAnimationLodStride(null, defaults)).toBe(4);

    const custom = animalAnimationLodConfig({
      screenRelativeTransitionHeights: [0.2, 0.1, 0.04],
      ratesHz: [30, 15, 6, 5]
    });
    expect(animalAnimationLodStride(2, custom, 30)).toBe(5);
    expect(animalAnimationLodStride(null, custom, 30)).toBe(6);

    const disabled = animalAnimationLodConfig({ enabled: false });
    expect(animalAnimationLodStride(null, disabled, 30)).toBe(1);

    expect(() => animalAnimationLodConfig({ screenRelativeTransitionHeights: [0.05, 0.1, 0.02] })).toThrow();
    expect(() => animalAnimationLodConfig({ ratesHz: [30, 0, 10, 5] })).toThrow();

    const makeDoc = (animalValues: Record<string, unknown>) =>
      ({
        version: 1,
        entities: {
          world: {
            id: "world",
            name: "world",
            components: {
              world: { values: { seed: 42 } },
              animals: { values: animalValues }
            }
          }
        },
        passthrough: { parameters: { seed: 42 } }
      }) as any;
    const defaultPop = readAnimalPopulationConfig(makeDoc({}));
    expect(defaultPop.animationLod).toEqual({
      enabled: true,
      screenRelativeTransitionHeights: [0.12, 0.06, 0.03],
      ratesHz: [30, 15, 10, 7.5]
    });
    const customPop = readAnimalPopulationConfig(
      makeDoc({
        "animationLod.lod0Height": 0.18,
        "animationLod.farHz": 5
      })
    );
    expect(customPop.animationLod).toEqual({
      enabled: true,
      screenRelativeTransitionHeights: [0.18, 0.06, 0.03],
      ratesHz: [30, 15, 10, 5]
    });

    // All 6 templates (5 authored + original) explicitly define animation LOD config.
    const expectedLod = {
      enabled: true,
      screenRelativeTransitionHeights: [0.12, 0.06, 0.03],
      ratesHz: [30, 15, 10, 7.5]
    };
    expect(ORIGINAL_WORLD_ANIMAL_ANIMATION_LOD).toEqual(expectedLod);
    expect(templateAnimalAnimationLod("")).toEqual(expectedLod);
    for (const id of ["low-poly", "sakura-pearl", "emerald-forest", "titan-wasteland", "oil-paint"]) {
      expect(WORLD_TEMPLATE_ART[id].animalAnimationLod).toEqual(expectedLod);
      expect(templateAnimalAnimationLod(id)).toEqual(expectedLod);
    }
  });

  it("skips off-screen Animator.update and decimates distant Animation LOD ticks while keeping 30Hz motion", () => {
    const engine = { time: { frameCount: 10 } };
    const pose = { sampled: false, finished: false };
    const activeState = { name: "walk", pose };
    const playback = new AnimalMotionPlayback();
    playback.start(2.0, 1.5, "distance", 1);
    const blendClock = new AnimalBlendClock();
    blendClock.start(0);
    const updateSpy = vi.fn();
    const playSpy = vi.fn();
    let culled = false;
    const animal: any = Object.create(ConfiguredAnimal.prototype);
    Object.assign(animal, {
      active: true,
      disposed: false,
      system: { deferringPose: false, markPendingPoseFlush: () => {} },
      root: { isActiveInHierarchy: true, engine },
      config: {
        bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
        animations: [{ id: "walk", clip: "walk", speed: 1.5 }]
      },
      clip: 0,
      scale: 1,
      movementMedium: "ground",
      slopePitch: 0,
      clipStartedFrame: -1,
      activeState,
      activeStateInstance: { speed: 1 },
      verifiedAnimatedState: activeState,
      playback,
      blendClock,
      nativeTransition: { duration: 0 },
      pendingAnimatorSeconds: 0,
      pendingGroundPlacement: false,
      poseDesyncedWhileCulled: false,
      animationLodStride: 1,
      animationLodPhase: 0,
      animationLodTicks: 0,
      renderers: [
        {
          get isCulled() {
            return culled;
          }
        }
      ],
      animator: {
        speed: 1,
        findAnimatorState: () => ({ speed: 1 }),
        _isPoseCulled: () => culled,
        play: (...args: unknown[]) => playSpy(...args),
        update: (dt: number) => {
          pose.sampled = true;
          updateSpy(dt);
        }
      },
      readPose: () => true,
      correctRootMotion: () => {}
    });
    Object.defineProperty(animal, "duration", { get: () => 2.0 });
    const walking = { x: 0, z: 0, heading: 0, speed: 1.5, angularSpeed: 0 };

    // 1. Animation LOD stride=3 evaluates Animator.update once every 3 ticks while keeping full motion fraction=1.
    animal.setAnimationLod(3, 0);
    expect(animal.prepareAnimation(1 / 30, walking)).toBe(1);
    expect(animal.prepareAnimation(1 / 30, walking)).toBe(1);
    expect(updateSpy).toHaveBeenCalledTimes(0);
    expect(animal.prepareAnimation(1 / 30, walking)).toBe(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toBeCloseTo(3 / 30, 5);

    // 2. Off-screen culling skips Animator.update completely and resyncs O(1) via play()+update(0) on re-entry.
    updateSpy.mockClear();
    playSpy.mockClear();
    animal.setAnimationLod(1, 0);
    culled = true;
    expect(animal.prepareAnimation(1 / 30, walking)).toBe(1);
    expect(animal.prepareAnimation(1 / 30, walking)).toBe(1);
    expect(updateSpy).not.toHaveBeenCalled();

    culled = false;
    expect(animal.prepareAnimation(1 / 30, walking)).toBe(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toBe(0);
  });
});
