import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { BuoyancySolver } from "../../runtime/buoyancy/BuoyancySolver";
import type {
  BuoyancyPointForceInput,
  BuoyancyPointForceOutput,
  BuoyancySolverScratch
} from "../../runtime/buoyancy/types";

interface SolverFixture {
  readonly input: BuoyancyPointForceInput;
  readonly output: BuoyancyPointForceOutput;
  readonly scratch: BuoyancySolverScratch;
}

function createSolverFixture(): SolverFixture {
  return {
    input: {
      pontoonCenter: new Vector3(0, 0, 0),
      surfacePosition: new Vector3(0, 0, 0),
      waterVelocity: new Vector3(),
      linearVelocity: new Vector3(),
      angularVelocityDegrees: new Vector3(),
      worldCenterOfMass: new Vector3(),
      gravity: new Vector3(0, -10, 0),
      radius: 1,
      totalRadiusCubed: 1,
      mass: 10,
      buoyancyCoefficient: 2,
      verticalDamping: 0,
      maxForceMultiplier: 100,
      applyHorizontalDrag: false,
      horizontalLinearDrag: 0,
      waterDensity: 1000,
      horizontalDragCoefficient: 0.5,
      horizontalDragAreaScale: 1,
      maxHorizontalDragSpeed: 5,
      maxHorizontalForceMultiplier: 100
    },
    output: {
      force: new Vector3(),
      horizontalForce: new Vector3(),
      submergedRatio: 0,
      radiusCubedWeight: 0,
      verticalSpeed: 0,
      horizontalRelativeSpeed: 0,
      submergedProjectedArea: 0,
      submergedAreaRatio: 0,
      horizontalForceClamped: false
    },
    scratch: {
      up: new Vector3(),
      angularVelocityRadians: new Vector3(),
      offsetFromCenterOfMass: new Vector3(),
      pointVelocity: new Vector3(),
      relativeVelocity: new Vector3(),
      horizontalRelativeVelocity: new Vector3()
    }
  };
}

function expectFiniteOutput(output: BuoyancyPointForceOutput): void {
  expect(Number.isFinite(output.force.x)).toBe(true);
  expect(Number.isFinite(output.force.y)).toBe(true);
  expect(Number.isFinite(output.force.z)).toBe(true);
  expect(Number.isFinite(output.horizontalForce.x)).toBe(true);
  expect(Number.isFinite(output.horizontalForce.y)).toBe(true);
  expect(Number.isFinite(output.horizontalForce.z)).toBe(true);
  expect(Number.isFinite(output.submergedRatio)).toBe(true);
  expect(Number.isFinite(output.radiusCubedWeight)).toBe(true);
  expect(Number.isFinite(output.verticalSpeed)).toBe(true);
  expect(Number.isFinite(output.horizontalRelativeSpeed)).toBe(true);
  expect(Number.isFinite(output.submergedProjectedArea)).toBe(true);
  expect(Number.isFinite(output.submergedAreaRatio)).toBe(true);
}

describe("BuoyancySolver sphere-cap immersion", () => {
  const surface = new Vector3(0, 0, 0);
  const up = new Vector3(0, 1, 0);

  it("returns exact dry, half-submerged, and fully submerged ratios", () => {
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(0, 1, 0), surface, up, 1)).toBe(0);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(0, 0, 0), surface, up, 1)).toBe(0.5);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(0, -1, 0), surface, up, 1)).toBe(1);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(0, 100, 0), surface, up, 1)).toBe(0);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(0, -100, 0), surface, up, 1)).toBe(1);
  });

  it("is continuous, finite, bounded, and monotonic through entry", () => {
    let previous = 0;
    for (let index = 0; index <= 400; index++) {
      const centerY = 1.2 - index * 0.006;
      const ratio = BuoyancySolver.computeSubmergedRatio(new Vector3(0, centerY, 0), surface, up, 1);
      expect(Number.isFinite(ratio)).toBe(true);
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
      expect(ratio + 1e-12).toBeGreaterThanOrEqual(previous);
      expect(ratio - previous).toBeLessThan(0.01);
      previous = ratio;
    }
  });

  it("normalizes the supplied up direction and rejects invalid geometry", () => {
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(), surface, new Vector3(0, 20, 0), 1)).toBe(0.5);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(), surface, new Vector3(), 1)).toBe(0);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(), surface, up, 0)).toBe(0);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(), surface, up, -1)).toBe(0);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(), surface, up, Number.NaN)).toBe(0);
    expect(BuoyancySolver.computeSubmergedRatio(new Vector3(Number.NaN, 0, 0), surface, up, 1)).toBe(0);
    expect(
      BuoyancySolver.computeSubmergedRatio(new Vector3(), new Vector3(0, Number.POSITIVE_INFINITY, 0), up, 1)
    ).toBe(0);
  });
});

describe("BuoyancySolver submerged projected area", () => {
  const surface = new Vector3(0, 0, 0);
  const up = new Vector3(0, 1, 0);

  it("returns exact dry, half-submerged, and fully submerged circular-area ratios", () => {
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(0, 1, 0), surface, up, 1)).toBe(0);
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(0, 0, 0), surface, up, 1)).toBe(0.5);
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(0, -1, 0), surface, up, 1)).toBe(1);
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(0, 100, 0), surface, up, 1)).toBe(0);
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(0, -100, 0), surface, up, 1)).toBe(1);
  });

  it("is finite, bounded, and monotonic throughout immersion", () => {
    let previous = 0;
    for (let index = 0; index <= 400; index++) {
      const centerY = 1.2 - index * 0.006;
      const ratio = BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(0, centerY, 0), surface, up, 1);
      expect(Number.isFinite(ratio)).toBe(true);
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
      expect(ratio + 1e-12).toBeGreaterThanOrEqual(previous);
      previous = ratio;
    }
  });

  it("normalizes up and rejects invalid geometry", () => {
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(), surface, new Vector3(0, 20, 0), 1)).toBe(
      0.5
    );
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(), surface, new Vector3(), 1)).toBe(0);
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(), surface, up, 0)).toBe(0);
    expect(BuoyancySolver.computeSubmergedProjectedAreaRatio(new Vector3(Number.NaN, 0, 0), surface, up, 1)).toBe(0);
  });
});

describe("BuoyancySolver radius-cubed weights", () => {
  it("normalizes different Pontoon radii strictly by radius cubed", () => {
    const total = [1, 2, 3].reduce((sum, radius) => sum + BuoyancySolver.computeRadiusCubed(radius), 0);
    const weights = [1, 2, 3].map((radius) => BuoyancySolver.computeRadiusCubedWeight(radius, total));

    expect(total).toBe(36);
    expect(weights[0]).toBeCloseTo(1 / 36, 12);
    expect(weights[1]).toBeCloseTo(8 / 36, 12);
    expect(weights[2]).toBeCloseTo(27 / 36, 12);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });

  it("returns zero for invalid radii and totals", () => {
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
      expect(BuoyancySolver.computeRadiusCubed(radius)).toBe(0);
      expect(BuoyancySolver.computeRadiusCubedWeight(radius, 1)).toBe(0);
    }
    for (const total of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(BuoyancySolver.computeRadiusCubedWeight(1, total)).toBe(0);
    }
    expect(BuoyancySolver.computeRadiusCubedWeight(2, 1)).toBe(0);
  });
});

describe("BuoyancySolver point velocity", () => {
  it("converts angular velocity from degrees to radians and preserves every source vector", () => {
    const linearVelocity = new Vector3(1, 2, 3);
    const angularVelocityDegrees = new Vector3(0, 0, 90);
    const pointPosition = new Vector3(3, 0, 0);
    const worldCenterOfMass = new Vector3(1, 0, 0);
    const out = new Vector3();
    const angularScratch = new Vector3();
    const offsetScratch = new Vector3();

    const returned = BuoyancySolver.computePointVelocity(
      linearVelocity,
      angularVelocityDegrees,
      pointPosition,
      worldCenterOfMass,
      out,
      angularScratch,
      offsetScratch
    );

    expect(returned).toBe(out);
    expect(out.x).toBeCloseTo(1, 12);
    expect(out.y).toBeCloseTo(2 + Math.PI, 12);
    expect(out.z).toBeCloseTo(3, 12);
    expect(linearVelocity).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(angularVelocityDegrees).toMatchObject({ x: 0, y: 0, z: 90 });
    expect(pointPosition).toMatchObject({ x: 3, y: 0, z: 0 });
    expect(worldCenterOfMass).toMatchObject({ x: 1, y: 0, z: 0 });
  });

  it("resets a reused output for invalid input", () => {
    const out = new Vector3(4, 5, 6);
    const returned = BuoyancySolver.computePointVelocity(
      new Vector3(Number.NaN, 0, 0),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      out,
      new Vector3(),
      new Vector3()
    );

    expect(returned).toBe(out);
    expect(out).toMatchObject({ x: 0, y: 0, z: 0 });
  });
});

describe("BuoyancySolver horizontal water drag", () => {
  function enableHorizontalDrag(fixture: SolverFixture): void {
    fixture.input.applyHorizontalDrag = true;
    fixture.input.buoyancyCoefficient = 0;
    fixture.input.verticalDamping = 0;
    fixture.input.horizontalLinearDrag = 2;
    fixture.input.waterDensity = 0;
    fixture.input.horizontalDragCoefficient = 0;
    fixture.input.horizontalDragAreaScale = 1;
    fixture.input.maxHorizontalDragSpeed = 10;
    fixture.input.maxHorizontalForceMultiplier = 100;
  }

  it("pushes a stationary Pontoon with the current and vanishes when point and water velocities match", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.waterVelocity.set(3, 0, 0);

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.output.horizontalRelativeSpeed).toBe(3);
    expect(fixture.output.submergedAreaRatio).toBe(0.5);
    expect(fixture.output.submergedProjectedArea).toBeCloseTo(Math.PI * 0.5, 12);
    expect(fixture.output.horizontalForce.x).toBeCloseTo(3 * Math.PI, 12);
    expect(fixture.output.horizontalForce.y).toBeCloseTo(0, 12);
    expect(fixture.output.force).toEqual(fixture.output.horizontalForce);
    expect(fixture.output.horizontalForceClamped).toBe(false);

    fixture.input.linearVelocity.set(3, 0, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.horizontalRelativeSpeed).toBe(0);
    expect(fixture.output.horizontalForce).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(fixture.output.force).toMatchObject({ x: 0, y: 0, z: 0 });
  });

  it("reverses force after a Pontoon overtakes the current and for the opposite current", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.waterVelocity.set(3, 0, 0);
    fixture.input.linearVelocity.set(4, 0, 0);

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    const upstreamMagnitude = fixture.output.horizontalForce.x;
    expect(upstreamMagnitude).toBeCloseTo(-Math.PI, 12);

    fixture.input.linearVelocity.set(0, 0, 0);
    fixture.input.waterVelocity.set(-1, 0, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.horizontalForce.x).toBeCloseTo(upstreamMagnitude, 12);
  });

  it("keeps vertical water motion out of horizontal drag while retaining P0 vertical damping", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.verticalDamping = 2;
    fixture.input.waterVelocity.set(0, 3, 0);

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.output.verticalSpeed).toBe(-3);
    expect(fixture.output.horizontalRelativeSpeed).toBe(0);
    expect(fixture.output.horizontalForce).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(fixture.output.force).toMatchObject({ x: 0, y: 30, z: 0 });
  });

  it("scales linearly and quadratically with the capped evaluation speed", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.waterVelocity.set(1, 0, 0);

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    const linearAtOne = fixture.output.horizontalForce.x;
    fixture.input.waterVelocity.set(2, 0, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.horizontalForce.x / linearAtOne).toBeCloseTo(2, 12);

    fixture.input.horizontalLinearDrag = 0;
    fixture.input.waterDensity = 2;
    fixture.input.horizontalDragCoefficient = 3;
    fixture.input.waterVelocity.set(1, 0, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    const quadraticAtOne = fixture.output.horizontalForce.x;
    fixture.input.waterVelocity.set(2, 0, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.horizontalForce.x / quadraticAtOne).toBeCloseTo(4, 12);

    fixture.input.maxHorizontalDragSpeed = 1;
    fixture.input.waterVelocity.set(8, 0, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.horizontalRelativeSpeed).toBe(8);
    expect(fixture.output.horizontalForce.x).toBeCloseTo(quadraticAtOne, 12);
  });

  it("scales projected area and uncapped drag with radius squared", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.waterVelocity.set(1, 0, 0);

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    const radiusOneArea = fixture.output.submergedProjectedArea;
    const radiusOneForce = fixture.output.horizontalForce.x;

    fixture.input.radius = 2;
    fixture.input.totalRadiusCubed = 8;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.submergedAreaRatio).toBe(0.5);
    expect(fixture.output.submergedProjectedArea / radiusOneArea).toBeCloseTo(4, 12);
    expect(fixture.output.horizontalForce.x / radiusOneForce).toBeCloseTo(4, 12);
  });

  it("is mass-independent before the separate weight-share cap and reports clamping", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.waterVelocity.set(2, 0, 0);
    fixture.input.mass = 1;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    const lightForce = fixture.output.horizontalForce.x;

    fixture.input.mass = 100;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.horizontalForce.x).toBeCloseTo(lightForce, 12);
    expect(fixture.output.horizontalForceClamped).toBe(false);

    fixture.input.mass = 2;
    fixture.input.horizontalLinearDrag = 100;
    fixture.input.waterVelocity.set(10, 0, 0);
    fixture.input.maxHorizontalForceMultiplier = 0.5;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.horizontalForce.x).toBeCloseTo(10, 12);
    expect(fixture.output.horizontalForceClamped).toBe(true);
  });

  it("projects drag onto the anti-gravity plane and combines it with vertical force", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.gravity.set(6, -8, 0);
    fixture.input.buoyancyCoefficient = 1;
    fixture.input.waterVelocity.set(1.6, 1.2, 0);

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    const up = new Vector3(-0.6, 0.8, 0);
    expect(Vector3.dot(fixture.output.horizontalForce, up)).toBeCloseTo(0, 12);
    expect(fixture.output.horizontalForce.x).toBeGreaterThan(0);
    expect(fixture.output.horizontalForce.y).toBeGreaterThan(0);
    expect(fixture.output.force.x).toBeCloseTo(-30 + fixture.output.horizontalForce.x, 12);
    expect(fixture.output.force.y).toBeCloseTo(40 + fixture.output.horizontalForce.y, 12);
  });

  it("uses angular point velocity to generate natural horizontal angular damping", () => {
    const fixture = createSolverFixture();
    enableHorizontalDrag(fixture);
    fixture.input.pontoonCenter.set(1, 0, 0);
    fixture.input.angularVelocityDegrees.set(0, 90, 0);

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.output.horizontalRelativeSpeed).toBeCloseTo(Math.PI / 2, 12);
    expect(fixture.output.horizontalForce.x).toBeCloseTo(0, 12);
    expect(fixture.output.horizontalForce.z).toBeGreaterThan(0);
  });

  it("preserves P0 output exactly while horizontal drag is disabled", () => {
    const fixture = createSolverFixture();
    fixture.input.waterVelocity.set(4, 0, -3);
    fixture.input.horizontalLinearDrag = Number.NaN;
    fixture.input.waterDensity = Number.NaN;

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.output.force).toMatchObject({ x: 0, y: 100, z: 0 });
    expect(fixture.output.horizontalForce).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(fixture.output.horizontalRelativeSpeed).toBe(0);
    expect(fixture.output.submergedProjectedArea).toBe(0);
    expect(fixture.output.submergedAreaRatio).toBe(0);
    expect(fixture.output.horizontalForceClamped).toBe(false);
  });
});

describe("BuoyancySolver point force", () => {
  it("produces mass-normalized buoyancy using the radius-cubed weight", () => {
    const fixture = createSolverFixture();
    fixture.input.buoyancyCoefficient = 1;
    fixture.input.mass = 9;
    fixture.input.pontoonCenter.y = -2;
    fixture.input.radius = 1;
    fixture.input.totalRadiusCubed = 9;

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.submergedRatio).toBe(1);
    expect(fixture.output.radiusCubedWeight).toBeCloseTo(1 / 9, 12);
    expect(fixture.output.force).toMatchObject({ x: 0, y: 10, z: 0 });

    fixture.input.radius = 2;
    fixture.input.pontoonCenter.y = -3;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.submergedRatio).toBe(1);
    expect(fixture.output.radiusCubedWeight).toBeCloseTo(8 / 9, 12);
    expect(fixture.output.force).toMatchObject({ x: 0, y: 80, z: 0 });
  });

  it("balances body weight at half immersion with coefficient two", () => {
    const fixture = createSolverFixture();
    fixture.input.totalRadiusCubed = 4;

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.output.submergedRatio).toBe(0.5);
    expect(fixture.output.radiusCubedWeight).toBe(0.25);
    expect(fixture.output.force.x).toBe(0);
    expect(fixture.output.force.y).toBeCloseTo(25, 12);
    expect(fixture.output.force.z).toBe(0);
  });

  it("applies vertical damping opposite to relative Pontoon velocity", () => {
    const fixture = createSolverFixture();
    fixture.input.buoyancyCoefficient = 0;
    fixture.input.verticalDamping = 2;

    fixture.input.linearVelocity.y = 2;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.verticalSpeed).toBe(2);
    expect(fixture.output.force.y).toBeCloseTo(-20, 12);

    fixture.input.linearVelocity.y = -2;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.verticalSpeed).toBe(-2);
    expect(fixture.output.force.y).toBeCloseTo(20, 12);

    fixture.input.linearVelocity.y = 1;
    fixture.input.waterVelocity.y = 3;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.verticalSpeed).toBe(-2);
    expect(fixture.output.force.y).toBeCloseTo(20, 12);
  });

  it("uses angular point velocity in damping with the correct cross-product direction", () => {
    const fixture = createSolverFixture();
    fixture.input.mass = 2;
    fixture.input.buoyancyCoefficient = 0;
    fixture.input.verticalDamping = 2;
    fixture.input.pontoonCenter.x = 1;
    fixture.input.angularVelocityDegrees.z = 90;

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.output.verticalSpeed).toBeCloseTo(Math.PI / 2, 12);
    expect(fixture.output.force.y).toBeCloseTo(-Math.PI, 12);
  });

  it("keeps force parallel to anti-gravity rather than the sampled surface normal", () => {
    const fixture = createSolverFixture();
    fixture.input.gravity.set(6, -8, 0);
    fixture.input.buoyancyCoefficient = 1;

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.output.submergedRatio).toBe(0.5);
    expect(fixture.output.force.x).toBeCloseTo(-30, 12);
    expect(fixture.output.force.y).toBeCloseTo(40, 12);
    expect(fixture.output.force.z).toBe(0);
  });

  it("caps extreme buoyancy and damping while keeping every output finite", () => {
    const fixture = createSolverFixture();
    fixture.input.maxForceMultiplier = 2;
    fixture.input.buoyancyCoefficient = 1e200;

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.force.y).toBe(200);
    expectFiniteOutput(fixture.output);

    fixture.input.buoyancyCoefficient = 0;
    fixture.input.verticalDamping = 1e200;
    fixture.input.linearVelocity.y = 1e200;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(fixture.output.force.y).toBe(-200);
    expectFiniteOutput(fixture.output);

    fixture.input.linearVelocity.y = Number.MAX_VALUE;
    fixture.input.waterVelocity.y = -Number.MAX_VALUE;
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    expect(Math.abs(fixture.output.force.y)).toBeLessThanOrEqual(200);
    expectFiniteOutput(fixture.output);
  });

  it("produces cancelling torque for symmetric equal Pontoons", () => {
    const fixture = createSolverFixture();
    const pontoonCenters = [new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(-1, 0, 1), new Vector3(1, 0, 1)];
    const accumulatedForce = new Vector3();
    const accumulatedTorque = new Vector3();
    const pointTorque = new Vector3();
    fixture.input.totalRadiusCubed = 4;

    for (const center of pontoonCenters) {
      fixture.input.pontoonCenter.copyFrom(center);
      fixture.input.surfacePosition.set(center.x, 0, center.z);
      BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
      accumulatedForce.add(fixture.output.force);
      Vector3.cross(center, fixture.output.force, pointTorque);
      accumulatedTorque.add(pointTorque);
    }

    expect(accumulatedForce).toMatchObject({ x: 0, y: 100, z: 0 });
    expect(accumulatedTorque.x).toBeCloseTo(0, 12);
    expect(accumulatedTorque.y).toBeCloseTo(0, 12);
    expect(accumulatedTorque.z).toBeCloseTo(0, 12);
  });

  it("produces restoring torque when equal Pontoons have asymmetric immersion", () => {
    const fixture = createSolverFixture();
    const accumulatedTorque = new Vector3();
    const pointTorque = new Vector3();
    fixture.input.totalRadiusCubed = 2;

    fixture.input.pontoonCenter.set(-1, 0.5, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    Vector3.cross(fixture.input.pontoonCenter, fixture.output.force, pointTorque);
    accumulatedTorque.add(pointTorque);

    fixture.input.pontoonCenter.set(1, -0.5, 0);
    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
    Vector3.cross(fixture.input.pontoonCenter, fixture.output.force, pointTorque);
    accumulatedTorque.add(pointTorque);

    expect(accumulatedTorque.x).toBeCloseTo(0, 12);
    expect(accumulatedTorque.y).toBeCloseTo(0, 12);
    expect(accumulatedTorque.z).toBeGreaterThan(0);
  });

  it("returns and reuses caller-owned output and scratch objects", () => {
    const fixture = createSolverFixture();
    const force = fixture.output.force;
    const horizontalForce = fixture.output.horizontalForce;
    const scratchVectors = Object.values(fixture.scratch);

    for (let index = 0; index < 1000; index++) {
      fixture.input.linearVelocity.y = (index % 7) - 3;
      const returned = BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);
      expect(returned).toBe(fixture.output);
      expect(returned.force).toBe(force);
      expect(returned.horizontalForce).toBe(horizontalForce);
    }
    expect(Object.values(fixture.scratch)).toEqual(scratchVectors);
  });

  it("does not mutate engine-state input vectors", () => {
    const fixture = createSolverFixture();
    fixture.input.pontoonCenter.set(1, 0, 2);
    fixture.input.surfacePosition.set(1, 0, 2);
    fixture.input.waterVelocity.set(3, 4, 5);
    fixture.input.linearVelocity.set(6, 7, 8);
    fixture.input.angularVelocityDegrees.set(9, 10, 11);
    fixture.input.worldCenterOfMass.set(12, 13, 14);
    fixture.input.gravity.set(0, -10, 0);
    const snapshots = [
      fixture.input.pontoonCenter.clone(),
      fixture.input.surfacePosition.clone(),
      fixture.input.waterVelocity.clone(),
      fixture.input.linearVelocity.clone(),
      fixture.input.angularVelocityDegrees.clone(),
      fixture.input.worldCenterOfMass.clone(),
      fixture.input.gravity.clone()
    ];

    BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

    expect(fixture.input.pontoonCenter).toEqual(snapshots[0]);
    expect(fixture.input.surfacePosition).toEqual(snapshots[1]);
    expect(fixture.input.waterVelocity).toEqual(snapshots[2]);
    expect(fixture.input.linearVelocity).toEqual(snapshots[3]);
    expect(fixture.input.angularVelocityDegrees).toEqual(snapshots[4]);
    expect(fixture.input.worldCenterOfMass).toEqual(snapshots[5]);
    expect(fixture.input.gravity).toEqual(snapshots[6]);
  });

  it("clears stale force for dry, zero-gravity, zero-weight, and invalid inputs", () => {
    const cases: Array<(input: BuoyancyPointForceInput) => void> = [
      (input) => input.pontoonCenter.set(0, 2, 0),
      (input) => input.gravity.set(0, 0, 0),
      (input) => (input.totalRadiusCubed = 0),
      (input) => (input.radius = Number.NaN),
      (input) => (input.mass = 0),
      (input) => (input.mass = Number.NaN),
      (input) => (input.buoyancyCoefficient = -1),
      (input) => (input.verticalDamping = Number.NaN),
      (input) => (input.maxForceMultiplier = -1),
      (input) => {
        input.applyHorizontalDrag = true;
        input.horizontalLinearDrag = -1;
      },
      (input) => {
        input.applyHorizontalDrag = true;
        input.waterDensity = Number.NaN;
      },
      (input) => {
        input.applyHorizontalDrag = true;
        input.horizontalDragCoefficient = Number.POSITIVE_INFINITY;
      },
      (input) => {
        input.applyHorizontalDrag = true;
        input.horizontalDragAreaScale = -1;
      },
      (input) => {
        input.applyHorizontalDrag = true;
        input.maxHorizontalDragSpeed = Number.NaN;
      },
      (input) => {
        input.applyHorizontalDrag = true;
        input.maxHorizontalForceMultiplier = -1;
      },
      (input) => input.waterVelocity.set(Number.NaN, 0, 0),
      (input) => input.linearVelocity.set(0, Number.POSITIVE_INFINITY, 0),
      (input) => input.angularVelocityDegrees.set(0, 0, Number.NaN),
      (input) => input.worldCenterOfMass.set(Number.NaN, 0, 0),
      (input) => input.surfacePosition.set(0, Number.NaN, 0)
    ];

    for (const mutate of cases) {
      const fixture = createSolverFixture();
      fixture.output.force.set(1, 2, 3);
      fixture.output.horizontalForce.set(7, 8, 9);
      fixture.output.submergedRatio = 4;
      fixture.output.radiusCubedWeight = 5;
      fixture.output.verticalSpeed = 6;
      fixture.output.horizontalRelativeSpeed = 7;
      fixture.output.submergedProjectedArea = 8;
      fixture.output.submergedAreaRatio = 9;
      fixture.output.horizontalForceClamped = true;
      mutate(fixture.input);

      const returned = BuoyancySolver.computePointForce(fixture.input, fixture.output, fixture.scratch);

      expect(returned).toBe(fixture.output);
      expect(fixture.output.force).toMatchObject({ x: 0, y: 0, z: 0 });
      expect(fixture.output.horizontalForce).toMatchObject({ x: 0, y: 0, z: 0 });
      expectFiniteOutput(fixture.output);
    }
  });
});
