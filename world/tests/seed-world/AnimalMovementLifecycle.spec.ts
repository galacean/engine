import { afterEach, describe, expect, it, vi } from "vitest";
import { Entity, type Engine } from "@galacean/engine";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { AnimalSystem, type AnimalAgent } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import { GroundAnimalCrowd, type GroundAnimalBody } from "@galacean/engine-animals/gameplay/animal/GroundAnimalCrowd";
import type { AnimalPlanningTask } from "@galacean/engine-animals/gameplay/animal/AnimalPlanningTask";
import { finishAnimalPlanningTask } from "@galacean/engine-animals/gameplay/animal/AnimalPlanningTask";
import type { AnimalAssetConfig } from "@galacean/engine-animals/gameplay/animal/AnimalAssetCatalog";
import type { AnimalTaskProfile } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import { PlanningAnimalHabitat } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHabitat";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture(medium: "ground" | "air" = "ground", cadence = 0.1, milliseconds = 1000) {
  const root = new Entity({ resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {} } } as unknown as Engine);
  const system = new AnimalSystem(32, milliseconds, 512),
    crowd = new GroundAnimalCrowd();
  const bounds = { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] } as AnimalAssetConfig["bounds"];
  const config: AnimalAssetConfig = {
    id: "lifecycle",
    name: "Lifecycle",
    family: "test",
    aliases: [],
    modelUrl: "",
    note: "",
    scale: 1,
    bounds,
    animations: ["idle", "walk"].map((id) => ({ id, clip: id, duration: 1, loop: false, bounds })),
    initialAnimation: "idle"
  };
  const profile: AnimalTaskProfile = {
    defaultSkill: "idle",
    skills: {
      idle: { label: "Idle", tree: { type: "action", name: "animate", params: { slot: "idle" } } },
      walk: {
        label: "Walk",
        requiresTarget: true,
        tree: {
          type: "action",
          name: "move",
          params: { slot: "walk", target: "request", ...(medium === "air" ? { medium, arrivalMedium: "ground" } : {}) }
        }
      }
    },
    animationSlots: { idle: [{ clip: "idle", weight: 1, medium }], walk: [{ clip: "walk", weight: 1, medium }] },
    movementSpeeds: { walk: 2 },
    reactions: {}
  };
  let blocked = false;
  let liveBlocked = false;
  let planningBlocked = false;
  let habitat: PlanningAnimalHabitat | undefined;
  const traverse = (from: readonly number[], to: readonly number[]) =>
    !(blocked && Math.min(from[1], to[1]) < 4 && Math.max(from[1], to[1]) >= 4);
  const query = vi.fn((from: readonly number[], to: readonly number[]) => !planningBlocked && traverse(from, to));
  const animal = new ConfiguredAnimal(
    root,
    config,
    undefined,
    system,
    [0, 0],
    profile,
    (target) => [Number(target.params!.x), Number(target.params!.z)],
    crowd,
    0,
    {
      distantUpdateSeconds: cadence || 0.1,
      ground: {
        heightAt: (_x, _z, layer) => (layer === "air" ? 3 : 0),
        canTraverseAir: (a, b, radius, height) => habitat?.canTraverseAir(a, b, radius, height) ?? true,
        canTraverse: (a, b) => !liveBlocked && traverse([a.x, a.z], [b.x, b.z]),
        staticRouteQuery: (radius, medium) =>
          habitat?.staticRouteQuery(radius, 1, medium) ?? { canTraverse: query, obstruction: () => undefined }
      }
    }
  );
  cleanups.push(() => {
    system.dispose();
  });
  // Exercise production motion and clip callbacks without loading a GPU asset.
  animal.setStreamingState(false, false, true);
  if (cadence === 0) system.setMotionInterval(animal, 0);
  let delayNext = 0;
  let synchronous = false;
  const tasks: { cancelled: boolean; completed: boolean; closed: boolean; started: boolean }[] = [];
  const plan = system.plan.bind(system);
  system.plan = function <T>(owner: AnimalAgent, task: AnimalPlanningTask<T>, finish: (value: T) => void) {
    const record = { cancelled: false, completed: false, closed: false, started: false };
    tasks.push(record);
    const resumeAt = system.time + delayNext;
    const finishSynchronously = synchronous;
    delayNext = 0;
    const delayed = (function* (): AnimalPlanningTask<T> {
      record.started = true;
      try {
        // Reference only: finish at the same first service point, before any intervening motion.
        // The comparison side retains the production 2 ms / 512 step scheduler.
        if (finishSynchronously) return finishAnimalPlanningTask(task);
        let step = task.next();
        while (!step.done) {
          yield;
          // Only control when CPU work resumes; movement and callbacks are not injected.
          while (system.time < resumeAt) yield;
          step = task.next();
        }
        return step.value;
      } finally {
        record.closed = true;
        task.return(undefined as T);
      }
    })();
    const cancel = plan(owner, delayed, (value) => {
      record.completed = true;
      finish(value);
    });
    return () => {
      record.cancelled = true;
      cancel();
    };
  };
  const move = (requestId = "move", z = 10) => ({
    requestId,
    skillId: "walk",
    target: { query: "point", params: { x: 0, z } }
  });
  return {
    animal,
    system,
    crowd,
    query,
    tasks,
    move,
    synchronous(value: boolean) {
      synchronous = value;
    },
    setHabitat(value: PlanningAnimalHabitat) {
      habitat = value;
    },
    block() {
      blocked = true;
    },
    removeLiveSupport() {
      liveBlocked = true;
    },
    blockPlanning(blocked: boolean) {
      planningBlocked = blocked;
    },
    edit(delay = 0, regions?: { minX: number; minZ: number; maxX: number; maxZ: number }[]) {
      delayNext = delay;
      animal.refreshWorld(regions);
      delayNext = 0;
      return tasks.at(-1)!;
    },
    advance(frames: number) {
      for (let i = 0; i < frames; i++) system.update(1 / 60);
    }
  };
}

describe("movement intent and world revalidation", () => {
  it.each([
    ["ground", 0],
    ["ground", 5],
    ["air", 0],
    ["air", 1 / 60],
    ["air", 5]
  ] as const)("finishes a long %s route check during continuous motion (interval %s)", (medium, cadence) => {
    const f = fixture(medium, cadence, 2);
    f.animal.execute(f.move("move", 200));
    f.advance(120);
    expect(f.animal.movementSpeed).toBeGreaterThan(0);
    const start = f.animal.position.z,
      calls = f.query.mock.calls.length,
      check = f.edit();
    // The route needs about 1,500 predictor steps, so it cannot fit in one slice.
    f.advance(1);
    expect(check.completed).toBe(false);
    for (let frame = 0; frame < 120 && !check.completed; frame++) {
      f.advance(1);
      expect(f.system.stats.lastPlanningSteps).toBeLessThanOrEqual(512);
    }
    expect(check.completed).toBe(true);
    expect(f.system.stats.planningTasks).toBe(0);
    expect(f.query.mock.calls.length - calls).toBeLessThan(3000);
    expect(f.animal.position.z).toBeGreaterThan(start);
    expect(f.animal.behavior.receipt("move")?.status).toBe("running");
  });

  it("does not change ongoing precise motion when a long route is revalidated", () => {
    const control = fixture("air", 0, 2),
      edited = fixture("air", 0, 2);
    for (const f of [control, edited]) {
      f.animal.execute(f.move("move", 200));
      f.advance(1);
      // Admission starts from rest; settle it before comparing live trajectories.
      for (let frame = 0; frame < 120 && f.system.stats.planningTasks; frame++) f.advance(1);
    }
    const check = edited.edit();
    for (let frame = 0; frame < 120; frame++) {
      control.advance(1);
      edited.advance(1);
      const actual = edited.animal.position,
        expected = control.animal.position;
      expect([actual.x, actual.y, actual.z]).toEqual([expected.x, expected.y, expected.z]);
      expect(edited.animal.movementSpeed).toBe(control.animal.movementSpeed);
      expect(edited.animal.direction).toBe(control.animal.direction);
      expect(edited.animal.angularSpeed).toBe(control.animal.angularSpeed);
    }
    expect(check.completed).toBe(true);
  });

  it("discards a suspended long preview after another affected edit", () => {
    const f = fixture("air", 0, 2);
    f.animal.execute(f.move("move", 200));
    f.advance(120);
    const old = f.edit();
    f.advance(1);
    expect(old.completed).toBe(false);
    f.blockPlanning(true);
    const latest = f.edit();
    f.advance(1);
    expect(old.cancelled).toBe(true);
    expect(old.completed).toBe(false);
    expect(latest.completed).toBe(true);
  });

  it("disposes the system with coarse motion and a suspended world task", () => {
    const f = fixture();
    f.animal.execute(f.move());
    f.advance(53);
    const check = f.edit(2);
    f.advance(1);
    expect(check.started).toBe(true);
    expect(() => f.system.dispose()).not.toThrow();
    expect(check.closed).toBe(true);
    expect(check.cancelled).toBe(true);
    expect(f.system.stats.planningTasks).toBe(0);
  });

  it.each([0, 0.4])("rejects an edited route across a natural gait handoff (CPU delay %s)", (delay) => {
    const f = fixture();
    f.animal.execute(f.move());
    f.advance(53);
    f.block();
    const check = f.edit(delay);
    f.advance(35);
    expect(check.completed).toBe(true);
    expect(f.animal.behavior.receipt("move")?.status).toBe("failed");
    expect(f.animal.position.z).toBeLessThan(4);
    expect(f.system.stats.planningTasks).toBe(0);
  });

  it("retains one revalidation across several gait clips", () => {
    const f = fixture();
    f.animal.execute(f.move());
    f.advance(53);
    const check = f.edit(2.5),
      count = f.tasks.length;
    f.advance(80);
    expect(check.cancelled).toBe(false);
    expect(check.completed).toBe(false);
    expect(f.tasks).toHaveLength(count);
    expect(f.system.stats.planningTasks).toBe(1);
    f.advance(80);
    expect(check.completed).toBe(true);
    expect(f.animal.behavior.receipt("move")?.status).toBe("running");
  });

  it("retains airborne movement and its world check across gait clips", () => {
    const f = fixture("air");
    f.animal.execute(f.move("move", 20));
    f.advance(53);
    const check = f.edit(2.5),
      start = f.animal.position.z;
    f.advance(80);
    expect(f.animal.position.z).toBeGreaterThan(start);
    expect(check.cancelled).toBe(false);
    expect(f.system.stats.planningTasks).toBe(1);
    f.advance(80);
    expect(check.completed).toBe(true);
    expect(f.animal.behavior.receipt("move")?.status).toBe("running");
  });

  it("accepts a newly validated flight to the same goal after a failed world check", () => {
    const f = fixture("air");
    f.animal.execute(f.move("move", 20));
    f.advance(53);
    // A temporary obstruction invalidates the preview, but not live airborne support.
    f.blockPlanning(true);
    const check = f.edit();
    for (let i = 0; i < 30 && !check.completed; i++) f.advance(1);
    expect(check.completed).toBe(true);
    f.blockPlanning(false);
    const failedCalls = f.query.mock.calls.length;
    f.advance(60);
    const calls = f.query.mock.calls.length;
    expect(calls).toBeGreaterThan(failedCalls);
    // An unrelated content publication may wake behavior, but must not repeat a completed recovery.
    f.animal.refreshWorld(undefined, false);
    f.advance(60);
    expect(f.query.mock.calls.length).toBe(calls);
    expect(f.animal.behavior.receipt("move")?.status).toBe("running");
  });

  it.each([0, 1])("finishes naturally and leaves no obsolete world task (CPU delay %s)", (delay) => {
    const f = fixture();
    f.animal.execute(f.move("move", 5));
    f.advance(141);
    const check = f.edit(delay);
    expect(() => f.advance(70)).not.toThrow();
    expect(f.animal.behavior.receipt("move")?.status).toBe("completed");
    expect(f.system.stats.planningTasks).toBe(0);
    expect(check.closed).toBe(true);
    if (delay) expect(check.cancelled).toBe(true);
  });

  it("treats an identical request retry as observation, not cancellation", () => {
    const f = fixture(),
      request = f.move();
    f.animal.execute(request);
    f.advance(53);
    const check = f.edit(1);
    expect(f.animal.execute(request).status).toBe("running");
    expect(check.cancelled).toBe(false);
    expect(f.system.stats.planningTasks).toBe(1);
  });

  it.each(["idle", "replacement", "manual", "dispose"])("closes the old continuation on %s", (operation) => {
    const f = fixture();
    f.animal.execute(f.move());
    f.advance(53);
    const check = f.edit(2);
    f.advance(1);
    expect(check.started).toBe(true);
    if (operation === "idle") f.animal.execute({ requestId: "idle", skillId: "idle" });
    else if (operation === "replacement") f.animal.execute(f.move("replacement", 8));
    else if (operation === "manual") f.animal.play(0);
    else f.animal.dispose();
    // Compatible command handover may defer cancellation until the next scheduled decision.
    f.advance(1);
    expect(check.cancelled).toBe(true);
    expect(check.closed).toBe(true);
    expect(check.completed).toBe(false);
    expect(() => f.advance(130)).not.toThrow();
    expect(f.animal.behavior.receipt("move")?.status).toBe(operation === "dispose" ? undefined : "cancelled");
    if (operation === "replacement") expect(f.animal.behavior.receipt("replacement")?.status).toBe("running");
    else expect(f.system.stats.planningTasks).toBe(0);
  });

  it("cancels pending validation when live support ends the movement first", () => {
    const f = fixture();
    f.animal.execute(f.move());
    f.advance(100);
    f.removeLiveSupport();
    const check = f.edit(3);
    f.advance(100);
    expect(f.animal.behavior.receipt("move")?.status).toBe("failed");
    expect(check.cancelled).toBe(true);
    expect(check.completed).toBe(false);
    expect(f.system.stats.planningTasks).toBe(0);
  });

  it("keeps pending work for an unrelated local edit", () => {
    const f = fixture();
    f.animal.execute(f.move());
    f.advance(53);
    const check = f.edit(2),
      count = f.tasks.length;
    f.animal.refreshWorld([{ minX: 100, maxX: 101, minZ: 100, maxZ: 101 }]);
    expect(check.cancelled).toBe(false);
    expect(f.tasks).toHaveLength(count);
  });

  it("replaces validation on a second affected edit and checks the newest geometry", () => {
    const f = fixture();
    f.animal.execute(f.move());
    f.advance(53);
    const old = f.edit(2);
    f.advance(1);
    f.block();
    const current = f.edit();
    expect(old.cancelled).toBe(true);
    expect(old.closed).toBe(true);
    f.advance(10);
    expect(current.completed).toBe(true);
    expect(f.animal.behavior.receipt("move")?.status).toBe("failed");
  });
});

describe("synchronous and resumed route behavior", () => {
  function pair(medium: "ground" | "air" = "air") {
    const sync = fixture(medium, 1 / 60, 2),
      resumed = fixture(medium, 1 / 60, 2);
    for (const f of [sync, resumed]) f.synchronous(true);
    return { sync, resumed, both: [sync, resumed] };
  }

  function pose(f: ReturnType<typeof fixture>) {
    return {
      x: f.animal.position.x,
      y: f.animal.position.y,
      z: f.animal.position.z,
      heading: f.animal.direction,
      speed: f.animal.movementSpeed,
      angularSpeed: f.animal.angularSpeed,
      status: f.animal.behavior.receipt("move")?.status
    };
  }

  function advanceTogether(p: ReturnType<typeof pair>, frames: number) {
    for (let frame = 0; frame < frames; frame++) {
      p.sync.advance(1);
      p.resumed.advance(1);
      expect(pose(p.resumed)).toEqual(pose(p.sync));
      expect(p.resumed.system.stats.lastPlanningSteps).toBeLessThanOrEqual(512);
    }
  }

  function start(p: ReturnType<typeof pair>, distance = 200) {
    for (const f of p.both) {
      f.animal.execute(f.move("move", distance));
      f.advance(1);
      expect(f.system.stats.planningTasks).toBe(0);
    }
    advanceTogether(p, 26);
    expect(p.sync.animal.movementSpeed).toBeGreaterThan(0);
    p.resumed.synchronous(false);
  }

  it("preserves every motion sample and completion after a boundary-sensitive local edit", () => {
    const p = pair();
    for (const f of p.both) expect(f.animal.relocate([0, 0], 2.5)).toBe(true);
    start(p);
    const rock = {
      id: "rock",
      groupId: "rocks",
      boxes: [
        {
          id: "solid",
          center: { x: 1.475480175836243, z: -1.7768048295438914 },
          sizeX: 0.08,
          sizeZ: 0.08,
          sizeY: 10,
          yaw: 0,
          collision: true
        }
      ]
    };
    const region = {
      minX: 1.435480175836243,
      maxX: 1.515480175836243,
      minZ: -1.8168048295438914,
      maxZ: -1.7368048295438914
    };
    const checks = p.both.map((f) => {
      f.setHabitat(
        new PlanningAnimalHabitat(
          {
            parameters: { width: 1024, depth: 1024, seed: 1 },
            spawn: { x: 0, z: 0 },
            waters: [],
            buildings: [],
            bridges: [],
            roadApproaches: [],
            rocks: [rock]
          } as any,
          { sampleHeightInterpolated: () => 0 },
          { roamRadius: 1000, spawnRadius: 1000 } as any
        )
      );
      return f.edit(0, [region]);
    });
    advanceTogether(p, 1);
    expect(checks[0].completed).toBe(true);
    expect(checks[1].completed).toBe(false);
    advanceTogether(p, 6599);
    expect(checks[1].completed).toBe(true);
    expect(p.resumed.animal.behavior.receipt("move")?.status).toBe("completed");
    expect(p.resumed.system.stats.planningTasks).toBe(0);
  });

  it("keeps the same motion through unrelated edits and replaces work for an affected edit", () => {
    const p = pair();
    start(p);
    const first = p.both.map((f) => f.edit(0.4));
    advanceTogether(p, 1);
    expect(first[1].completed).toBe(false);
    for (const f of p.both) {
      const count = f.tasks.length;
      f.animal.refreshWorld([{ minX: 100, maxX: 101, minZ: 100, maxZ: 101 }]);
      f.animal.refreshWorld(undefined, false);
      expect(f.tasks).toHaveLength(count);
    }
    expect(first[1].cancelled).toBe(false);
    const latest = p.both.map((f) => f.edit());
    expect(first[1].cancelled).toBe(true);
    expect(first[1].closed).toBe(true);
    advanceTogether(p, 120);
    expect(first[1].completed).toBe(false);
    expect(latest.every((task) => task.completed)).toBe(true);
    expect(p.resumed.system.stats.planningTasks).toBe(0);
  });

  it("uses the second edit's blocked support instead of accepting an obsolete successful preview", () => {
    const p = pair("ground");
    start(p);
    const first = p.both.map((f) => f.edit(0.4));
    advanceTogether(p, 1);
    expect(first[1].completed).toBe(false);
    const latest = p.both.map((f) => {
      f.block();
      return f.edit();
    });
    advanceTogether(p, 120);
    expect(first[1]).toMatchObject({ cancelled: true, closed: true, completed: false });
    expect(latest.every((task) => task.completed)).toBe(true);
    expect(p.resumed.animal.behavior.receipt("move")?.status).toBe("failed");
    expect(p.resumed.animal.position.z).toBeLessThan(4);
  });

  it.each(["idle", "replacement", "manual"])("does not revive an intent cancelled by %s", (operation) => {
    const p = pair("ground");
    start(p);
    const checks = p.both.map((f) => f.edit(0.4));
    advanceTogether(p, 1);
    expect(checks[1].completed).toBe(false);
    for (const f of p.both) {
      // Align any NEW admission; only the obsolete revalidation is suspended in this comparison.
      f.synchronous(true);
      if (operation === "idle") f.animal.execute({ requestId: "idle", skillId: "idle" });
      else if (operation === "manual") f.animal.play(0);
      else f.animal.execute(f.move("replacement", 8));
    }
    advanceTogether(p, 600);
    expect(checks[1]).toMatchObject({ cancelled: true, closed: true, completed: false });
    expect(p.resumed.animal.behavior.receipt("move")?.status).toBe("cancelled");
    if (operation === "replacement") {
      expect(p.resumed.animal.behavior.receipt("replacement")?.status).toBe("completed");
      expect(p.resumed.animal.behavior.receipt("replacement")?.status).toBe(
        p.sync.animal.behavior.receipt("replacement")?.status
      );
    }
    expect(p.resumed.system.stats.planningTasks).toBe(0);
  });

  it.each(["stationary", "leaves"])("preserves the detour and cursor when the other animal %s", (traffic) => {
    const p = pair("ground");
    const bodies = p.both.map((f) => {
      const body: GroundAnimalBody = {
        motion: { x: 0, z: 6, heading: 0, speed: 0, angularSpeed: 0 },
        radius: 0.5,
        bodyLength: 1,
        desiredSpeed: 0,
        target: [0, 6],
        arrived: false,
        blocked: false,
        active: false
      };
      f.crowd.add(body);
      return body;
    });
    // Long enough to span slices, short enough for the public 60 s ground action timeout.
    start(p, 80);
    const checks = p.both.map((f) => f.edit());
    advanceTogether(p, 1);
    expect(checks[1].completed).toBe(false);
    if (traffic === "leaves") {
      p.both.forEach((f, i) => expect(f.crowd.relocate(bodies[i], 20, 6, 0)).toBe(true));
    }
    let maximumDeflection = 0;
    for (let frame = 0; frame < 6600; frame++) {
      advanceTogether(p, 1);
      maximumDeflection = Math.max(maximumDeflection, Math.abs(p.resumed.animal.position.x));
      expect(p.resumed.crowd.inspect().overlaps).toBe(0);
    }
    expect(maximumDeflection).toBeGreaterThan(1);
    expect(checks.every((task) => task.completed)).toBe(true);
    expect(p.resumed.animal.behavior.receipt("move")?.status).toBe("completed");
    expect(p.resumed.system.stats.planningTasks).toBe(0);
    p.both.forEach((f, i) => f.crowd.remove(bodies[i]));
  });
});

it("crowd snapshots exclude the subject but retain other bodies and reservations", () => {
  const crowd = new GroundAnimalCrowd();
  const body = (x: number) => ({
    motion: { x, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
    radius: 0.5,
    bodyLength: 1,
    desiredSpeed: 0,
    target: [x, 0] as const,
    arrived: false,
    blocked: false
  });
  const self = body(0),
    other = body(4);
  crowd.add(self);
  crowd.add(other);
  expect(crowd.reserve(self, 0, 4)).toBe(true);
  expect(crowd.reserve(other, 8, 0)).toBe(true);
  const query = crowd.routeQuery(self, undefined, undefined, true);
  crowd.release(self);
  crowd.remove(other);
  expect(query.canTraverse([0, 0], [0, 4])).toBe(true);
  expect(query.canTraverse([3, 0], [5, 0])).toBe(false);
  expect(query.canTraverse([7, 0], [9, 0])).toBe(false);
});
