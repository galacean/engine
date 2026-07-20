import { DynamicCollider, Script } from "@galacean/engine-core";
import type { Entity } from "@galacean/engine-core";
import { MathUtil, Vector3 } from "@galacean/engine-math";
import type { WaterSurfaceProvider } from "../query/WaterSurfaceProvider";
import { createWaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { BuoyancySolver } from "./BuoyancySolver";
import type {
  BuoyancyPointForceInput,
  BuoyancyPointForceOutput,
  BuoyancyPontoon,
  BuoyancySolverScratch
} from "./types";

const MAX_PONTOON_COUNT = 8;
const FORCE_EPSILON_SQUARED = MathUtil.zeroTolerance * MathUtil.zeroTolerance;

export type WaterBuoyancyDiagnosticCode =
  | "missing-collider"
  | "missing-provider"
  | "kinematic"
  | "invalid-mass"
  | "invalid-gravity"
  | "invalid-pontoon-count"
  | "invalid-parameters"
  | "invalid-pontoon";

/** Allocation-free per-Pontoon debug state. The component keeps all object and vector identities stable. */
export interface WaterBuoyancyPontoonState {
  readonly enabled: boolean;
  readonly surfaceHit: boolean;
  readonly submergedRatio: number;
  readonly radiusCubedWeight: number;
  readonly verticalSpeed: number;
  readonly worldRadius: number;
  readonly worldPosition: Vector3;
  readonly surfacePosition: Vector3;
  readonly force: Vector3;
}

/** Optional timing for the most recent fixed physics step. All values are milliseconds. */
export interface WaterBuoyancyProfilingMetrics {
  readonly queryMs: number;
  readonly solverMs: number;
  readonly applyForceMs: number;
  readonly totalMs: number;
}

interface MutableWaterBuoyancyPontoonState extends BuoyancyPointForceOutput {
  enabled: boolean;
  surfaceHit: boolean;
  worldRadius: number;
  readonly worldPosition: Vector3;
  readonly surfacePosition: Vector3;
}

interface MutableWaterBuoyancyProfilingMetrics {
  queryMs: number;
  solverMs: number;
  applyForceMs: number;
  totalMs: number;
}

function createPontoonState(): MutableWaterBuoyancyPontoonState {
  return {
    enabled: false,
    surfaceHit: false,
    submergedRatio: 0,
    radiusCubedWeight: 0,
    verticalSpeed: 0,
    worldRadius: 0,
    worldPosition: new Vector3(),
    surfacePosition: new Vector3(),
    force: new Vector3()
  };
}

function resetPontoonState(state: MutableWaterBuoyancyPontoonState): void {
  state.enabled = false;
  state.surfaceHit = false;
  state.submergedRatio = 0;
  state.radiusCubedWeight = 0;
  state.verticalSpeed = 0;
  state.worldRadius = 0;
  state.worldPosition.set(0, 0, 0);
  state.surfacePosition.set(0, 0, 0);
  state.force.set(0, 0, 0);
}

function readPerformanceNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
}

function elapsedMilliseconds(start: number, end: number): number {
  const elapsed = end - start;
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
}

function isFiniteVector(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

/**
 * Applies spherical-Pontoon buoyancy to a DynamicCollider during Galacean's fixed physics callback.
 *
 * The component intentionally owns no frame loop and never integrates transforms or velocities directly.
 */
export class WaterBuoyancy extends Script {
  /** The water surface queried by every enabled Pontoon. */
  surfaceProvider: WaterSurfaceProvider | null = null;

  /** One to eight caller-authored spherical probes in entity-local space. */
  pontoons: BuoyancyPontoon[] = [];

  /** Scales the weight-normalized restoring force. A value of two balances gravity near half immersion. */
  buoyancyCoefficient = 2;

  /** Linear damping applied to Pontoon velocity along the anti-gravity direction. */
  verticalDamping = 1.5;

  /** Caps each Pontoon force relative to its share of body weight. */
  maxForceMultiplier = 4;

  /** Enables opt-in fixed-step timings without changing the normal hot path's allocation behavior. */
  profilingEnabled = false;

  /** Stable storage for all eight possible Pontoon states; unused entries have `enabled === false`. */
  readonly pontoonStates: readonly WaterBuoyancyPontoonState[];

  /** Stable storage for timings from the most recent fixed step. */
  readonly profilingMetrics: WaterBuoyancyProfilingMetrics;

  private readonly _mutablePontoonStates: MutableWaterBuoyancyPontoonState[] = [];
  private readonly _mutableProfilingMetrics: MutableWaterBuoyancyProfilingMetrics = {
    queryMs: 0,
    solverMs: 0,
    applyForceMs: 0,
    totalMs: 0
  };
  private readonly _surfaceSample = createWaterSurfaceSample();
  private readonly _linearVelocity = new Vector3();
  private readonly _angularVelocityDegrees = new Vector3();
  private readonly _localCenterOfMass = new Vector3();
  private readonly _worldCenterOfMass = new Vector3();
  private readonly _gravity = new Vector3();
  private readonly _solverScratch: BuoyancySolverScratch = {
    up: new Vector3(),
    angularVelocityRadians: new Vector3(),
    offsetFromCenterOfMass: new Vector3(),
    pointVelocity: new Vector3(),
    relativeVelocity: new Vector3()
  };
  private readonly _solverInput: BuoyancyPointForceInput = {
    pontoonCenter: new Vector3(),
    surfacePosition: new Vector3(),
    waterVelocity: new Vector3(),
    linearVelocity: new Vector3(),
    angularVelocityDegrees: new Vector3(),
    worldCenterOfMass: new Vector3(),
    gravity: new Vector3(),
    radius: 0,
    totalRadiusCubed: 0,
    mass: 0,
    buoyancyCoefficient: 0,
    verticalDamping: 0,
    maxForceMultiplier: 0
  };

  private _dynamicCollider: DynamicCollider | null = null;
  private _isInWater = false;
  private _submergedPontoonCount = 0;
  private _lastStepQueryCount = 0;
  private _lastStepAppliedForceCount = 0;
  private _lastDiagnostic: WaterBuoyancyDiagnosticCode | null = null;
  private _reportedDiagnosticMask = 0;
  private _skipNextPhysicsUpdate = false;

  constructor(entity: Entity) {
    super(entity);
    for (let i = 0; i < MAX_PONTOON_COUNT; i++) {
      this._mutablePontoonStates.push(createPontoonState());
    }
    this.pontoonStates = this._mutablePontoonStates;
    this.profilingMetrics = this._mutableProfilingMetrics;
  }

  /** Whether at least one enabled Pontoon was submerged during the most recent fixed step. */
  get isInWater(): boolean {
    return this._isInWater;
  }

  /** Number of enabled Pontoons with non-zero immersion during the most recent fixed step. */
  get submergedPontoonCount(): number {
    return this._submergedPontoonCount;
  }

  /** Number of provider calls made during the most recent fixed step. */
  get lastStepQueryCount(): number {
    return this._lastStepQueryCount;
  }

  /** Number of non-zero forces submitted during the most recent fixed step. */
  get lastStepAppliedForceCount(): number {
    return this._lastStepAppliedForceCount;
  }

  /** Most recently observed configuration diagnostic, retained until another diagnostic occurs. */
  get lastDiagnostic(): WaterBuoyancyDiagnosticCode | null {
    return this._lastDiagnostic;
  }

  /**
   * Marks a caller-owned discontinuous pose change.
   *
   * The next fixed callback clears the previous Pontoon state and skips all surface queries and force application,
   * allowing Galacean to synchronize the collider pose before buoyancy resumes on the following fixed step.
   * Repeated notifications before that callback coalesce into the same single skipped step.
   */
  notifyTeleported(): void {
    this._skipNextPhysicsUpdate = true;
  }

  onAwake(): void {
    this._dynamicCollider = this.entity.getComponent(DynamicCollider);
    if (this.enabled && !this._dynamicCollider) this._reportDiagnostic("missing-collider");
  }

  onPhysicsUpdate(): void {
    if (this._skipNextPhysicsUpdate) {
      this._skipNextPhysicsUpdate = false;
      this._resetStepState();
      return;
    }

    const profilingEnabled = this.profilingEnabled;
    const totalStart = profilingEnabled ? readPerformanceNow() : 0;
    this._resetStepState();

    if (!this.enabled) {
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }

    let collider = this._dynamicCollider;
    if (!collider) {
      collider = this.entity.getComponent(DynamicCollider);
      this._dynamicCollider = collider;
      if (!collider) {
        this._reportDiagnostic("missing-collider");
        this._finishProfiling(profilingEnabled, totalStart);
        return;
      }
    }
    if (!collider.enabled) {
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }

    const provider = this.surfaceProvider;
    if (!provider) {
      this._reportDiagnostic("missing-provider");
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }
    if (collider.isKinematic) {
      this._reportDiagnostic("kinematic");
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }

    const mass = collider.mass;
    if (!Number.isFinite(mass) || mass <= 0) {
      this._reportDiagnostic("invalid-mass");
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }

    this._gravity.copyFrom(this.scene.physics.gravity);
    if (!isFiniteVector(this._gravity) || this._gravity.lengthSquared() <= FORCE_EPSILON_SQUARED) {
      this._reportDiagnostic("invalid-gravity");
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }

    const configuredPontoonCount = this.pontoons.length;
    if (configuredPontoonCount < 1 || configuredPontoonCount > MAX_PONTOON_COUNT) {
      this._reportDiagnostic("invalid-pontoon-count");
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }
    if (
      !Number.isFinite(this.buoyancyCoefficient) ||
      this.buoyancyCoefficient < 0 ||
      !Number.isFinite(this.verticalDamping) ||
      this.verticalDamping < 0 ||
      !Number.isFinite(this.maxForceMultiplier) ||
      this.maxForceMultiplier < 0
    ) {
      this._reportDiagnostic("invalid-parameters");
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }

    const pontoonCount = configuredPontoonCount;
    const transform = this.entity.transform;
    const worldMatrix = transform.worldMatrix;
    const lossyWorldScale = transform.lossyWorldScale;
    const radiusScale = Math.max(Math.abs(lossyWorldScale.x), Math.abs(lossyWorldScale.y), Math.abs(lossyWorldScale.z));
    let totalRadiusCubed = 0;

    for (let i = 0; i < pontoonCount; i++) {
      const pontoon = this.pontoons[i];
      const state = this._mutablePontoonStates[i];
      if (!pontoon || !pontoon.enabled) continue;

      if (!pontoon.localPosition || !isFiniteVector(pontoon.localPosition)) {
        this._reportDiagnostic("invalid-pontoon");
        this._finishProfiling(profilingEnabled, totalStart);
        return;
      }

      state.enabled = true;
      Vector3.transformCoordinate(pontoon.localPosition, worldMatrix, state.worldPosition);
      const worldRadius = pontoon.radius * radiusScale;
      state.worldRadius = worldRadius;
      const radiusCubed = BuoyancySolver.computeRadiusCubed(worldRadius);
      if (!isFiniteVector(state.worldPosition) || radiusCubed === 0) {
        this._reportDiagnostic("invalid-pontoon");
        this._finishProfiling(profilingEnabled, totalStart);
        return;
      }
      totalRadiusCubed += radiusCubed;
    }

    if (!Number.isFinite(totalRadiusCubed)) {
      this._reportDiagnostic("invalid-pontoon");
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }
    if (totalRadiusCubed <= 0) {
      this._finishProfiling(profilingEnabled, totalStart);
      return;
    }

    this._linearVelocity.copyFrom(collider.linearVelocity);
    this._angularVelocityDegrees.copyFrom(collider.angularVelocity);
    this._localCenterOfMass.copyFrom(collider.centerOfMass);
    Vector3.transformCoordinate(this._localCenterOfMass, worldMatrix, this._worldCenterOfMass);

    const input = this._solverInput;
    input.waterVelocity = this._surfaceSample.waterVelocity;
    input.linearVelocity = this._linearVelocity;
    input.angularVelocityDegrees = this._angularVelocityDegrees;
    input.worldCenterOfMass = this._worldCenterOfMass;
    input.gravity = this._gravity;
    input.totalRadiusCubed = totalRadiusCubed;
    input.mass = mass;
    input.buoyancyCoefficient = this.buoyancyCoefficient;
    input.verticalDamping = this.verticalDamping;
    input.maxForceMultiplier = this.maxForceMultiplier;

    for (let i = 0; i < pontoonCount; i++) {
      const state = this._mutablePontoonStates[i];
      if (!state.enabled || BuoyancySolver.computeRadiusCubed(state.worldRadius) === 0) continue;

      const queryStart = profilingEnabled ? readPerformanceNow() : 0;
      const surfaceHit = provider.sampleSurface(state.worldPosition, this._surfaceSample);
      if (profilingEnabled) {
        this._mutableProfilingMetrics.queryMs += elapsedMilliseconds(queryStart, readPerformanceNow());
      }
      this._lastStepQueryCount++;
      state.surfaceHit = surfaceHit;
      if (!surfaceHit) continue;

      state.surfacePosition.copyFrom(this._surfaceSample.surfacePosition);
      input.pontoonCenter = state.worldPosition;
      input.surfacePosition = state.surfacePosition;
      input.radius = state.worldRadius;

      const solverStart = profilingEnabled ? readPerformanceNow() : 0;
      BuoyancySolver.computePointForce(input, state, this._solverScratch);
      if (profilingEnabled) {
        this._mutableProfilingMetrics.solverMs += elapsedMilliseconds(solverStart, readPerformanceNow());
      }
      if (state.submergedRatio <= 0) continue;

      this._isInWater = true;
      this._submergedPontoonCount++;
      if (state.force.lengthSquared() <= FORCE_EPSILON_SQUARED) continue;

      const applyForceStart = profilingEnabled ? readPerformanceNow() : 0;
      collider.applyForceAtPosition(state.force, state.worldPosition);
      if (profilingEnabled) {
        this._mutableProfilingMetrics.applyForceMs += elapsedMilliseconds(applyForceStart, readPerformanceNow());
      }
      this._lastStepAppliedForceCount++;
    }

    this._finishProfiling(profilingEnabled, totalStart);
  }

  private _resetStepState(): void {
    this._isInWater = false;
    this._submergedPontoonCount = 0;
    this._lastStepQueryCount = 0;
    this._lastStepAppliedForceCount = 0;
    const profiling = this._mutableProfilingMetrics;
    profiling.queryMs = 0;
    profiling.solverMs = 0;
    profiling.applyForceMs = 0;
    profiling.totalMs = 0;
    for (let i = 0; i < MAX_PONTOON_COUNT; i++) resetPontoonState(this._mutablePontoonStates[i]);
  }

  private _finishProfiling(enabled: boolean, totalStart: number): void {
    if (enabled) {
      this._mutableProfilingMetrics.totalMs = elapsedMilliseconds(totalStart, readPerformanceNow());
    }
  }

  private _reportDiagnostic(code: WaterBuoyancyDiagnosticCode): void {
    this._lastDiagnostic = code;
    const bit = this._diagnosticBit(code);
    if ((this._reportedDiagnosticMask & bit) !== 0) return;
    this._reportedDiagnosticMask |= bit;
    switch (code) {
      case "missing-collider":
        console.warn("[WaterBuoyancy:missing-collider] A DynamicCollider is required on the same entity.");
        break;
      case "missing-provider":
        console.warn("[WaterBuoyancy:missing-provider] Assign a WaterSurfaceProvider before physics simulation.");
        break;
      case "kinematic":
        console.warn("[WaterBuoyancy:kinematic] Buoyancy only supports non-kinematic DynamicCollider instances.");
        break;
      case "invalid-mass":
        console.warn("[WaterBuoyancy:invalid-mass] DynamicCollider mass must be finite and greater than zero.");
        break;
      case "invalid-gravity":
        console.warn("[WaterBuoyancy:invalid-gravity] Scene physics gravity must be finite and non-zero.");
        break;
      case "invalid-pontoon-count":
        console.warn("[WaterBuoyancy:invalid-pontoon-count] Configure between one and eight Pontoons.");
        break;
      case "invalid-parameters":
        console.warn("[WaterBuoyancy:invalid-parameters] Force coefficients must be finite and non-negative.");
        break;
      case "invalid-pontoon":
        console.warn("[WaterBuoyancy:invalid-pontoon] Enabled Pontoons require a finite position and positive radius.");
        break;
    }
  }

  private _diagnosticBit(code: WaterBuoyancyDiagnosticCode): number {
    switch (code) {
      case "missing-collider":
        return 1 << 0;
      case "missing-provider":
        return 1 << 1;
      case "kinematic":
        return 1 << 2;
      case "invalid-mass":
        return 1 << 3;
      case "invalid-gravity":
        return 1 << 4;
      case "invalid-pontoon-count":
        return 1 << 5;
      case "invalid-parameters":
        return 1 << 6;
      case "invalid-pontoon":
        return 1 << 7;
    }
  }
}
