/** Demo-only River cube stream driven by Galacean lifecycle and public physics APIs. */
import {
  BlinnPhongMaterial,
  BoxColliderShape,
  Color,
  DynamicCollider,
  MeshRenderer,
  ModelMesh,
  PhysicsMaterial,
  PrimitiveMesh,
  Script,
  Vector3,
  type Entity
} from "@galacean/engine";
import { WaterBuoyancy } from "../../runtime/buoyancy/WaterBuoyancy";
import {
  createWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample
} from "../../runtime/query/WaterSurfaceProvider";
import {
  RIVER_DRIFT_BODY_MASS,
  RIVER_DRIFT_CUBE_SIZE,
  RIVER_DRIFT_DEFAULT_SEED,
  RIVER_DRIFT_DOWNSTREAM_COMPLETION_RATIO,
  RIVER_DRIFT_MAX_ACTIVE_COUNT,
  RIVER_DRIFT_MAX_LIFETIME_SECONDS,
  RIVER_DRIFT_OFF_WATER_GRACE_SECONDS,
  RIVER_DRIFT_SPAWN_SNAPSHOT_CAPACITY,
  RiverDriftRandom,
  RiverDriftSpawnScheduler,
  createRiverDriftPontoons,
  createRiverDriftProjection,
  createRiverDriftSpawnPlan,
  normalizeRiverDriftSeed,
  projectRiverDriftProgress,
  type RiverDriftCompiledData,
  type RiverDriftCompiledReach,
  type RiverDriftProjection
} from "./riverDriftFixture";

const BODY_LINEAR_DAMPING = 0.025;
const BODY_ANGULAR_DAMPING = 0.12;
const BODY_STATIC_FRICTION = 0.18;
const BODY_DYNAMIC_FRICTION = 0.12;
const BUOYANCY_COEFFICIENT = 2.15;
const VERTICAL_DAMPING = 2.2;
const MAX_VERTICAL_FORCE_MULTIPLIER = 4.5;
const HORIZONTAL_LINEAR_DRAG = 0;
const WATER_DENSITY = 1000;
const HORIZONTAL_DRAG_COEFFICIENT = 0.5;
const HORIZONTAL_DRAG_AREA_SCALE = 1;
const MAX_HORIZONTAL_DRAG_SPEED = 5;
const MAX_HORIZONTAL_FORCE_MULTIPLIER = 2;
const FREE_FALL_VELOCITY_THRESHOLD = -0.25;

export type RiverDriftDestroyReason =
  | ""
  | "capacity"
  | "downstream"
  | "expired"
  | "off-water"
  | "below-catch-plane"
  | "non-finite"
  | "reset"
  | "destroyed";

export interface RiverDriftSpawnerOptions {
  readonly compiledData: RiverDriftCompiledData;
  readonly surfaceProvider: WaterSurfaceProvider;
  readonly seed?: number;
  readonly catchPlaneY?: number;
  readonly startPaused?: boolean;
}

export interface RiverDriftVectorSnapshot {
  x: number;
  y: number;
  z: number;
}

/** Fixed-capacity slot. Object and nested vector identities stay stable for browser automation. */
export interface RiverDriftInstanceSnapshot {
  valid: boolean;
  active: boolean;
  spawnIndex: number;
  scheduledTime: number;
  actualTime: number;
  heightOffset: number;
  laneOffset: number;
  yawDegrees: number;
  spawnReachRatio: number;
  spawnReachDistance: number;
  currentReachDistance: number;
  downstreamDistance: number;
  normalizedReachDistance: number;
  age: number;
  inWater: boolean;
  enteredWater: boolean;
  firstWaterTime: number;
  hadFreeFall: boolean;
  minPreWaterVerticalVelocity: number;
  finite: boolean;
  destroyReason: RiverDriftDestroyReason;
  readonly spawnPosition: RiverDriftVectorSnapshot;
  readonly position: RiverDriftVectorSnapshot;
  readonly velocity: RiverDriftVectorSnapshot;
  readonly waterVelocity: RiverDriftVectorSnapshot;
}

export interface RiverDriftSpawnerMetrics {
  enabled: boolean;
  currentInfluenceEnabled: boolean;
  seed: number;
  spawnedTotal: number;
  activeCount: number;
  inWaterCount: number;
  submergedPontoonCount: number;
  queryCountPerStep: number;
  appliedForceCountPerStep: number;
  enteredWaterTotal: number;
  completedDownstream: number;
  destroyedTotal: number;
  rejectedCount: number;
  lastSpawnHeight: number;
  maxDownstreamDistance: number;
  finite: boolean;
  runtimeError: string;
  streamElapsedTime: number;
}

interface ActiveRiverDriftInstance {
  entity: Entity | null;
  collider: DynamicCollider | null;
  buoyancy: WaterBuoyancy | null;
  reach: RiverDriftCompiledReach | null;
  snapshot: RiverDriftInstanceSnapshot | null;
  snapshotSpawnIndex: number;
  offWaterElapsed: number;
  readonly queryPosition: Vector3;
  readonly surfaceSample: WaterSurfaceSample;
  readonly projection: RiverDriftProjection;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function createVectorSnapshot(): RiverDriftVectorSnapshot {
  return { x: 0, y: 0, z: 0 };
}

function createInstanceSnapshot(): RiverDriftInstanceSnapshot {
  return {
    valid: false,
    active: false,
    spawnIndex: -1,
    scheduledTime: 0,
    actualTime: 0,
    heightOffset: 0,
    laneOffset: 0,
    yawDegrees: 0,
    spawnReachRatio: 0,
    spawnReachDistance: 0,
    currentReachDistance: 0,
    downstreamDistance: 0,
    normalizedReachDistance: 0,
    age: 0,
    inWater: false,
    enteredWater: false,
    firstWaterTime: -1,
    hadFreeFall: false,
    minPreWaterVerticalVelocity: 0,
    finite: true,
    destroyReason: "",
    spawnPosition: createVectorSnapshot(),
    position: createVectorSnapshot(),
    velocity: createVectorSnapshot(),
    waterVelocity: createVectorSnapshot()
  };
}

function createActiveInstance(): ActiveRiverDriftInstance {
  return {
    entity: null,
    collider: null,
    buoyancy: null,
    reach: null,
    snapshot: null,
    snapshotSpawnIndex: -1,
    offWaterElapsed: 0,
    queryPosition: new Vector3(),
    surfaceSample: createWaterSurfaceSample(),
    projection: createRiverDriftProjection()
  };
}

/**
 * Spawns and observes drifting bodies from Script.onUpdate only.
 * Water forces remain exclusively owned by WaterBuoyancy.onPhysicsUpdate.
 */
export class RiverDriftSpawner extends Script {
  readonly metrics: RiverDriftSpawnerMetrics = {
    enabled: false,
    currentInfluenceEnabled: true,
    seed: RIVER_DRIFT_DEFAULT_SEED,
    spawnedTotal: 0,
    activeCount: 0,
    inWaterCount: 0,
    submergedPontoonCount: 0,
    queryCountPerStep: 0,
    appliedForceCountPerStep: 0,
    enteredWaterTotal: 0,
    completedDownstream: 0,
    destroyedTotal: 0,
    rejectedCount: 0,
    lastSpawnHeight: 0,
    maxDownstreamDistance: 0,
    finite: true,
    runtimeError: "",
    streamElapsedTime: 0
  };
  readonly snapshots: readonly RiverDriftInstanceSnapshot[];

  private readonly _mutableMetrics = this.metrics as Mutable<RiverDriftSpawnerMetrics>;
  private readonly _mutableSnapshots: RiverDriftInstanceSnapshot[] = [];
  private readonly _instances: ActiveRiverDriftInstance[] = [];
  private readonly _random = new RiverDriftRandom();
  private readonly _scheduler = new RiverDriftSpawnScheduler();
  private _compiledData: RiverDriftCompiledData | null = null;
  private _surfaceProvider: WaterSurfaceProvider | null = null;
  private _sharedMesh: ModelMesh | null = null;
  private _sharedMaterial: BlinnPhongMaterial | null = null;
  private _sharedPhysicsMaterial: PhysicsMaterial | null = null;
  private _catchPlaneY = -8;
  private _spawnIndex = 0;
  private _currentInfluenceEnabled = true;
  private _configured = false;
  private _disposed = false;

  constructor(entity: Entity) {
    super(entity);
    for (let index = 0; index < RIVER_DRIFT_SPAWN_SNAPSHOT_CAPACITY; index++) {
      this._mutableSnapshots.push(createInstanceSnapshot());
    }
    for (let index = 0; index < RIVER_DRIFT_MAX_ACTIVE_COUNT; index++) {
      this._instances.push(createActiveInstance());
    }
    this.snapshots = this._mutableSnapshots;
  }

  configure(options: RiverDriftSpawnerOptions): void {
    if (this._configured || this._disposed) this._disposeResources("destroyed");
    this._disposed = false;
    this._compiledData = options.compiledData;
    this._surfaceProvider = options.surfaceProvider;
    this._catchPlaneY = Number.isFinite(options.catchPlaneY) ? options.catchPlaneY! : -8;
    const seed = normalizeRiverDriftSeed(options.seed ?? RIVER_DRIFT_DEFAULT_SEED);
    this._sharedMesh = PrimitiveMesh.createCuboid(
      this.engine,
      RIVER_DRIFT_CUBE_SIZE,
      RIVER_DRIFT_CUBE_SIZE,
      RIVER_DRIFT_CUBE_SIZE
    );
    this._sharedMesh.isGCIgnored = true;
    this._sharedMaterial = new BlinnPhongMaterial(this.engine);
    this._sharedMaterial.baseColor = new Color(0.9, 0.46, 0.12, 1);
    this._sharedMaterial.specularColor = new Color(0.94, 0.82, 0.58, 1);
    this._sharedMaterial.emissiveColor = new Color(0.035, 0.012, 0.004, 1);
    this._sharedMaterial.shininess = 30;
    this._sharedMaterial.isGCIgnored = true;
    this._sharedPhysicsMaterial = new PhysicsMaterial();
    this._sharedPhysicsMaterial.staticFriction = BODY_STATIC_FRICTION;
    this._sharedPhysicsMaterial.dynamicFriction = BODY_DYNAMIC_FRICTION;
    this._sharedPhysicsMaterial.bounciness = 0;
    this._configured = true;
    this._resetState(seed, Boolean(options.startPaused));
  }

  start(): void {
    if (!this._configured || this._disposed) return;
    this._scheduler.start();
    this._mutableMetrics.enabled = true;
  }

  pause(): void {
    this._scheduler.pause();
    this._mutableMetrics.enabled = false;
  }

  /** A/B control for the Current contribution without changing vertical buoyancy or the surface provider. */
  setCurrentInfluenceEnabled(enabled: boolean): void {
    this._currentInfluenceEnabled = enabled;
    this._mutableMetrics.currentInfluenceEnabled = enabled;
    for (const instance of this._instances) {
      if (instance.buoyancy) instance.buoyancy.applyHorizontalDrag = enabled;
    }
  }

  /** Clears active bodies and rewinds seed, spawn index, scheduler, metrics, and snapshots. */
  reset(seed = this.metrics.seed): void {
    if (!this._configured || this._disposed) return;
    const wasPaused = this._scheduler.paused;
    this._resetState(normalizeRiverDriftSeed(seed), wasPaused);
  }

  /** Removes current bodies without changing deterministic scheduler or accumulated metrics. */
  clear(): void {
    this._clearInstances("reset", false);
    this._mutableMetrics.inWaterCount = 0;
    this._mutableMetrics.submergedPontoonCount = 0;
    this._mutableMetrics.queryCountPerStep = 0;
    this._mutableMetrics.appliedForceCountPerStep = 0;
  }

  /** Releases the shared visual assets and permanently stops this configured stream. */
  destroyStream(): void {
    this._disposeResources("destroyed");
  }

  onUpdate(deltaTime: number): void {
    if (!this._configured || this._disposed) return;
    try {
      this._updateInstances(deltaTime);
      this._scheduler.advance(deltaTime);
      this._mutableMetrics.streamElapsedTime = this._scheduler.elapsedTime;
      let scheduledTime = this._scheduler.consumeNextScheduledTime();
      while (scheduledTime !== undefined) {
        this._spawn(scheduledTime);
        scheduledTime = this._scheduler.consumeNextScheduledTime();
      }
    } catch (error: unknown) {
      this._mutableMetrics.finite = false;
      this._mutableMetrics.runtimeError = error instanceof Error ? error.message : String(error);
      this.pause();
    }
  }

  onDestroy(): void {
    this._disposeResources("destroyed");
  }

  private _resetState(seed: number, paused: boolean): void {
    this._clearInstances("reset", false);
    this._random.reset(seed);
    this._scheduler.reset(paused);
    this._spawnIndex = 0;
    for (const snapshot of this._mutableSnapshots) resetSnapshot(snapshot);
    this._mutableMetrics.enabled = !paused;
    this._mutableMetrics.currentInfluenceEnabled = this._currentInfluenceEnabled;
    this._mutableMetrics.seed = seed;
    this._mutableMetrics.spawnedTotal = 0;
    this._mutableMetrics.activeCount = 0;
    this._mutableMetrics.inWaterCount = 0;
    this._mutableMetrics.submergedPontoonCount = 0;
    this._mutableMetrics.queryCountPerStep = 0;
    this._mutableMetrics.appliedForceCountPerStep = 0;
    this._mutableMetrics.enteredWaterTotal = 0;
    this._mutableMetrics.completedDownstream = 0;
    this._mutableMetrics.destroyedTotal = 0;
    this._mutableMetrics.rejectedCount = 0;
    this._mutableMetrics.lastSpawnHeight = 0;
    this._mutableMetrics.maxDownstreamDistance = 0;
    this._mutableMetrics.finite = true;
    this._mutableMetrics.runtimeError = "";
    this._mutableMetrics.streamElapsedTime = 0;
  }

  private _spawn(scheduledTime: number): void {
    const data = this._compiledData;
    const provider = this._surfaceProvider;
    const mesh = this._sharedMesh;
    const material = this._sharedMaterial;
    const physicsMaterial = this._sharedPhysicsMaterial;
    if (!data || !provider || !mesh || !material || !physicsMaterial) return;
    const spawnPlan = createRiverDriftSpawnPlan(data, provider, this._random);
    if (!spawnPlan) {
      this._mutableMetrics.rejectedCount++;
      return;
    }

    let slot = this._findFreeInstance();
    if (!slot) {
      slot = this._findOldestInstance();
      if (!slot) return;
      this._destroyInstance(slot, "capacity", true);
    }

    const spawnIndex = this._spawnIndex++;
    const snapshot = this._mutableSnapshots[spawnIndex % this._mutableSnapshots.length];
    resetSnapshot(snapshot);
    snapshot.valid = true;
    snapshot.active = true;
    snapshot.spawnIndex = spawnIndex;
    snapshot.scheduledTime = scheduledTime;
    snapshot.actualTime = this._scheduler.elapsedTime;
    snapshot.heightOffset = spawnPlan.heightOffset;
    snapshot.laneOffset = spawnPlan.laneOffset;
    snapshot.yawDegrees = spawnPlan.yawDegrees;
    snapshot.spawnReachRatio = spawnPlan.reachRatio;
    snapshot.spawnReachDistance = spawnPlan.reachDistance;
    snapshot.currentReachDistance = spawnPlan.reachDistance;
    snapshot.normalizedReachDistance = spawnPlan.reachRatio;
    copyVector(snapshot.spawnPosition, spawnPlan.position);
    copyVector(snapshot.position, spawnPlan.position);

    const entity = this.entity.createChild(`river-drift-cube-${spawnIndex}`);
    entity.transform.setPosition(spawnPlan.position.x, spawnPlan.position.y, spawnPlan.position.z);
    entity.transform.setRotation(0, spawnPlan.yawDegrees, 0);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);

    const collider = entity.addComponent(DynamicCollider);
    const shape = new BoxColliderShape();
    const defaultPhysicsMaterial = shape.material;
    shape.material = physicsMaterial;
    defaultPhysicsMaterial.destroy();
    shape.size = new Vector3(RIVER_DRIFT_CUBE_SIZE, RIVER_DRIFT_CUBE_SIZE, RIVER_DRIFT_CUBE_SIZE);
    collider.addShape(shape);
    collider.mass = RIVER_DRIFT_BODY_MASS;
    collider.linearDamping = BODY_LINEAR_DAMPING;
    collider.angularDamping = BODY_ANGULAR_DAMPING;

    const buoyancy = entity.addComponent(WaterBuoyancy);
    buoyancy.surfaceProvider = provider;
    buoyancy.pontoons = createRiverDriftPontoons();
    buoyancy.buoyancyCoefficient = BUOYANCY_COEFFICIENT;
    buoyancy.verticalDamping = VERTICAL_DAMPING;
    buoyancy.maxForceMultiplier = MAX_VERTICAL_FORCE_MULTIPLIER;
    buoyancy.applyHorizontalDrag = this._currentInfluenceEnabled;
    buoyancy.horizontalLinearDrag = HORIZONTAL_LINEAR_DRAG;
    buoyancy.waterDensity = WATER_DENSITY;
    buoyancy.horizontalDragCoefficient = HORIZONTAL_DRAG_COEFFICIENT;
    buoyancy.horizontalDragAreaScale = HORIZONTAL_DRAG_AREA_SCALE;
    buoyancy.maxHorizontalDragSpeed = MAX_HORIZONTAL_DRAG_SPEED;
    buoyancy.maxHorizontalForceMultiplier = MAX_HORIZONTAL_FORCE_MULTIPLIER;

    slot.entity = entity;
    slot.collider = collider;
    slot.buoyancy = buoyancy;
    slot.reach = spawnPlan.reach;
    slot.snapshot = snapshot;
    slot.snapshotSpawnIndex = spawnIndex;
    slot.offWaterElapsed = 0;
    this._mutableMetrics.spawnedTotal++;
    this._mutableMetrics.activeCount++;
    this._mutableMetrics.lastSpawnHeight = spawnPlan.heightOffset;
  }

  private _updateInstances(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) return;
    const provider = this._surfaceProvider;
    for (const instance of this._instances) {
      const { entity, collider, buoyancy, reach, snapshot } = instance;
      if (!entity || !collider || !buoyancy || !reach || !snapshot) continue;
      if (snapshot.spawnIndex !== instance.snapshotSpawnIndex) {
        this._destroyInstance(instance, "non-finite", true);
        continue;
      }

      snapshot.age += deltaTime;
      const position = entity.transform.worldPosition;
      const velocity = collider.linearVelocity;
      copyVector(snapshot.position, position);
      copyVector(snapshot.velocity, velocity);
      const finite = isFiniteVector(position) && isFiniteVector(velocity);
      snapshot.finite &&= finite;
      if (!finite) {
        this._mutableMetrics.finite = false;
        this._destroyInstance(instance, "non-finite", true);
        continue;
      }

      if (!snapshot.enteredWater && velocity.y < FREE_FALL_VELOCITY_THRESHOLD) snapshot.hadFreeFall = true;
      if (!snapshot.enteredWater) {
        snapshot.minPreWaterVerticalVelocity = Math.min(snapshot.minPreWaterVerticalVelocity, velocity.y);
      }
      snapshot.inWater = buoyancy.isInWater;
      if (snapshot.inWater) {
        if (!snapshot.enteredWater) {
          snapshot.enteredWater = true;
          snapshot.firstWaterTime = this._scheduler.elapsedTime;
          this._mutableMetrics.enteredWaterTotal++;
        }
      }

      instance.queryPosition.copyFrom(position);
      const insideFootprint = provider?.sampleSurface(instance.queryPosition, instance.surfaceSample) ?? false;
      if (insideFootprint) {
        instance.offWaterElapsed = 0;
        copyVector(snapshot.waterVelocity, instance.surfaceSample.waterVelocity);
      } else {
        instance.offWaterElapsed += deltaTime;
        zeroVector(snapshot.waterVelocity);
      }

      if (projectRiverDriftProgress(reach, position.x, position.z, instance.projection)) {
        snapshot.currentReachDistance = instance.projection.distance;
        snapshot.normalizedReachDistance = instance.projection.normalizedDistance;
        snapshot.downstreamDistance = Math.max(0, instance.projection.distance - snapshot.spawnReachDistance);
        this._mutableMetrics.maxDownstreamDistance = Math.max(
          this._mutableMetrics.maxDownstreamDistance,
          snapshot.downstreamDistance
        );
      }

      if (snapshot.normalizedReachDistance >= RIVER_DRIFT_DOWNSTREAM_COMPLETION_RATIO) {
        this._mutableMetrics.completedDownstream++;
        this._destroyInstance(instance, "downstream", true);
      } else if (snapshot.age >= RIVER_DRIFT_MAX_LIFETIME_SECONDS) {
        this._destroyInstance(instance, "expired", true);
      } else if (instance.offWaterElapsed >= RIVER_DRIFT_OFF_WATER_GRACE_SECONDS) {
        this._destroyInstance(instance, "off-water", true);
      } else if (position.y < this._catchPlaneY) {
        this._destroyInstance(instance, "below-catch-plane", true);
      }
    }
    let inWaterCount = 0;
    let submergedPontoonCount = 0;
    let queryCountPerStep = 0;
    let appliedForceCountPerStep = 0;
    for (const instance of this._instances) {
      if (instance.snapshot?.inWater) inWaterCount++;
      const buoyancy = instance.buoyancy;
      if (!buoyancy) continue;
      submergedPontoonCount += buoyancy.submergedPontoonCount;
      queryCountPerStep += buoyancy.lastStepQueryCount;
      appliedForceCountPerStep += buoyancy.lastStepAppliedForceCount;
    }
    this._mutableMetrics.inWaterCount = inWaterCount;
    this._mutableMetrics.submergedPontoonCount = submergedPontoonCount;
    this._mutableMetrics.queryCountPerStep = queryCountPerStep;
    this._mutableMetrics.appliedForceCountPerStep = appliedForceCountPerStep;
  }

  private _findFreeInstance(): ActiveRiverDriftInstance | null {
    for (const instance of this._instances) {
      if (!instance.entity) return instance;
    }
    return null;
  }

  private _findOldestInstance(): ActiveRiverDriftInstance | null {
    let oldest: ActiveRiverDriftInstance | null = null;
    let oldestSpawnIndex = Number.POSITIVE_INFINITY;
    for (const instance of this._instances) {
      const spawnIndex = instance.snapshot?.spawnIndex;
      if (spawnIndex !== undefined && spawnIndex < oldestSpawnIndex) {
        oldest = instance;
        oldestSpawnIndex = spawnIndex;
      }
    }
    return oldest;
  }

  private _destroyInstance(
    instance: ActiveRiverDriftInstance,
    reason: RiverDriftDestroyReason,
    countDestroyed: boolean
  ): void {
    const snapshot = instance.snapshot;
    if (snapshot && snapshot.spawnIndex === instance.snapshotSpawnIndex) {
      snapshot.active = false;
      snapshot.inWater = false;
      snapshot.destroyReason = reason;
    }
    instance.entity?.destroy();
    instance.entity = null;
    instance.collider = null;
    instance.buoyancy = null;
    instance.reach = null;
    instance.snapshot = null;
    instance.snapshotSpawnIndex = -1;
    instance.offWaterElapsed = 0;
    if (countDestroyed) {
      this._mutableMetrics.destroyedTotal++;
      this._mutableMetrics.activeCount = Math.max(0, this._mutableMetrics.activeCount - 1);
    }
  }

  private _clearInstances(reason: RiverDriftDestroyReason, countDestroyed: boolean): void {
    for (const instance of this._instances) {
      if (instance.entity) this._destroyInstance(instance, reason, countDestroyed);
    }
    this._mutableMetrics.activeCount = 0;
  }

  private _disposeResources(reason: RiverDriftDestroyReason): void {
    this.pause();
    this._clearInstances(reason, false);
    this._sharedPhysicsMaterial?.destroy();
    this._sharedMesh?.destroy(true);
    this._sharedMaterial?.destroy(true);
    this._sharedPhysicsMaterial = null;
    this._sharedMesh = null;
    this._sharedMaterial = null;
    this._compiledData = null;
    this._surfaceProvider = null;
    this._configured = false;
    this._disposed = true;
    this._mutableMetrics.activeCount = 0;
    this._mutableMetrics.inWaterCount = 0;
    this._mutableMetrics.submergedPontoonCount = 0;
    this._mutableMetrics.queryCountPerStep = 0;
    this._mutableMetrics.appliedForceCountPerStep = 0;
  }
}

function resetSnapshot(snapshot: RiverDriftInstanceSnapshot): void {
  snapshot.valid = false;
  snapshot.active = false;
  snapshot.spawnIndex = -1;
  snapshot.scheduledTime = 0;
  snapshot.actualTime = 0;
  snapshot.heightOffset = 0;
  snapshot.laneOffset = 0;
  snapshot.yawDegrees = 0;
  snapshot.spawnReachRatio = 0;
  snapshot.spawnReachDistance = 0;
  snapshot.currentReachDistance = 0;
  snapshot.downstreamDistance = 0;
  snapshot.normalizedReachDistance = 0;
  snapshot.age = 0;
  snapshot.inWater = false;
  snapshot.enteredWater = false;
  snapshot.firstWaterTime = -1;
  snapshot.hadFreeFall = false;
  snapshot.minPreWaterVerticalVelocity = 0;
  snapshot.finite = true;
  snapshot.destroyReason = "";
  zeroVector(snapshot.spawnPosition);
  zeroVector(snapshot.position);
  zeroVector(snapshot.velocity);
  zeroVector(snapshot.waterVelocity);
}

function copyVector(target: RiverDriftVectorSnapshot, source: Vector3): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function zeroVector(target: RiverDriftVectorSnapshot): void {
  target.x = 0;
  target.y = 0;
  target.z = 0;
}

function isFiniteVector(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
