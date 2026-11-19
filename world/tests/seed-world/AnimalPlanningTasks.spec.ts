import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalSystem } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import { finishAnimalPlanningTask } from "@galacean/engine-animals/gameplay/animal/AnimalPlanningTask";
import {
  createAnimalStaticRouteTask,
  planAnimalStaticRoute
} from "@galacean/engine-animals/gameplay/animal/AnimalStaticRoute";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { GroundAnimalCrowd } from "@galacean/engine-animals/gameplay/animal/GroundAnimalCrowd";
import {
  AnimalTaskController,
  type AnimalTaskProfile
} from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";

afterEach(() => vi.restoreAllMocks());

function agent(system: AnimalSystem) {
  const owner = {
    evaluateBehavior() {},
    advanceMotion() {},
    dispose() {
      system.remove(owner);
    }
  };
  system.register(owner);
  return owner;
}

describe("shared animal planning budget", () => {
  it("keeps each frame slice together and rotates unfinished tasks fairly", () => {
    const system = new AnimalSystem(32, 1000, 3);
    const calls: string[] = [],
      results: string[] = [];
    for (const id of ["a", "b"]) {
      system.plan(
        agent(system),
        (function* () {
          for (let i = 0; i < 3; i++) {
            calls.push(`${id}${i}`);
            yield;
          }
          return id;
        })(),
        (value) => results.push(value)
      );
    }
    expect(calls).toEqual([]);
    system.update(1 / 60);
    expect(calls).toEqual(["a0", "a1", "a2"]);
    expect(results).toEqual([]);
    system.update(1 / 60);
    expect(calls).toEqual(["a0", "a1", "a2", "b0", "b1", "b2"]);
    system.update(1 / 60);
    expect(results).toEqual(["a", "b"]);
    expect(system.stats.planningTasks).toBe(0);
  });

  it("observes the time budget between atomic steps and freezes work at zero simulation time", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const system = new AnimalSystem(32, 2, 100);
    let count = 0;
    system.plan(
      agent(system),
      (function* () {
        while (count < 10) {
          count++;
          now++;
          yield;
        }
      })(),
      () => {}
    );
    system.update(0);
    expect(count).toBe(0);
    system.update(1 / 60);
    expect(count).toBe(2);
    expect(system.stats.lastPlanningMilliseconds).toBe(2);
  });

  it("finishes short pose-dependent tasks within one frame instead of interleaving moving origins", () => {
    const system = new AnimalSystem(32, 1000, 8);
    const finished: { id: number; elapsed: number }[] = [];
    for (let i = 0; i < 4; i++) {
      system.plan(
        agent(system),
        (function* () {
          const start = system.time;
          for (let j = 0; j < 5; j++) yield;
          return { id: i, elapsed: system.time - start };
        })(),
        (value) => finished.push(value)
      );
    }
    system.update(1 / 60);
    expect(finished).toEqual([{ id: 0, elapsed: 0 }]);
    system.update(1 / 60);
    system.update(1 / 60);
    expect(finished.map((entry) => entry.id)).toEqual([0, 2, 1, 3]);
    expect(system.stats.planningTasks).toBe(0);
  });

  it("pauses disabled owners and releases cancelled/disposed tasks without late callbacks", () => {
    const system = new AnimalSystem(32, 1000, 1),
      owner = agent(system);
    const finished = vi.fn(),
      closed = vi.fn();
    const cancel = system.plan(
      owner,
      (function* () {
        try {
          yield;
          yield;
          return true;
        } finally {
          closed();
        }
      })(),
      finished
    );
    system.update(1 / 60);
    system.setActive(owner, false);
    system.update(1 / 60);
    expect(system.stats.lastPlanningSteps).toBe(0);
    system.setActive(owner, true);
    system.update(1 / 60);
    cancel();
    cancel();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(finished).not.toHaveBeenCalled();
    system.plan(
      owner,
      (function* () {
        yield;
        return true;
      })(),
      finished
    );
    system.dispose();
    expect(system.stats.planningTasks).toBe(0);
    expect(finished).not.toHaveBeenCalled();
  });

  it("handles owner removal during a query without returning into an executing generator", () => {
    const system = new AnimalSystem(32, 1000, 8),
      owner = agent(system),
      closed = vi.fn(),
      finished = vi.fn();
    system.plan(
      owner,
      (function* () {
        try {
          system.remove(owner);
          yield;
          return true;
        } finally {
          closed();
        }
      })(),
      finished
    );
    system.update(1 / 60);
    expect(closed).toHaveBeenCalledOnce();
    expect(finished).not.toHaveBeenCalled();
    expect(system.stats.planningTasks).toBe(0);
  });
});

function preview(support: (from: readonly number[], to: readonly number[]) => boolean = () => true) {
  return Object.assign(Object.create(ConfiguredAnimal.prototype), {
    canOccupy: () => true,
    options: { ground: { staticRouteQuery: () => ({ canTraverse: support, obstruction: () => undefined }) } },
    config: { bounds: { min: [0, 0, 0], max: [1, 1, 1] } },
    motion: { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
    root: { transform: { position: { x: 0, y: 0, z: 0 } } },
    groundSteering: { maxAngularSpeed: 0.3, turnSpeedRatio: 0.5, arrivalRadius: 0.1 },
    airSteering: { maxAngularSpeed: 0.8, turnSpeedRatio: 0.65, arrivalRadius: 0.1 },
    scale: 1,
    speedMultiplier: 1,
    baseRadius: 0.25,
    system: { time: 0 },
    planningRevision: 0
  });
}

describe("resumable route computation", () => {
  it("lets an escaping animal turn out of a braking margin with forward strides and no contact", () => {
    const crowd = new GroundAnimalCrowd();
    const actor = {
      motion: { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
      radius: 0.5, bodyLength: 1, desiredSpeed: 2, target: [-4, 1] as const,
      arrived: false, blocked: false, steering: { urgent: true, maxAngularSpeed: 2.4, turnSpeedRatio: 0.65 }
    };
    const obstacle = { ...actor, motion: { ...actor.motion, x: 1.04, z: 0.25 }, desiredSpeed: 0 };
    crowd.add(actor);
    crowd.add(obstacle);
    for (let i = 0; i < 120; i++) {
      const { x, z } = actor.motion;
      crowd.advance(1 / 60);
      const dx = actor.motion.x - x, dz = actor.motion.z - z;
      expect(dx * Math.sin(actor.motion.heading) + dz * Math.cos(actor.motion.heading)).toBeGreaterThanOrEqual(-1e-8);
      expect(Math.hypot(actor.motion.x - obstacle.motion.x, actor.motion.z - obstacle.motion.z)).toBeGreaterThan(1);
    }
    expect(actor.motion.x).toBeLessThan(-1);
  });

  it("captures traffic geometry for a suspended search while live movement sees current bodies", () => {
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
    const subject = body(0),
      obstacle = body(4);
    crowd.add(subject);
    crowd.add(obstacle);
    const snapshot = crowd.routeQuery(subject, undefined, undefined, true);
    const live = crowd.routeQuery(subject);
    expect(snapshot.canTraverse([0, 0], [8, 0])).toBe(false);
    crowd.remove(obstacle);
    obstacle.motion.z = 20;
    crowd.add(obstacle);
    expect(snapshot.canTraverse([0, 0], [8, 0])).toBe(false);
    expect(live.canTraverse([0, 0], [8, 0])).toBe(true);
  });
  it("preserves A* discovery order and route when resumed one operation at a time", () => {
    const calls: unknown[] = [];
    const query = {
      canTraverse(from: readonly number[], to: readonly number[]) {
        calls.push([from, to]);
        return from[1] !== 0 || to[1] !== 0 || from[0] === to[0];
      },
      obstruction: () => ({
        key: 1,
        corners: [
          [1, 2],
          [3, 2]
        ] as const
      })
    };
    const expected = planAnimalStaticRoute([0, 0], [4, 0], query),
      trace = structuredClone(calls);
    calls.length = 0;
    const task = createAnimalStaticRouteTask([0, 0], [4, 0], query);
    let result = task.next(),
      yields = 0;
    while (!result.done) {
      yields++;
      result = task.next();
    }
    expect(yields).toBeGreaterThan(5);
    expect(result.value).toEqual(expected);
    expect(expected?.at(-1)).toEqual([4, 0]);
    expect(calls).toEqual(trace);
  });

  it.each(["ground", "water", "air"])(
    "preserves %s trajectory validation and publishes only a completed route",
    (medium) => {
      const calls: unknown[] = [];
      const animal = preview((a, b) => {
        calls.push([[...a], [...b]]);
        return true;
      });
      expect(animal.prepareRoute([0, 6], 2, medium)).toBe(true);
      const expected = structuredClone(animal.preparedRoute),
        trace = structuredClone(calls);
      animal.preparedRoute = undefined;
      calls.length = 0;
      const task = animal.createRouteTask([0, 6], 2, medium);
      let step = task.next(),
        yields = 0;
      while (!step.done) {
        expect(animal.preparedRoute).toBeUndefined();
        yields++;
        step = task.next();
      }
      expect(yields).toBeGreaterThan(10);
      expect(step.value).toBe(true);
      expect(animal.preparedRoute).toEqual(expected);
      expect(calls).toEqual(trace);
    }
  );

  it("restarts after world edits and never publishes a route validated against the old support", () => {
    let supported = true;
    const animal = preview(() => supported),
      task = animal.createRouteTask([0, 6], 2, "ground");
    for (let i = 0; i < 12; i++) expect(task.next().done).toBe(false);
    supported = false;
    animal.planningRevision++;
    expect(finishAnimalPlanningTask(task)).toBe(false);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("restarts a moved start and discards cancelled trajectory state", () => {
    const animal = preview(),
      task = animal.createRouteTask([0, 6], 2, "ground");
    for (let i = 0; i < 12; i++) task.next();
    animal.motion.z = 1;
    expect(finishAnimalPlanningTask(task)).toBe(true);
    expect(animal.preparedRoute.from.z).toBe(1);
    animal.preparedRoute = undefined;
    const cancelled = animal.createRouteTask([0, 8], 2, "ground");
    for (let i = 0; i < 12; i++) cancelled.next();
    cancelled.return(false);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("retains an already advanced live route cursor when revalidation finishes after movement", () => {
    const animal = preview();
    expect(animal.prepareRoute([0, 200], 2, "ground")).toBe(true);
    const route = (animal.route = animal.preparedRoute);
    route.points.unshift([0, -10]);
    route.cursor = 1;
    route.invalidated = true;
    animal.preparedRoute = undefined;
    const intent = (animal.movementIntent = { started: true });
    animal.velocity = 2;
    animal.movementMedium = "ground";
    const task = animal.createRouteTask([0, 200], 2, "ground", undefined, false, intent);
    for (let i = 0; i < 512; i++) expect(task.next().done).toBe(false);
    animal.motion.z = 1;
    expect(finishAnimalPlanningTask(task)).toBe(true);
    expect(animal.preparedRoute.points).toBe(route.points);
    expect(animal.preparedRoute.cursor).toBe(1);
    expect(animal.preparedRoute.invalidated).toBe(false);
  });

  it.each(["different waypoints", "replaced route"])("requires a fresh pose for %s", (change) => {
    const animal = preview();
    expect(animal.prepareRoute([0, 200], 2, "ground")).toBe(true);
    animal.route = animal.preparedRoute;
    animal.preparedRoute = undefined;
    if (change === "different waypoints") animal.route.points.unshift([10, 100]);
    const validate = vi.spyOn(animal, "validateRouteSteps");
    const intent = (animal.movementIntent = { started: true });
    animal.velocity = 2;
    animal.movementMedium = "ground";
    const task = animal.createRouteTask([0, 200], 2, "ground", undefined, false, intent);
    for (let i = 0; i < 512; i++) expect(task.next().done).toBe(false);
    if (change === "replaced route") animal.route = { ...animal.route };
    animal.motion.z = 1;
    expect(finishAnimalPlanningTask(task)).toBe(true);
    if (change === "different waypoints") expect(animal.preparedRoute.from.z).toBe(1);
    else {
      expect(validate).toHaveBeenCalledTimes(2);
      expect((validate.mock.calls[1][6] as { z: number }).z).toBe(1);
    }
  });

  it("rejects failed long revalidation even though the same live route keeps advancing", () => {
    const animal = preview();
    expect(animal.prepareRoute([0, 200], 2, "ground")).toBe(true);
    animal.route = animal.preparedRoute;
    animal.preparedRoute = undefined;
    const intent = (animal.movementIntent = { started: true });
    animal.velocity = 2;
    animal.movementMedium = "ground";
    // Preserve search, but model a curved preview finding a later obstruction.
    const validate = vi.spyOn(animal, "validateRouteSteps").mockImplementation(function* () {
      for (let i = 0; i < 1000; i++) yield;
      return false;
    });
    const task = animal.createRouteTask([0, 200], 2, "ground", undefined, false, intent);
    let step = task.next();
    for (let frame = 0; frame < 5 && !step.done; frame++) {
      animal.motion.z += 1;
      for (let i = 0; i < 512 && !step.done; i++) step = task.next();
    }
    expect(step).toEqual({ done: true, value: false });
    expect(validate).toHaveBeenCalledOnce();
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("binds the latest heading after A* without repeating the static search", () => {
    const support = vi.fn(() => true);
    const animal = preview(support),
      task = animal.createRouteTask([0, 6], 2, "ground");
    task.next();
    animal.motion.heading = 0.1;
    expect(finishAnimalPlanningTask(task)).toBe(true);
    expect(animal.preparedRoute.from.heading).toBe(0.1);
    expect(support.mock.calls.filter(([a, b]: any) => a[1] === 0 && b[1] === 6)).toHaveLength(1);
  });

  it("retains static waypoints after motion but validates every new trajectory segment", () => {
    const support = vi.fn((_a: readonly number[], _b: readonly number[]) => true);
    const animal = preview(support),
      task = animal.createRouteTask([0, 6], 2, "ground");
    for (let i = 0; i < 12; i++) task.next();
    animal.motion.z = 1;
    const before = support.mock.calls.length;
    expect(finishAnimalPlanningTask(task)).toBe(true);
    expect(animal.preparedRoute.from.z).toBe(1);
    // No second A* chord. The actual turning trajectory still checks its new departure.
    expect(support.mock.calls.filter(([a, b]) => a[1] === 0 && b[1] === 6)).toHaveLength(1);
    expect(support.mock.calls.filter(([a, b]) => a[1] === 1 && b[1] === 6)).toHaveLength(0);
    expect(support.mock.calls.slice(before).some(([a, b]) => a[1] === 1 && b[1] > 1)).toBe(true);
  });

  it("falls back to a fresh search when the retained candidate cannot be entered from the moved start", () => {
    const support = vi.fn((_a: readonly number[], _b: readonly number[]) => true);
    const animal = preview(support),
      task = animal.createRouteTask([0, 6], 2, "ground");
    for (let i = 0; i < 12; i++) task.next();
    animal.motion.z = 1;
    // A failed exact validation is not evidence that every route from the new start fails.
    vi.spyOn(animal, "validateRouteSteps").mockImplementationOnce(function* () {
      return false;
    });
    expect(finishAnimalPlanningTask(task)).toBe(true);
    expect(support.mock.calls.some(([a, b]) => a[1] === 1 && b[1] === 6)).toBe(true);
    expect(animal.preparedRoute.from.z).toBe(1);
  });

  it("discards retained waypoints on edits even after the origin has moved", () => {
    let supported = true;
    const animal = preview(() => supported),
      task = animal.createRouteTask([0, 6], 2, "ground");
    for (let i = 0; i < 12; i++) task.next();
    animal.motion.z = 1;
    supported = false;
    animal.planningRevision++;
    expect(finishAnimalPlanningTask(task)).toBe(false);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("captures current traffic for a restarted trajectory rather than reusing its old clearance", () => {
    const animal = preview();
    let blocked = false;
    animal.crowdBody = {};
    animal.options.ground.heightAt = () => 0;
    animal.crowd = {
      acquireRouteQuery: vi.fn(() => {
        const clear = !blocked;
        return { canTraverse: () => clear, obstruction: () => undefined, release() {} };
      })
    };
    const task = animal.createRouteTask([0, 6], 2, "ground");
    for (let i = 0; i < 12; i++) task.next();
    animal.motion.z = 1;
    animal.system.time++;
    blocked = true;
    expect(finishAnimalPlanningTask(task)).toBe(false);
    expect(animal.crowd.acquireRouteQuery.mock.calls.length).toBeGreaterThan(1);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("commits coarse motion before accepting a completed preview", () => {
    const animal = preview();
    let synchronizations = 0;
    animal.system.synchronizeMotion = () => {
      if (++synchronizations === 2) animal.motion.z = 1;
    };
    expect(finishAnimalPlanningTask(animal.createRouteTask([0, 6], 2, "ground"))).toBe(true);
    expect(synchronizations).toBe(4);
    expect(animal.preparedRoute.from.z).toBe(1);
  });
});

describe("behavior awaiting planning", () => {
  it("retries a blocked escape before a long idle clip ends, even after the first replan fails", () => {
    const system = new AnimalSystem(), owner = agent(system);
    const resolveTarget = vi.fn(() => system.time < 1 ? [0, 12] as const : system.time < 2 ? null : [4, 14] as const);
    const moveTo = vi.fn((_point: readonly [number, number]) => () => {});
    const controller = new AnimalTaskController({
      defaultSkill: "rest",
      skills: {
        rest: { label: "Rest", tree: { type: "action", name: "animate", params: { slot: "idle" } } },
        escape: { label: "Escape", tree: { type: "action", name: "move", params: {
          slot: "run", urgent: true, replanBlockedSeconds: 1, target: { query: "flee" }
        } } }
      },
      reactions: { shoo: { skillId: "escape" } },
      animationSlots: { idle: [{ clip: "idle", weight: 1 }], run: [{ clip: "run", weight: 1 }] },
      movementSpeeds: { run: 4 }
    }, {
      get time() { return system.time; }, wake() {}, schedule: (seconds, fn) => system.schedule(seconds, fn, owner),
      movementBlocked: () => true, resolveTarget, moveTo, play: () => 12
    });
    controller.notify({ id: "click", type: "shoo", source: [0, 0] });
    controller.tick();
    for (let i = 0; i < 150; i++) { system.update(1 / 60); controller.tick(); }
    expect(moveTo.mock.calls.map(([point]) => point)).toEqual([[0, 12], [4, 14]]);
    controller.dispose();
    system.dispose();
  });

  it("keeps a click's threat through a failed search and a later invalidated escape route", () => {
    const system = new AnimalSystem(), owner = agent(system);
    const event = { id: "click", type: "shoo", source: [0, 1] as const };
    const position = { x: 0, z: 3 };
    const resolveTarget = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([0, 12])
      .mockReturnValue([2, 16]);
    const moveTo = vi.fn((_point: readonly number[], _speed: number, _finish: (success: boolean) => void) => () => {});
    const controller = new AnimalTaskController({
      defaultSkill: "rest",
      skills: {
        rest: { label: "Idle", tree: { type: "action", name: "animate", params: { slot: "idle" } } },
        escape: { label: "Escape", tree: { type: "action", name: "move", params: { slot: "run", urgent: true, target: { query: "flee" } } } }
      },
      reactions: { shoo: { skillId: "escape" } },
      animationSlots: { idle: [{ clip: "idle", weight: 1 }], run: [{ clip: "run", weight: 1 }] },
      movementSpeeds: { run: 4 }
    }, {
      get time() { return system.time; }, wake() {}, schedule: (seconds, fn) => system.schedule(seconds, fn, owner),
      position, resolveTarget, moveTo, play: () => 5
    });
    const advance = (frames: number) => {
      for (let i = 0; i < frames; i++) { system.update(1 / 60); controller.tick(); }
    };
    expect(controller.notify(event)).toBe(true);
    advance(10);
    expect(resolveTarget).toHaveBeenCalledTimes(2);
    expect(moveTo).not.toHaveBeenCalled();
    advance(10);
    expect(moveTo.mock.calls[0][0]).toEqual([0, 12]);
    moveTo.mock.calls[0][2](false);
    advance(20);
    expect(moveTo.mock.calls[1][0]).toEqual([2, 16]);
    expect(resolveTarget.mock.calls.every(([, threat]) => threat?.id === event.id)).toBe(true);
    expect(controller.inspect().reaction).toBe("shoo");
    position.z = 4;
    moveTo.mock.calls[1][2](true);
    advance(20);
    expect(moveTo).toHaveBeenCalledTimes(3);
    expect(controller.inspect().reaction).toBe("shoo");
    position.z = 8;
    moveTo.mock.calls[2][2](true);
    advance(1);
    expect(controller.inspect().reaction).toBeNull();
    controller.dispose();
    system.dispose();
  });

  it("loops idle instead of freezing when shooed with no reachable escape path and exits after bounded retries", () => {
    const system = new AnimalSystem(), owner = agent(system);
    const played: string[] = [];
    let endCallback: (() => void) | undefined;
    const moveTo = vi.fn(() => () => {});
    const controller = new AnimalTaskController({
      defaultSkill: "rest",
      skills: {
        rest: { label: "Idle", tree: { type: "action", name: "animate", params: { slot: "idle" } } },
        escape: { label: "Escape", tree: { type: "action", name: "move", params: { slot: "run", urgent: true, target: { query: "flee" } } } }
      },
      reactions: { shoo: { skillId: "escape" } },
      animationSlots: { idle: [{ clip: "idle", weight: 1 }], run: [{ clip: "run", weight: 1 }] },
      movementSpeeds: { run: 4 }
    }, {
      get time() { return system.time; },
      wake() {},
      schedule: (seconds, fn) => system.schedule(seconds, fn, owner),
      position: { x: 0, z: 3 },
      resolveTarget: () => null,
      moveTo,
      play: (clip) => { played.push(clip); return 1; },
      onAnimationEnd: (cb) => {
        endCallback = cb;
        return () => { if (endCallback === cb) endCallback = undefined; };
      }
    });
    const advance = (frames: number) => {
      for (let i = 0; i < frames; i++) { system.update(1 / 60); controller.tick(); }
    };
    expect(controller.notify({ id: "click", type: "shoo", source: [0, 1] })).toBe(true);
    advance(2);
    // Must immediately play idle with an active animation-end handler rather than holding a dead frame.
    expect(played).toEqual(["idle"]);
    expect(endCallback).toBeDefined();
    expect(moveTo).not.toHaveBeenCalled();
    // Completing the waiting idle clip must loop idle rather than freezing.
    endCallback?.();
    expect(played).toEqual(["idle", "idle"]);
    // After bounded consecutive escape failures (~6.5s), recover cleanly back to autonomous behavior (not stuck 60s).
    advance(500);
    expect(controller.inspect().reaction).toBeNull();
    expect(controller.inspect().branch).toBe("default:rest");
    controller.dispose();
    system.dispose();
  });

  function fixture(repeated = false) {
    const system = new AnimalSystem(32, 1000, 1),
      owner = agent(system);
    let queries = 0,
      revision = 0,
      checks = 0;
    const move = vi.fn(() => () => {});
    const profile: AnimalTaskProfile = {
      defaultSkill: "wander",
      skills: {
        wander: {
          label: "Wander",
          tree: {
            type: "action",
            name: "move",
            params: { slot: "walk", target: { query: "wander" } }
          }
        }
      },
      animationSlots: { walk: [{ clip: "walk", weight: 1 }], idle: [{ clip: "idle", weight: 1 }] },
      movementSpeeds: { walk: 1 },
      reactions: {}
    };
    const controller = new AnimalTaskController(profile, {
      get time() {
        return system.time;
      },
      get planningRevision() {
        return revision;
      },
      wake() {},
      schedule: (seconds, fn) => system.schedule(seconds, fn, owner),
      plan: (task, finish) => system.plan(owner, task, finish),
      planMoveTo: function* (point) {
        checks++;
        for (let i = 0; i < 10; i++) yield;
        return revision > 0 || (repeated ? checks > 1 : point[0] === 2);
      },
      resolveTarget: () => {
        queries++;
        return [repeated ? 1 : queries, 5];
      },
      play: () => 10,
      moveTo: move
    });
    return {
      system,
      controller,
      move,
      queries: () => queries,
      editWorld: () => {
        revision++;
        queries = 0;
      }
    };
  }

  it("does not treat pending work as failure or redraw a target on each wake", () => {
    const f = fixture();
    f.controller.tick();
    for (let i = 0; i < 8; i++) {
      f.system.update(1 / 60);
      f.controller.tick();
    }
    expect(f.queries()).toBe(1);
    expect(f.move).not.toHaveBeenCalled();
    for (let i = 0; i < 40 && !f.move.mock.calls.length; i++) {
      f.system.update(1 / 60);
      f.controller.tick();
    }
    expect(f.queries()).toBe(2);
    expect(f.move.mock.calls[0][0]).toEqual([2, 5]);
  });

  it("expires rejected endpoints after suspension advances simulation time", () => {
    const f = fixture(true);
    f.controller.tick();
    for (let i = 0; i < 50 && !f.move.mock.calls.length; i++) {
      f.system.update(1 / 60);
      f.controller.tick();
    }
    expect(f.queries()).toBe(2);
    expect(f.move.mock.calls[0][0]).toEqual([1, 5]);
  });

  it("restarts candidate selection after a world edit without accepting the old search", () => {
    const f = fixture();
    f.controller.tick();
    for (let i = 0; i < 8; i++) f.system.update(1 / 60);
    expect(f.queries()).toBe(1);
    f.editWorld();
    for (let i = 0; i < 40 && !f.move.mock.calls.length; i++) {
      f.system.update(1 / 60);
      f.controller.tick();
    }
    expect(f.queries()).toBe(1);
    expect(f.move.mock.calls[0][0]).toEqual([1, 5]);
  });

  it("cancels pending planning when a new command replaces the action", () => {
    const f = fixture();
    f.controller.execute({ requestId: "first", skillId: "wander" });
    f.controller.tick();
    for (let i = 0; i < 8; i++) f.system.update(1 / 60);
    f.controller.execute({ requestId: "second", skillId: "wander" });
    expect(f.system.stats.planningTasks).toBe(0);
    expect(f.controller.receipt("first")?.status).toBe("cancelled");
    f.controller.tick();
    expect(f.system.stats.planningTasks).toBe(1);
    for (let i = 0; i < 40 && !f.move.mock.calls.length; i++) {
      f.system.update(1 / 60);
      f.controller.tick();
    }
    expect(f.move).toHaveBeenCalledTimes(1);
    expect(f.move.mock.calls[0][0]).toEqual([2, 5]);
  });

  it("cancels the candidate search when the behavior is disposed", () => {
    const f = fixture();
    f.controller.tick();
    f.system.update(1 / 60);
    f.controller.dispose();
    for (let i = 0; i < 40; i++) f.system.update(1 / 60);
    expect(f.move).not.toHaveBeenCalled();
    expect(f.system.stats.planningTasks).toBe(0);
  });
});
