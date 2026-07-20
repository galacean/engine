import type { DynamicCollider, Entity } from "@galacean/engine-core";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WaterSurfaceProvider, WaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";
import { WaterBuoyancy } from "../../runtime/buoyancy/WaterBuoyancy";

interface AppliedForce {
  readonly force: Vector3;
  readonly position: Vector3;
}

interface MutableColliderState {
  enabled: boolean;
  isKinematic: boolean;
  mass: number;
  readonly linearVelocity: Vector3;
  readonly angularVelocity: Vector3;
  readonly centerOfMass: Vector3;
  readonly appliedForces: AppliedForce[];
  readonly applyForceAtPosition: ReturnType<typeof vi.fn>;
}

interface MutableSurfaceState {
  hit: boolean;
  height: number;
  readonly velocity: Vector3;
}

interface BuoyancyFixture {
  readonly component: WaterBuoyancy;
  readonly collider: MutableColliderState;
  readonly colliderRef: { current: MutableColliderState | null };
  readonly gravity: Vector3;
  readonly worldMatrix: Matrix;
  readonly provider: WaterSurfaceProvider;
  readonly sampleSurface: ReturnType<typeof vi.fn>;
  readonly surface: MutableSurfaceState;
}

function createCollider(): MutableColliderState {
  const appliedForces: AppliedForce[] = [];
  return {
    enabled: true,
    isKinematic: false,
    mass: 10,
    linearVelocity: new Vector3(),
    angularVelocity: new Vector3(),
    centerOfMass: new Vector3(),
    appliedForces,
    applyForceAtPosition: vi.fn((force: Vector3, position: Vector3) => {
      appliedForces.push({
        force: new Vector3().copyFrom(force),
        position: new Vector3().copyFrom(position)
      });
    })
  };
}

function createFixture(
  options: {
    readonly collider?: MutableColliderState | null;
    readonly position?: Vector3;
    readonly rotation?: Quaternion;
    readonly scale?: Vector3;
    readonly surfaceHeight?: number;
  } = {}
): BuoyancyFixture {
  const collider = options.collider === undefined ? createCollider() : (options.collider ?? createCollider());
  const colliderRef = { current: options.collider === null ? null : collider };
  const gravity = new Vector3(0, -9.81, 0);
  const position = options.position ?? new Vector3();
  const rotation = options.rotation ?? new Quaternion();
  const scale = options.scale ?? new Vector3(1, 1, 1);
  const worldMatrix = new Matrix();
  Matrix.affineTransformation(scale, rotation, position, worldMatrix);
  const surface: MutableSurfaceState = {
    hit: true,
    height: options.surfaceHeight ?? position.y,
    velocity: new Vector3()
  };
  const sampleSurface = vi.fn((worldPosition: Vector3, outSample: WaterSurfaceSample): boolean => {
    if (!surface.hit) return false;
    outSample.waterBodyId = "test-water";
    outSample.surfacePosition.set(worldPosition.x, surface.height, worldPosition.z);
    outSample.surfaceNormal.set(0, 1, 0);
    outSample.waterVelocity.copyFrom(surface.velocity);
    outSample.waterDepth = 5;
    return true;
  });
  const provider: WaterSurfaceProvider = { sampleSurface };
  const entity = {
    engine: {},
    scene: { physics: { gravity } },
    transform: { worldMatrix, lossyWorldScale: scale },
    getComponent: vi.fn(() => colliderRef.current as unknown as DynamicCollider),
    _isActiveInScene: false,
    isActiveInHierarchy: false
  } as unknown as Entity;
  const component = new WaterBuoyancy(entity);
  component.surfaceProvider = provider;
  component.pontoons = [{ localPosition: new Vector3(), radius: 1, enabled: true }];

  return { component, collider, colliderRef, gravity, worldMatrix, provider, sampleSurface, surface };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WaterBuoyancy", () => {
  it("samples transformed Pontoons and applies solver output through DynamicCollider public APIs", () => {
    const fixture = createFixture({
      position: new Vector3(10, 10, 30),
      scale: new Vector3(2, 1, 0.5),
      surfaceHeight: 10
    });
    const { component, collider } = fixture;
    component.pontoons = [{ localPosition: new Vector3(1, 0, -1), radius: 1, enabled: true }];
    collider.centerOfMass.set(0.5, 0, -1);
    collider.angularVelocity.set(0, 0, 90);
    const linearVelocityIdentity = collider.linearVelocity;
    const angularVelocityIdentity = collider.angularVelocity;
    const state = component.pontoonStates[0];
    const worldPositionIdentity = state.worldPosition;
    const surfacePositionIdentity = state.surfacePosition;
    const forceIdentity = state.force;
    const horizontalForceIdentity = state.horizontalForce;

    component.onAwake();
    component.onPhysicsUpdate();

    expect(fixture.sampleSurface).toHaveBeenCalledOnce();
    expect(collider.applyForceAtPosition).toHaveBeenCalledOnce();
    expect(collider.appliedForces[0].position).toMatchObject({ x: 12, y: 10, z: 29.5 });
    expect(collider.appliedForces[0].force.x).toBeCloseTo(0);
    expect(collider.appliedForces[0].force.y).toBeCloseTo(86.319, 3);
    expect(collider.appliedForces[0].force.z).toBeCloseTo(0);
    expect(component.isInWater).toBe(true);
    expect(component.submergedPontoonCount).toBe(1);
    expect(component.lastStepQueryCount).toBe(1);
    expect(component.lastStepAppliedForceCount).toBe(1);
    expect(state.enabled).toBe(true);
    expect(state.surfaceHit).toBe(true);
    expect(state.worldRadius).toBe(2);
    expect(state.submergedRatio).toBeCloseTo(0.5);
    expect(state.verticalSpeed).toBeCloseTo(Math.PI / 2);
    expect(state.horizontalRelativeSpeed).toBe(0);
    expect(state.submergedProjectedArea).toBe(0);
    expect(state.submergedAreaRatio).toBe(0);
    expect(state.horizontalForceClamped).toBe(false);
    expect(state.horizontalForce).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(state.worldPosition).toMatchObject({ x: 12, y: 10, z: 29.5 });
    expect(state.surfacePosition).toMatchObject({ x: 12, y: 10, z: 29.5 });
    expect(state.force.y).toBeCloseTo(86.319, 3);
    expect(collider.linearVelocity).toBe(linearVelocityIdentity);
    expect(collider.linearVelocity).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(collider.angularVelocity).toBe(angularVelocityIdentity);
    expect(collider.angularVelocity).toMatchObject({ x: 0, y: 0, z: 90 });

    fixture.surface.hit = false;
    component.onPhysicsUpdate();

    expect(component.pontoonStates[0]).toBe(state);
    expect(state.worldPosition).toBe(worldPositionIdentity);
    expect(state.surfacePosition).toBe(surfacePositionIdentity);
    expect(state.force).toBe(forceIdentity);
    expect(state.horizontalForce).toBe(horizontalForceIdentity);
    expect(state.surfaceHit).toBe(false);
    expect(state.submergedRatio).toBe(0);
    expect(state.force).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(state.horizontalForce).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(component.isInWater).toBe(false);
    expect(component.submergedPontoonCount).toBe(0);
    expect(component.lastStepQueryCount).toBe(1);
    expect(component.lastStepAppliedForceCount).toBe(0);
  });

  it("opts into local-current drag and submits the combined vertical and horizontal force once", () => {
    const fixture = createFixture();
    const { component, collider, surface } = fixture;
    expect(component.applyHorizontalDrag).toBe(false);
    expect(component.horizontalLinearDrag).toBe(0);
    expect(component.waterDensity).toBe(1000);
    expect(component.horizontalDragCoefficient).toBe(0.5);
    expect(component.horizontalDragAreaScale).toBe(1);
    expect(component.maxHorizontalDragSpeed).toBe(5);
    expect(component.maxHorizontalForceMultiplier).toBe(2);
    component.applyHorizontalDrag = true;
    component.horizontalLinearDrag = 2;
    component.waterDensity = 0;
    component.horizontalDragCoefficient = 0;
    component.maxHorizontalDragSpeed = 10;
    component.maxHorizontalForceMultiplier = 100;
    surface.velocity.set(3, 0, 0);
    const linearVelocityIdentity = collider.linearVelocity;
    const angularVelocityIdentity = collider.angularVelocity;
    const state = component.pontoonStates[0];
    const forceIdentity = state.force;
    const horizontalForceIdentity = state.horizontalForce;

    component.onAwake();
    component.onPhysicsUpdate();

    expect(collider.applyForceAtPosition).toHaveBeenCalledOnce();
    expect(collider.appliedForces).toHaveLength(1);
    expect(collider.appliedForces[0].force.x).toBeCloseTo(3 * Math.PI, 12);
    expect(collider.appliedForces[0].force.y).toBeCloseTo(98.1, 12);
    expect(state.force).toBe(forceIdentity);
    expect(state.horizontalForce).toBe(horizontalForceIdentity);
    expect(state.horizontalForce.x).toBeCloseTo(3 * Math.PI, 12);
    expect(state.horizontalForce.y).toBeCloseTo(0, 12);
    expect(state.horizontalRelativeSpeed).toBe(3);
    expect(state.submergedAreaRatio).toBe(0.5);
    expect(state.submergedProjectedArea).toBeCloseTo(Math.PI * 0.5, 12);
    expect(state.horizontalForceClamped).toBe(false);
    expect(collider.linearVelocity).toBe(linearVelocityIdentity);
    expect(collider.linearVelocity).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(collider.angularVelocity).toBe(angularVelocityIdentity);
    expect(collider.angularVelocity).toMatchObject({ x: 0, y: 0, z: 0 });

    collider.linearVelocity.set(3, 0, 0);
    collider.appliedForces.length = 0;
    component.onPhysicsUpdate();
    expect(collider.applyForceAtPosition).toHaveBeenCalledTimes(2);
    expect(collider.appliedForces).toHaveLength(1);
    expect(collider.appliedForces[0].force.x).toBe(0);
    expect(collider.appliedForces[0].force.y).toBeCloseTo(98.1, 12);
    expect(collider.appliedForces[0].force.z).toBe(0);
    expect(state.horizontalRelativeSpeed).toBe(0);
    expect(state.horizontalForce).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(state.force).toBe(forceIdentity);
    expect(state.horizontalForce).toBe(horizontalForceIdentity);
    expect(collider.linearVelocity).toMatchObject({ x: 3, y: 0, z: 0 });
  });

  it("uses the full rotated parent/world matrix and conservative sphere scale", () => {
    const rotation = new Quaternion();
    Quaternion.rotationYawPitchRoll(Math.PI / 2, 0, 0, rotation);
    const fixture = createFixture({
      position: new Vector3(4, 5, 6),
      rotation,
      scale: new Vector3(2, 1, 0.5),
      surfaceHeight: 5
    });
    const localPosition = new Vector3(1, 0, 0.5);
    const expectedWorldPosition = new Vector3();
    Vector3.transformCoordinate(localPosition, fixture.worldMatrix, expectedWorldPosition);
    fixture.component.pontoons = [{ localPosition, radius: 0.5, enabled: true }];

    fixture.component.onAwake();
    fixture.component.onPhysicsUpdate();

    expect(fixture.sampleSurface).toHaveBeenCalledOnce();
    expect(fixture.component.pontoonStates[0].worldPosition).toMatchObject(expectedWorldPosition);
    expect(fixture.component.pontoonStates[0].worldRadius).toBe(1);
    expect(fixture.collider.appliedForces[0].position).toMatchObject(expectedWorldPosition);
  });

  it("skips exactly one fixed step after a caller-owned teleport and then resumes", () => {
    const fixture = createFixture();
    const { component, collider, sampleSurface, worldMatrix } = fixture;
    component.onAwake();
    component.onPhysicsUpdate();
    expect(sampleSurface).toHaveBeenCalledOnce();
    expect(collider.applyForceAtPosition).toHaveBeenCalledOnce();
    expect(component.isInWater).toBe(true);

    const state = component.pontoonStates[0];
    const worldPositionIdentity = state.worldPosition;
    const surfacePositionIdentity = state.surfacePosition;
    const forceIdentity = state.force;
    component.notifyTeleported();
    Matrix.affineTransformation(new Vector3(1, 1, 1), new Quaternion(), new Vector3(12, 0, 0), worldMatrix);
    collider.linearVelocity.set(3, 4, 5);
    collider.angularVelocity.set(6, 7, 8);
    collider.appliedForces.length = 0;

    component.onPhysicsUpdate();

    expect(sampleSurface).toHaveBeenCalledOnce();
    expect(collider.applyForceAtPosition).toHaveBeenCalledOnce();
    expect(collider.appliedForces).toHaveLength(0);
    expect(component.isInWater).toBe(false);
    expect(component.submergedPontoonCount).toBe(0);
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);
    expect(state.enabled).toBe(false);
    expect(state.surfaceHit).toBe(false);
    expect(state.submergedRatio).toBe(0);
    expect(state.worldRadius).toBe(0);
    expect(state.worldPosition).toBe(worldPositionIdentity);
    expect(state.worldPosition).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(state.surfacePosition).toBe(surfacePositionIdentity);
    expect(state.surfacePosition).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(state.force).toBe(forceIdentity);
    expect(state.force).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(collider.linearVelocity).toMatchObject({ x: 3, y: 4, z: 5 });
    expect(collider.angularVelocity).toMatchObject({ x: 6, y: 7, z: 8 });

    component.onPhysicsUpdate();

    expect(sampleSurface).toHaveBeenCalledTimes(2);
    expect(collider.applyForceAtPosition).toHaveBeenCalledTimes(2);
    expect(collider.appliedForces).toHaveLength(1);
    expect(component.isInWater).toBe(true);
    expect(component.submergedPontoonCount).toBe(1);
    expect(component.lastStepQueryCount).toBe(1);
    expect(component.lastStepAppliedForceCount).toBe(1);
    expect(state.enabled).toBe(true);
    expect(state.worldPosition).toMatchObject({ x: 12, y: 0, z: 0 });
    expect(collider.linearVelocity).toMatchObject({ x: 3, y: 4, z: 5 });
    expect(collider.angularVelocity).toMatchObject({ x: 6, y: 7, z: 8 });
  });

  it("accepts eight Pontoons and rejects a ninth for the entire step", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fixture = createFixture();
    const { component, collider } = fixture;
    collider.mass = 8;
    component.pontoons = Array.from({ length: 8 }, (_, index) => ({
      localPosition: new Vector3(index, 0, 0),
      radius: 1,
      enabled: true
    }));
    component.onAwake();

    component.onPhysicsUpdate();

    expect(component.pontoonStates).toHaveLength(8);
    expect(component.lastDiagnostic).toBeNull();
    expect(component.submergedPontoonCount).toBe(8);
    expect(component.lastStepQueryCount).toBe(8);
    expect(component.lastStepAppliedForceCount).toBe(8);
    expect(collider.appliedForces).toHaveLength(8);
    expect(collider.appliedForces[0].force.y).toBeCloseTo(9.81);
    expect(component.pontoonStates.every((state) => state.enabled)).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    component.pontoons.push({ localPosition: new Vector3(8, 0, 0), radius: 1, enabled: true });
    collider.appliedForces.length = 0;
    component.onPhysicsUpdate();
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-pontoon-count");
    expect(component.submergedPontoonCount).toBe(0);
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);
    expect(collider.appliedForces).toHaveLength(0);
    expect(component.pontoonStates.every((state) => !state.enabled)).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("rejects invalid force parameters and enabled Pontoons without querying or applying force", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fixture = createFixture();
    const { component, collider, sampleSurface } = fixture;
    component.onAwake();

    component.buoyancyCoefficient = Number.NaN;
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-parameters");
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);

    component.buoyancyCoefficient = 2;
    component.applyHorizontalDrag = true;
    component.waterDensity = Number.NaN;
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-parameters");
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);

    component.waterDensity = 1000;
    (component as unknown as { applyHorizontalDrag: unknown }).applyHorizontalDrag = 1;
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-parameters");
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);

    component.applyHorizontalDrag = false;
    component.pontoons[0].radius = -1;
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-pontoon");
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);

    component.pontoons[0].radius = 1;
    component.pontoons[0].localPosition.set(Number.NaN, 0, 0);
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-pontoon");
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);
    expect(sampleSurface).not.toHaveBeenCalled();
    expect(collider.appliedForces).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("ignores horizontal parameters while current drag is disabled and validates them when enabled", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fixture = createFixture();
    const { component, collider, sampleSurface } = fixture;
    component.horizontalLinearDrag = Number.NaN;
    component.waterDensity = Number.NaN;
    component.horizontalDragCoefficient = Number.NaN;
    component.horizontalDragAreaScale = Number.NaN;
    component.maxHorizontalDragSpeed = Number.NaN;
    component.maxHorizontalForceMultiplier = Number.NaN;
    component.onAwake();

    component.onPhysicsUpdate();

    expect(component.applyHorizontalDrag).toBe(false);
    expect(component.lastDiagnostic).toBeNull();
    expect(component.lastStepQueryCount).toBe(1);
    expect(component.lastStepAppliedForceCount).toBe(1);
    expect(sampleSurface).toHaveBeenCalledOnce();
    expect(collider.appliedForces).toHaveLength(1);

    component.applyHorizontalDrag = true;
    component.onPhysicsUpdate();

    expect(component.lastDiagnostic).toBe("invalid-parameters");
    expect(component.lastStepQueryCount).toBe(0);
    expect(component.lastStepAppliedForceCount).toBe(0);
    expect(sampleSurface).toHaveBeenCalledOnce();
    expect(collider.appliedForces).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("reports fixed diagnostics once per code and stays silent for disabled or out-of-water Pontoons", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fixture = createFixture({ collider: null });
    const { component, collider, colliderRef, gravity, surface } = fixture;

    component.onAwake();
    component.onAwake();
    expect(component.lastDiagnostic).toBe("missing-collider");
    expect(warn).toHaveBeenCalledTimes(1);

    colliderRef.current = collider;
    component.onAwake();
    component.surfaceProvider = null;
    component.onPhysicsUpdate();
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("missing-provider");
    expect(warn).toHaveBeenCalledTimes(2);

    component.surfaceProvider = fixture.provider;
    collider.isKinematic = true;
    component.onPhysicsUpdate();
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("kinematic");
    expect(warn).toHaveBeenCalledTimes(3);

    collider.isKinematic = false;
    collider.mass = 0;
    component.onPhysicsUpdate();
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-mass");
    expect(warn).toHaveBeenCalledTimes(4);

    collider.mass = 10;
    gravity.set(0, 0, 0);
    component.onPhysicsUpdate();
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-gravity");
    expect(warn).toHaveBeenCalledTimes(5);

    gravity.set(0, -9.81, 0);
    component.pontoons = [];
    component.onPhysicsUpdate();
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-pontoon-count");
    expect(warn).toHaveBeenCalledTimes(6);

    component.pontoons = [{ localPosition: new Vector3(), radius: 1, enabled: false }];
    component.onPhysicsUpdate();
    surface.hit = false;
    component.pontoons[0].enabled = true;
    component.onPhysicsUpdate();
    collider.enabled = false;
    component.surfaceProvider = null;
    component.onPhysicsUpdate();
    collider.enabled = true;
    component.enabled = false;
    component.onPhysicsUpdate();
    expect(component.lastDiagnostic).toBe("invalid-pontoon-count");
    expect(warn).toHaveBeenCalledTimes(6);
  });

  it("updates opt-in timings in stable preallocated metrics and has no timer calls when profiling is off", () => {
    let clock = 0;
    const now = vi.spyOn(globalThis.performance, "now").mockImplementation(() => ++clock);
    const fixture = createFixture();
    const { component } = fixture;
    component.onAwake();
    component.profilingEnabled = true;
    const metrics = component.profilingMetrics;

    component.onPhysicsUpdate();

    expect(component.profilingMetrics).toBe(metrics);
    expect(metrics.queryMs).toBe(1);
    expect(metrics.solverMs).toBe(1);
    expect(metrics.applyForceMs).toBe(1);
    expect(metrics.totalMs).toBe(7);

    component.profilingEnabled = false;
    const timerCalls = now.mock.calls.length;
    component.onPhysicsUpdate();
    expect(now).toHaveBeenCalledTimes(timerCalls);
    expect(component.profilingMetrics).toBe(metrics);
    expect(metrics).toMatchObject({ queryMs: 0, solverMs: 0, applyForceMs: 0, totalMs: 0 });
  });
});
