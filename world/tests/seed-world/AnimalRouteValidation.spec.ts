import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { GroundAnimalRecovery } from "@galacean/engine-animals/gameplay/animal/GroundAnimalRecovery";
import type { AnimalRoutePoint } from "@galacean/engine-animals/gameplay/animal/AnimalStaticRoute";

function animalWithSupport(support: (from: AnimalRoutePoint, to: AnimalRoutePoint) => boolean) {
  const canTraverse = vi.fn(support);
  const animal = Object.assign(Object.create(ConfiguredAnimal.prototype), {
    canOccupy: () => true,
    options: { ground: { staticRouteQuery: () => ({ canTraverse, obstruction: () => undefined }) } },
    config: { bounds: { min: [0, 0, 0], max: [1, 1, 1] } },
    motion: { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 },
    root: { transform: { position: { x: 0, y: 0, z: 0 } } },
    groundSteering: { maxAngularSpeed: 0.3, turnSpeedRatio: 0.5, arrivalRadius: 0.1 },
    airSteering: { maxAngularSpeed: 0.8, turnSpeedRatio: 0.65, arrivalRadius: 0.1 },
    destination: [0, 0],
    scale: 1,
    speedMultiplier: 1,
    baseRadius: 0.25,
    system: { time: 0 }
  });
  return { animal, canTraverse };
}

afterEach(() => vi.restoreAllMocks());

describe("animal route prediction support", () => {
  it("checks each unchanged predicted segment once and preserves the requested destination", () => {
    const { animal, canTraverse } = animalWithSupport(() => true);
    expect(animal.prepareRoute([0, 6], 2, "ground")).toBe(true);
    expect(animal.preparedRoute.points).toEqual([[0, 6]]);
    const segments = canTraverse.mock.calls.filter(([from, to]) => {
      const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
      return distance > 0 && distance < 1;
    });
    expect(segments.length).toBeGreaterThan(10);
    expect(new Set(segments.map((segment) => JSON.stringify(segment))).size).toBe(segments.length);
  });

  it("rejects an unsupported predicted step even when the waypoint chord is clear", () => {
    const { animal } = animalWithSupport((from, to) => {
      const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
      return distance === 0 || distance > 1 || to[1] <= 1;
    });
    expect(animal.prepareRoute([0, 6], 2, "air")).toBe(false);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("validates the changed recovery segment instead of reusing forward support", () => {
    const recovery = vi.spyOn(GroundAnimalRecovery.prototype, "advance").mockImplementation((_current, proposed) => {
      proposed.x = 20;
      proposed.z = 20;
      return true;
    });
    const { animal, canTraverse } = animalWithSupport((_from, to) => to[0] !== 20);
    expect(animal.prepareRoute([0, -0.5], 2, "ground")).toBe(false);
    expect(recovery).toHaveBeenCalled();
    expect(canTraverse).toHaveBeenCalledWith([0, 0], [20, 20]);
  });

  it("rechecks support for a new prediction after the world changes", () => {
    let supported = true;
    const { animal } = animalWithSupport(() => supported);
    expect(animal.prepareRoute([0, 6], 2, "ground")).toBe(true);
    animal.preparedRoute = undefined;
    supported = false;
    expect(animal.prepareRoute([0, 6], 2, "ground")).toBe(false);
  });
});
