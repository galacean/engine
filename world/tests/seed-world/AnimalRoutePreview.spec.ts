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

it.each([-1, 1])("keeps recovery travel forward throughout a turn in direction %i", (direction) => {
  const recovery = new GroundAnimalRecovery();
  const motion = { x: 5, z: -3, heading: Math.PI - 0.15, speed: 1, angularSpeed: 0 };
  const initialHeading = motion.heading;
  const proposed = { ...motion, heading: motion.heading + direction * 0.01 };
  for (let frame = 0; frame < 120; frame++) {
    expect(recovery.advance(motion, proposed, 1, 1, 0.1, () => true)).toBe(true);
    if (!recovery.recovering) break;
    const dx = proposed.x - motion.x,
      dz = proposed.z - motion.z;
    expect(dx * Math.sin(motion.heading) + dz * Math.cos(motion.heading)).toBeGreaterThan(0);
    Object.assign(motion, proposed);
  }
  expect(recovery.recovering).toBe(false);
  expect(motion.heading - initialHeading).toBeCloseTo((direction * Math.PI) / 2);
});

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

  it("can reach a nearby rearward goal with a forward turn", () => {
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

  it("requires room for the whole bird at the landing and throughout the turn", () => {
    const { animal, prepare, ground } = fixture();
    const bounds = { x: 0, z: 0, radius: 2.4 };
    Object.assign(ground, { flightBounds: bounds });
    expect(prepare("air", [0, 2])).toBe(false);
    expect(prepare("air", [0, 1])).toBe(true);
    // Both centres fit; a bird facing outward cannot make this return turn.
    animal.motion.z = 1.89;
    expect(prepare("air", [0, -1])).toBe(false);
  });

  it("releases blocked air guidance and points recovery back into the birth disk", () => {
    const { animal, ground } = fixture();
    Object.assign(ground, { flightBounds: { x: 0, z: 0, radius: 32 } });
    Object.assign(animal, {
      movementMedium: "air",
      velocity: 6,
      destination: [0, 31],
      nextFlightProbe: 2,
      route: { cursor: 0, points: [[0, 31]] },
      updateCrowdIntent: vi.fn()
    });
    animal.motion.z = 29;
    animal.continueFlight();
    expect(animal.flightNeedsReplan).toBe(true);
    expect(animal.movementTarget).toBe(animal.continuationTarget);
    expect(animal.movementTarget[1]).toBeLessThan(animal.motion.z);
    for (let i = 0; i < 150; i++) animal.turnBlockedFlight(1 / 60);
    expect(Math.cos(animal.motion.heading)).toBeLessThan(0);
    expect(animal.motion.z).toBe(29);
  });

  it("can recover by descending onto a supported unoccupied footprint with a clear vertical path", () => {
    const { animal, ground } = fixture();
    const canTraverse = vi.fn(() => true);
    Object.assign(ground, { canTraverse });
    Object.assign(animal, { flightNeedsReplan: true, movementMedium: "air", velocity: 6 });
    Object.assign(animal.root.transform.position, { x: 0, y: 4, z: 0 });
    expect(animal.checkFlightPath([0, 0], 6, "ground")).toBe(true);
    expect(ground.canTraverseAir).toHaveBeenCalledWith({ x: 0, y: 4, z: 0 }, { x: 0, y: 0, z: 0 }, 0.5, 1);
    ground.canTraverseAir.mockReturnValue(false);
    expect(animal.checkFlightPath([0, 0], 6, "ground")).toBe(false);
    ground.canTraverseAir.mockReturnValue(true);
    canTraverse.mockReturnValue(false);
    expect(animal.checkFlightPath([0, 0], 6, "water")).toBe(false);
    canTraverse.mockReturnValue(true);
    animal.canOccupy = () => false;
    expect(animal.checkFlightPath([0, 0], 6, "ground")).toBe(false);
  });

  it("does not retain support results across world updates", () => {
    const { animal, prepare, canTraverse } = fixture();
    expect(prepare()).toBe(true);
    animal.system.time++;
    canTraverse.mockReturnValue(false);
    expect(prepare()).toBe(false);
    expect(animal.preparedRoute).toBeUndefined();
  });

  it("rotates blocked airborne continuationTarget away from interior obstacles instead of freezing", () => {
    const { animal, ground } = fixture();
    // Block the front (+Z) and right (+X, +90° turn) half-space; only left (-X) and rear (-Z) are open.
    ground.canTraverse = vi.fn(() => true);
    ground.canTraverseAir = vi.fn((_from, to) => to.x < -0.1 || to.z < -0.1);
    Object.assign(animal, {
      movementMedium: "air",
      velocity: 6,
      destination: [0, 30],
      surfaceBlocked: true,
      nextFlightProbe: 2,
      updateCrowdIntent: vi.fn()
    });
    animal.motion.heading = 0; // facing +Z into the obstacle
    animal.continueFlight();
    // Must pick an actually clear escape heading (left/-X) rather than blindly turning +90° into the wall.
    expect(animal.continuationTarget[0]).toBeLessThan(0);

    // Even if a pre-existing continuationTarget becomes blocked while the bird is aligned with it,
    // continueFlight must re-pick a clear escape direction instead of staying locked forever.
    animal.continuationTarget = [25, 0];
    animal.motion.heading = Math.PI / 2; // aligned with blocked +X target
    animal.continueFlight();
    expect(animal.continuationTarget[0] < -0.1 || animal.continuationTarget[1] < -0.1).toBe(true);
  });

  it("revalidates cleared flight routes on clip handoff instead of clearing continuationTarget into blind flight", () => {
    const { animal } = fixture();
    const planMovement = vi.fn();
    Object.assign(animal, {
      movementMedium: "air",
      velocity: 6,
      destination: [0, 30],
      arrivalMedium: "ground",
      route: undefined,
      continuationTarget: [20, 0],
      flightNeedsReplan: true,
      movementIntent: {
        target: [0, 30],
        speed: 6,
        medium: "air",
        arrivalMedium: "ground",
        finish: vi.fn(),
        started: true
      },
      planMovement,
      updateCrowdIntent: vi.fn()
    });
    animal.moveTo([0, 30], 6, vi.fn(), "ground");
    expect(planMovement).toHaveBeenCalledWith(animal.movementIntent, true);
    expect(animal.continuationTarget).toEqual([20, 0]);
    expect(animal.flightNeedsReplan).toBe(true);
  });

  it("admits a validated vertical landing below a stalled bird even when inflated staticRouteQuery rejects the current cell", () => {
    const { animal, ground, canTraverse } = fixture();
    // Inflated staticRouteQuery(radius + 0.05) rejects the current (0, 0) cell,
    // while actual footprint (radius) and vertical air sweep canLandBelow succeed.
    canTraverse.mockReturnValue(false);
    ground.canTraverse = vi.fn(() => true);
    ground.canTraverseAir = vi.fn(() => true);
    Object.assign(animal, {
      movementMedium: "air",
      flightNeedsReplan: true,
      velocity: 6
    });
    Object.assign(animal.root.transform.position, { x: 0, y: 4, z: 0 });
    expect(animal.prepareRoute([0, 0], 6, "air", "ground")).toBe(true);
    expect(animal.preparedRoute?.points).toEqual([[0, 0]]);
  });

  it("falls back to true body radius when inflated staticRouteQuery rejects an edge start cell", () => {
    const { animal, ground } = fixture();
    const queriedRadii: number[] = [];
    ground.staticRouteQuery = vi.fn((radius: number) => {
      queriedRadii.push(radius);
      return {
        // Reject the +0.05m inflated query at the start cell (0, 0), accept true body radius.
        canTraverse: (from: readonly [number, number], to: readonly [number, number]) =>
          radius <= 0.51 || from[0] !== 0 || from[1] !== 0 || to[0] !== 0 || to[1] !== 0,
        obstruction: () => undefined
      };
    });
    expect(animal.prepareRoute([0, 3], 2, "ground")).toBe(true);
    expect(queriedRadii).toEqual([0.55, 0.5]);
    expect(animal.preparedRoute?.points).toEqual([[0, 3]]);
  });

  it("does not treat a fresh takeoff near ground elevation as a stalled airborne vertical landing", () => {
    const { animal, ground } = fixture();
    ground.canTraverse = vi.fn(() => true);
    ground.canTraverseAir = vi.fn(() => true);
    Object.assign(animal, {
      movementMedium: "air",
      flightNeedsReplan: true,
      velocity: 6
    });
    // Only 11cm above ground (surface = 0): freshly taking off, not stalled at altitude.
    Object.assign(animal.root.transform.position, { x: 0, y: 0.11, z: 0 });
    expect(animal.canLandBelow("ground")).toBe(false);
    // Once clearly airborne above surface, vertical landing recovery is allowed.
    Object.assign(animal.root.transform.position, { x: 0, y: 4, z: 0 });
    expect(animal.canLandBelow("ground")).toBe(true);
  });
});
