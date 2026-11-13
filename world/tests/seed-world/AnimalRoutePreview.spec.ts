import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { GroundAnimalRecovery } from "@galacean/engine-animals/gameplay/animal/GroundAnimalRecovery";

// Exercise the real graph search, steering and preview without constructing renderers.
function fixture() {
  const canTraverse = vi.fn((_from: readonly number[], _to: readonly number[]) => true);
  const ground = {
    staticRouteQuery: () => ({ canTraverse, obstruction: () => undefined }),
    heightAt: () => 0,
    canTraverseAir: vi.fn(() => true)
  };
  const animal: any = Object.create(ConfiguredAnimal.prototype);
  Object.assign(animal, {
    options: { ground },
    config: { bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] } },
    scale: 1,
    speedMultiplier: 1,
    baseRadius: 0.5,
    motion: { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
    root: { transform: { position: { y: 0 } } },
    system: { time: 1 },
    groundSteering: {},
    airSteering: { maxAngularSpeed: 0.8, turnSpeedRatio: 0.65, arrivalRadius: 0.3 },
    canOccupy: () => true
  });
  return {
    animal,
    canTraverse,
    ground,
    prepare: (medium = "ground", target = [0, 2]) => animal.prepareRoute(target, 1, medium)
  };
}

function expectEachPreviewSegmentOnce(canTraverse: ReturnType<typeof vi.fn>) {
  // The direct graph search first checks the start, target and their connecting chord.
  const segments = canTraverse.mock.calls.slice(3).map((args) => JSON.stringify(args));
  expect(segments.length).toBeGreaterThan(1);
  expect(new Set(segments).size).toBe(segments.length);
}

afterEach(() => vi.restoreAllMocks());

describe("animal route preview support reuse", () => {
  it.each(["ground", "water", "air"])("checks each unchanged %s preview segment once", (medium) => {
    const { animal, prepare, canTraverse, ground } = fixture();
    const before = { ...animal.motion };
    expect(prepare(medium)).toBe(true);
    expect(animal.preparedRoute.points).toEqual([[0, 2]]);
    expect(animal.motion).toEqual(before);
    expectEachPreviewSegmentOnce(canTraverse);
    if (medium === "air") expect(ground.canTraverseAir).toHaveBeenCalled();
  });

  it.each(["x", "z"] as const)("rechecks and rejects recovery that changes only %s into an obstacle", (axis) => {
    const { animal, prepare, canTraverse } = fixture();
    vi.spyOn(GroundAnimalRecovery.prototype, "recovering", "get").mockReturnValue(true);
    vi.spyOn(GroundAnimalRecovery.prototype, "advance").mockImplementation((_from, proposed) => {
      proposed[axis] = 99;
      return true;
    });
    canTraverse.mockImplementation((_from, to) => to[axis === "x" ? 0 : 1] !== 99);
    expect(prepare()).toBe(false);
    expect(canTraverse.mock.lastCall![1][axis === "x" ? 0 : 1]).toBe(99);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("accepts a supported recovery even when the original forward step was unsupported", () => {
    const { prepare, canTraverse } = fixture();
    canTraverse.mockImplementation((_from, to) => to[1] === 0 || to[1] === 2);
    const recovery = vi.spyOn(GroundAnimalRecovery.prototype, "advance").mockImplementation((_from, proposed) => {
      proposed.x = 0;
      proposed.z = 2;
      return true;
    });
    expect(prepare()).toBe(true);
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(canTraverse.mock.calls.some(([from, to]) => from[1] === 0 && to[1] > 0 && to[1] < 2)).toBe(true);
  });

  it("reuses forward support after a failed recovery restores the original proposal", () => {
    const { prepare, canTraverse } = fixture();
    vi.spyOn(GroundAnimalRecovery.prototype, "recovering", "get").mockReturnValue(true);
    const recovery = vi.spyOn(GroundAnimalRecovery.prototype, "advance").mockImplementation((_from, proposed) => {
      proposed.x = 99;
      return false;
    });
    expect(prepare()).toBe(true);
    expect(recovery).toHaveBeenCalled();
    expectEachPreviewSegmentOnce(canTraverse);
  });

  it("does not turn an unsupported unchanged proposal into a reachable route", () => {
    const { animal, prepare, canTraverse } = fixture();
    canTraverse.mockImplementation((_from, to) => to[1] === 0 || to[1] === 2);
    vi.spyOn(GroundAnimalRecovery.prototype, "advance").mockReturnValue(false);
    expect(prepare()).toBe(false);
    expect(animal.preparedRoute).toBeUndefined();
    expect(canTraverse).toHaveBeenCalledTimes(4);
  });

  it("retains real backward-arc recovery for a nearby goal behind the animal", () => {
    const { animal, prepare } = fixture();
    const recovery = vi.spyOn(GroundAnimalRecovery.prototype, "advance");
    expect(prepare("ground", [0, -0.5])).toBe(true);
    expect(recovery).toHaveBeenCalled();
    expect(animal.preparedRoute.points).toEqual([[0, -0.5]]);
    expect(animal.motion).toEqual({ x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 });
  });

  it("still rejects a clear horizontal flight route when its vertical sweep is blocked", () => {
    const { animal, prepare, ground } = fixture();
    ground.canTraverseAir.mockReturnValue(false);
    expect(prepare("air")).toBe(false);
    expect(ground.canTraverseAir).toHaveBeenCalledTimes(1);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("does not retain support results across world updates", () => {
    const { animal, prepare, canTraverse } = fixture();
    expect(prepare()).toBe(true);
    animal.system.time++;
    canTraverse.mockReturnValue(false);
    expect(prepare()).toBe(false);
    expect(animal.preparedRoute).toBeUndefined();
  });
});
