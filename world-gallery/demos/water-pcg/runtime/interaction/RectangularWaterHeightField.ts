import type { Vector3 } from "@galacean/engine-math";
import type { WaterSurfaceInteractionSink } from "./WaterSurfaceInteractionSink";

const DEFAULT_QUEUE_CAPACITY = 8;
const MIN_INTERACTION_RADIUS = 0.5;
const MAX_INTERACTION_RADIUS = 1.5;
const ENTRY_IMPULSE_SCALE = 0.08;
const MAX_ENTRY_IMPULSE = 0.8;
const CONTINUOUS_IMPULSE_SCALE = 0.012;
const MAX_CONTINUOUS_IMPULSE = 0.08;
const MIN_CONTINUOUS_NORMAL_SPEED = 0.05;
const CONTACT_DEPTH_RADIUS_SCALE = 0.36;
const CONTACT_MAX_DISPLACEMENT_RATIO = 0.88;
const CONTACT_RADIUS_BASE_SCALE = 1.1;
const CONTACT_RADIUS_WEIGHT_SCALE = 0.45;
const CONTACT_RIM_RADIUS_SCALE = 2.1;
const CONTACT_STIFFNESS = 150;
const CONTACT_DAMPING = 12;
const MAX_CONTACT_ACCELERATION = 24;
const ACTIVE_EPSILON = 1e-7;

export type RectangularWaterHeightFieldDiagnostic = "none" | "cfl-unsafe" | "non-finite-state";

export interface RectangularWaterHeightFieldOptions {
  readonly centerX: number;
  readonly centerZ: number;
  /** Normalized world-XZ direction corresponding to increasing local X. */
  readonly lengthAxisX: number;
  readonly lengthAxisZ: number;
  readonly length: number;
  readonly width: number;
  readonly resolutionX: number;
  readonly resolutionZ: number;
  readonly waveSpeed: number;
  readonly damping: number;
  readonly maxDisplacement: number;
  readonly maximumCfl?: number;
  readonly interactionQueueCapacity?: number;
}

/** Caller-owned scalar sample used by height-field queries. */
export interface RectangularWaterHeightFieldSample {
  height: number;
  verticalVelocity: number;
  gradientLocalX: number;
  gradientLocalZ: number;
}

/** Caller-owned scalar coordinate used by the field's world/local helpers. */
export interface WaterHeightFieldCoordinate {
  x: number;
  z: number;
}

function isFiniteVector(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validateOptions(options: RectangularWaterHeightFieldOptions): void {
  const finiteValues = [
    options.centerX,
    options.centerZ,
    options.lengthAxisX,
    options.lengthAxisZ,
    options.length,
    options.width,
    options.waveSpeed,
    options.damping,
    options.maxDisplacement,
    options.maximumCfl ?? 0.9
  ];
  if (finiteValues.some((value) => !Number.isFinite(value))) {
    throw new Error("RectangularWaterHeightField options must be finite.");
  }
  if (
    options.length <= 0 ||
    options.width <= 0 ||
    options.waveSpeed <= 0 ||
    options.damping < 0 ||
    options.maxDisplacement <= 0 ||
    (options.maximumCfl ?? 0.9) <= 0 ||
    !Number.isInteger(options.resolutionX) ||
    !Number.isInteger(options.resolutionZ) ||
    options.resolutionX < 3 ||
    options.resolutionZ < 3
  ) {
    throw new Error("RectangularWaterHeightField dimensions and simulation parameters are invalid.");
  }
  const axisLength = Math.hypot(options.lengthAxisX, options.lengthAxisZ);
  if (axisLength <= Number.EPSILON) {
    throw new Error("RectangularWaterHeightField length axis must be non-zero.");
  }
  const queueCapacity = options.interactionQueueCapacity ?? DEFAULT_QUEUE_CAPACITY;
  if (!Number.isInteger(queueCapacity) || queueCapacity < 1) {
    throw new Error("RectangularWaterHeightField interaction queue capacity must be a positive integer.");
  }
}

/**
 * Bounded, CPU-side damped wave field for one rectangular water domain.
 *
 * It owns no timer or frame loop. Callers advance it once from Galacean's fixed
 * physics callback and query the same arrays for rendering and buoyancy.
 */
export class RectangularWaterHeightField implements WaterSurfaceInteractionSink {
  heightCurrent: Float32Array;
  readonly verticalVelocity: Float32Array;
  readonly resolutionX: number;
  readonly resolutionZ: number;
  readonly length: number;
  readonly width: number;
  readonly cellSizeX: number;
  readonly cellSizeZ: number;
  readonly waveSpeed: number;
  readonly damping: number;
  readonly maxDisplacement: number;
  readonly maximumCfl: number;

  private _heightNext: Float32Array;
  private readonly _centerX: number;
  private readonly _centerZ: number;
  private readonly _lengthAxisX: number;
  private readonly _lengthAxisZ: number;
  private readonly _widthAxisX: number;
  private readonly _widthAxisZ: number;
  private readonly _queueLocalX: Float32Array;
  private readonly _queueLocalZ: Float32Array;
  private readonly _queueRadius: Float32Array;
  private readonly _queueImpulse: Float32Array;
  private readonly _queueTargetHeight: Float32Array;
  private readonly _queuePriority: Float32Array;
  private _queueCount = 0;
  private _revision = 0;
  private _diagnostic: RectangularWaterHeightFieldDiagnostic = "none";
  private _resetCount = 0;
  private _droppedInteractionCount = 0;
  private _entryInteractionCount = 0;
  private _continuousInteractionCount = 0;
  private _contactInteractionCount = 0;
  private _maximumAbsHeight = 0;
  private _maximumAbsVelocity = 0;
  private _maximumBoundaryAbsHeight = 0;
  private _currentContactDepression = 0;
  private _maximumContactDepression = 0;
  private _currentContactRimHeight = 0;
  private _maximumContactRimHeight = 0;
  private _lastInteractionLocalX = 0;
  private _lastInteractionLocalZ = 0;
  private _lastContactRadius = 0;
  private _contactAppliedThisStep = false;

  constructor(options: RectangularWaterHeightFieldOptions) {
    validateOptions(options);
    const axisLength = Math.hypot(options.lengthAxisX, options.lengthAxisZ);
    this._lengthAxisX = options.lengthAxisX / axisLength;
    this._lengthAxisZ = options.lengthAxisZ / axisLength;
    this._widthAxisX = -this._lengthAxisZ;
    this._widthAxisZ = this._lengthAxisX;
    this._centerX = options.centerX;
    this._centerZ = options.centerZ;
    this.length = options.length;
    this.width = options.width;
    this.resolutionX = options.resolutionX;
    this.resolutionZ = options.resolutionZ;
    this.cellSizeX = options.length / (options.resolutionX - 1);
    this.cellSizeZ = options.width / (options.resolutionZ - 1);
    this.waveSpeed = options.waveSpeed;
    this.damping = options.damping;
    this.maxDisplacement = options.maxDisplacement;
    this.maximumCfl = options.maximumCfl ?? 0.9;

    const sampleCount = options.resolutionX * options.resolutionZ;
    this.heightCurrent = new Float32Array(sampleCount);
    this._heightNext = new Float32Array(sampleCount);
    this.verticalVelocity = new Float32Array(sampleCount);
    const queueCapacity = options.interactionQueueCapacity ?? DEFAULT_QUEUE_CAPACITY;
    this._queueLocalX = new Float32Array(queueCapacity);
    this._queueLocalZ = new Float32Array(queueCapacity);
    this._queueRadius = new Float32Array(queueCapacity);
    this._queueImpulse = new Float32Array(queueCapacity);
    this._queueTargetHeight = new Float32Array(queueCapacity);
    this._queuePriority = new Float32Array(queueCapacity);
  }

  get sampleCount(): number {
    return this.heightCurrent.length;
  }

  get revision(): number {
    return this._revision;
  }

  get pendingInteractionCount(): number {
    return this._queueCount;
  }

  get entryInteractionCount(): number {
    return this._entryInteractionCount;
  }

  get continuousInteractionCount(): number {
    return this._continuousInteractionCount;
  }

  get contactInteractionCount(): number {
    return this._contactInteractionCount;
  }

  get droppedInteractionCount(): number {
    return this._droppedInteractionCount;
  }

  get resetCount(): number {
    return this._resetCount;
  }

  get diagnostic(): RectangularWaterHeightFieldDiagnostic {
    return this._diagnostic;
  }

  get maximumAbsHeight(): number {
    return this._maximumAbsHeight;
  }

  get maximumAbsVelocity(): number {
    return this._maximumAbsVelocity;
  }

  get maximumBoundaryAbsHeight(): number {
    return this._maximumBoundaryAbsHeight;
  }

  get currentContactDepression(): number {
    return this._currentContactDepression;
  }

  get maximumContactDepression(): number {
    return this._maximumContactDepression;
  }

  get currentContactRimHeight(): number {
    return this._currentContactRimHeight;
  }

  get maximumContactRimHeight(): number {
    return this._maximumContactRimHeight;
  }

  get lastInteractionLocalX(): number {
    return this._lastInteractionLocalX;
  }

  get lastInteractionLocalZ(): number {
    return this._lastInteractionLocalZ;
  }

  /** Returns the two-dimensional CFL number for a proposed fixed step. */
  computeCfl(deltaTime: number): number {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return Number.POSITIVE_INFINITY;
    return (
      this.waveSpeed *
      deltaTime *
      Math.sqrt(1 / (this.cellSizeX * this.cellSizeX) + 1 / (this.cellSizeZ * this.cellSizeZ))
    );
  }

  worldToLocal(worldX: number, worldZ: number, out: WaterHeightFieldCoordinate): boolean {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
    const offsetX = worldX - this._centerX;
    const offsetZ = worldZ - this._centerZ;
    out.x = offsetX * this._lengthAxisX + offsetZ * this._lengthAxisZ;
    out.z = offsetX * this._widthAxisX + offsetZ * this._widthAxisZ;
    return true;
  }

  localToWorld(localX: number, localZ: number, out: WaterHeightFieldCoordinate): boolean {
    if (!Number.isFinite(localX) || !Number.isFinite(localZ)) return false;
    out.x = this._centerX + localX * this._lengthAxisX + localZ * this._widthAxisX;
    out.z = this._centerZ + localX * this._lengthAxisZ + localZ * this._widthAxisZ;
    return true;
  }

  localGradientToWorld(localGradientX: number, localGradientZ: number, out: WaterHeightFieldCoordinate): void {
    out.x = localGradientX * this._lengthAxisX + localGradientZ * this._widthAxisX;
    out.z = localGradientX * this._lengthAxisZ + localGradientZ * this._widthAxisZ;
  }

  registerInteraction(
    worldPosition: Vector3,
    surfaceNormal: Vector3,
    relativeVelocity: Vector3,
    radius: number,
    submergedRatio: number,
    enteredWater: boolean
  ): boolean {
    if (
      !isFiniteVector(worldPosition) ||
      !isFiniteVector(surfaceNormal) ||
      !isFiniteVector(relativeVelocity) ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(submergedRatio) ||
      submergedRatio <= 0
    ) {
      return false;
    }

    const offsetX = worldPosition.x - this._centerX;
    const offsetZ = worldPosition.z - this._centerZ;
    const localX = offsetX * this._lengthAxisX + offsetZ * this._lengthAxisZ;
    const localZ = offsetX * this._widthAxisX + offsetZ * this._widthAxisZ;
    if (Math.abs(localX) > this.length * 0.5 || Math.abs(localZ) > this.width * 0.5) return false;

    const relativeNormalSpeed =
      relativeVelocity.x * surfaceNormal.x +
      relativeVelocity.y * surfaceNormal.y +
      relativeVelocity.z * surfaceNormal.z;
    if (!Number.isFinite(relativeNormalSpeed)) return false;
    let impulse = 0;
    if (enteredWater) {
      impulse = -clamp(-relativeNormalSpeed * ENTRY_IMPULSE_SCALE, 0, MAX_ENTRY_IMPULSE);
    } else if (Math.abs(relativeNormalSpeed) > MIN_CONTINUOUS_NORMAL_SPEED) {
      impulse = clamp(
        relativeNormalSpeed * clamp(submergedRatio, 0, 1) * CONTINUOUS_IMPULSE_SCALE,
        -MAX_CONTINUOUS_IMPULSE,
        MAX_CONTINUOUS_IMPULSE
      );
    }
    const clampedSubmergedRatio = clamp(submergedRatio, 0, 1);
    const interfaceWeight = Math.sqrt(clamp(4 * clampedSubmergedRatio * (1 - clampedSubmergedRatio), 0, 1));
    const targetDepth =
      Math.min(this.maxDisplacement * CONTACT_MAX_DISPLACEMENT_RATIO, radius * CONTACT_DEPTH_RADIUS_SCALE) *
      interfaceWeight;
    if (!Number.isFinite(impulse) || (Math.abs(impulse) <= ACTIVE_EPSILON && targetDepth <= ACTIVE_EPSILON)) {
      return false;
    }

    const interactionRadius = clamp(
      radius * (CONTACT_RADIUS_BASE_SCALE + interfaceWeight * CONTACT_RADIUS_WEIGHT_SCALE),
      MIN_INTERACTION_RADIUS,
      MAX_INTERACTION_RADIUS
    );
    const priority = Math.max(Math.abs(impulse), targetDepth);
    const slot = this._reserveQueueSlot(priority);
    if (slot < 0) return false;
    this._queueLocalX[slot] = localX;
    this._queueLocalZ[slot] = localZ;
    this._queueRadius[slot] = interactionRadius;
    this._queueImpulse[slot] = impulse;
    this._queueTargetHeight[slot] = -targetDepth;
    this._queuePriority[slot] = priority;
    this._lastInteractionLocalX = localX;
    this._lastInteractionLocalZ = localZ;
    this._lastContactRadius = interactionRadius;
    if (enteredWater) this._entryInteractionCount++;
    else if (Math.abs(impulse) > ACTIVE_EPSILON) this._continuousInteractionCount++;
    if (targetDepth > ACTIVE_EPSILON) this._contactInteractionCount++;
    return true;
  }

  /** Advances the field once. Returns false when the proposed step is numerically unsafe. */
  step(deltaTime: number): boolean {
    const cfl = this.computeCfl(deltaTime);
    if (!Number.isFinite(cfl) || cfl > this.maximumCfl) {
      this._diagnostic = "cfl-unsafe";
      this._queueCount = 0;
      return false;
    }

    const hadInteractions = this._queueCount > 0;
    this._applyQueuedInteractions(deltaTime);
    const current = this.heightCurrent;
    const next = this._heightNext;
    const velocity = this.verticalVelocity;
    const countX = this.resolutionX;
    const countZ = this.resolutionZ;
    const inverseCellX2 = 1 / (this.cellSizeX * this.cellSizeX);
    const inverseCellZ2 = 1 / (this.cellSizeZ * this.cellSizeZ);
    const waveSpeedSquared = this.waveSpeed * this.waveSpeed;
    const dampingFactor = Math.exp(-this.damping * deltaTime);
    let heightSum = 0;
    let velocitySum = 0;

    for (let z = 0; z < countZ; z++) {
      const previousZ = z === 0 ? 1 : z - 1;
      const nextZ = z === countZ - 1 ? countZ - 2 : z + 1;
      for (let x = 0; x < countX; x++) {
        const previousX = x === 0 ? 1 : x - 1;
        const nextX = x === countX - 1 ? countX - 2 : x + 1;
        const index = z * countX + x;
        const height = current[index];
        const laplacian =
          (current[z * countX + previousX] - height * 2 + current[z * countX + nextX]) * inverseCellX2 +
          (current[previousZ * countX + x] - height * 2 + current[nextZ * countX + x]) * inverseCellZ2;
        const nextVelocity = (velocity[index] + waveSpeedSquared * laplacian * deltaTime) * dampingFactor;
        const nextHeight = clamp(height + nextVelocity * deltaTime, -this.maxDisplacement, this.maxDisplacement);
        velocity[index] = nextVelocity;
        next[index] = nextHeight;
        heightSum += nextHeight;
        velocitySum += nextVelocity;
      }
    }

    const inverseSampleCount = 1 / current.length;
    const meanHeight = heightSum * inverseSampleCount;
    const meanVelocity = velocitySum * inverseSampleCount;
    let maximumAbsHeight = 0;
    let maximumAbsVelocity = 0;
    let maximumBoundaryAbsHeight = 0;
    let finite = true;
    for (let z = 0; z < countZ; z++) {
      for (let x = 0; x < countX; x++) {
        const index = z * countX + x;
        const correctedHeight = clamp(next[index] - meanHeight, -this.maxDisplacement, this.maxDisplacement);
        const correctedVelocity = velocity[index] - meanVelocity;
        next[index] = correctedHeight;
        velocity[index] = correctedVelocity;
        finite = finite && Number.isFinite(correctedHeight) && Number.isFinite(correctedVelocity);
        const absHeight = Math.abs(correctedHeight);
        maximumAbsHeight = Math.max(maximumAbsHeight, absHeight);
        maximumAbsVelocity = Math.max(maximumAbsVelocity, Math.abs(correctedVelocity));
        if (x === 0 || z === 0 || x === countX - 1 || z === countZ - 1) {
          maximumBoundaryAbsHeight = Math.max(maximumBoundaryAbsHeight, absHeight);
        }
      }
    }

    if (!finite) {
      this.reset("non-finite-state");
      return false;
    }

    this._heightNext = current;
    this.heightCurrent = next;
    if (this._contactAppliedThisStep) this._measureContactShape();
    else {
      this._currentContactDepression = 0;
      this._currentContactRimHeight = 0;
    }
    this._maximumAbsHeight = Math.max(this._maximumAbsHeight, maximumAbsHeight);
    this._maximumAbsVelocity = Math.max(this._maximumAbsVelocity, maximumAbsVelocity);
    this._maximumBoundaryAbsHeight = Math.max(this._maximumBoundaryAbsHeight, maximumBoundaryAbsHeight);
    this._diagnostic = "none";
    if (hadInteractions || maximumAbsHeight > ACTIVE_EPSILON || maximumAbsVelocity > ACTIVE_EPSILON) this._revision++;
    return true;
  }

  sampleWorld(worldX: number, worldZ: number, out: RectangularWaterHeightFieldSample): boolean {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
    const offsetX = worldX - this._centerX;
    const offsetZ = worldZ - this._centerZ;
    const localX = offsetX * this._lengthAxisX + offsetZ * this._lengthAxisZ;
    const localZ = offsetX * this._widthAxisX + offsetZ * this._widthAxisZ;
    return this.sampleLocal(localX, localZ, out);
  }

  sampleLocal(localX: number, localZ: number, out: RectangularWaterHeightFieldSample): boolean {
    const gridX = (localX + this.length * 0.5) / this.cellSizeX;
    const gridZ = (localZ + this.width * 0.5) / this.cellSizeZ;
    if (
      !Number.isFinite(gridX) ||
      !Number.isFinite(gridZ) ||
      gridX < 0 ||
      gridZ < 0 ||
      gridX > this.resolutionX - 1 ||
      gridZ > this.resolutionZ - 1
    ) {
      return false;
    }
    const x0 = Math.min(this.resolutionX - 2, Math.floor(gridX));
    const z0 = Math.min(this.resolutionZ - 2, Math.floor(gridZ));
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const blendX = clamp(gridX - x0, 0, 1);
    const blendZ = clamp(gridZ - z0, 0, 1);
    const bottomLeft = z0 * this.resolutionX + x0;
    const bottomRight = z0 * this.resolutionX + x1;
    const topLeft = z1 * this.resolutionX + x0;
    const topRight = z1 * this.resolutionX + x1;
    const heights = this.heightCurrent;
    const velocities = this.verticalVelocity;
    const bottomHeight = heights[bottomLeft] * (1 - blendX) + heights[bottomRight] * blendX;
    const topHeight = heights[topLeft] * (1 - blendX) + heights[topRight] * blendX;
    const bottomVelocity = velocities[bottomLeft] * (1 - blendX) + velocities[bottomRight] * blendX;
    const topVelocity = velocities[topLeft] * (1 - blendX) + velocities[topRight] * blendX;
    out.height = bottomHeight * (1 - blendZ) + topHeight * blendZ;
    out.verticalVelocity = bottomVelocity * (1 - blendZ) + topVelocity * blendZ;
    out.gradientLocalX =
      ((heights[bottomRight] - heights[bottomLeft]) * (1 - blendZ) + (heights[topRight] - heights[topLeft]) * blendZ) /
      this.cellSizeX;
    out.gradientLocalZ =
      ((heights[topLeft] - heights[bottomLeft]) * (1 - blendX) + (heights[topRight] - heights[bottomRight]) * blendX) /
      this.cellSizeZ;
    return (
      Number.isFinite(out.height) &&
      Number.isFinite(out.verticalVelocity) &&
      Number.isFinite(out.gradientLocalX) &&
      Number.isFinite(out.gradientLocalZ)
    );
  }

  readHeight(gridX: number, gridZ: number): number {
    if (gridX < 0 || gridX >= this.resolutionX || gridZ < 0 || gridZ >= this.resolutionZ) return 0;
    return this.heightCurrent[gridZ * this.resolutionX + gridX];
  }

  readGradient(gridX: number, gridZ: number, out: WaterHeightFieldCoordinate): void {
    const previousX = Math.max(0, gridX - 1);
    const nextX = Math.min(this.resolutionX - 1, gridX + 1);
    const previousZ = Math.max(0, gridZ - 1);
    const nextZ = Math.min(this.resolutionZ - 1, gridZ + 1);
    const xSpan = Math.max(1, nextX - previousX) * this.cellSizeX;
    const zSpan = Math.max(1, nextZ - previousZ) * this.cellSizeZ;
    out.x = (this.readHeight(nextX, gridZ) - this.readHeight(previousX, gridZ)) / xSpan;
    out.z = (this.readHeight(gridX, nextZ) - this.readHeight(gridX, previousZ)) / zSpan;
  }

  /** Measures the furthest active sample from a local-space origin. */
  measureActiveRadius(localOriginX: number, localOriginZ: number, threshold = 0.0005): number {
    let radius = 0;
    for (let z = 0; z < this.resolutionZ; z++) {
      const localZ = -this.width * 0.5 + z * this.cellSizeZ;
      for (let x = 0; x < this.resolutionX; x++) {
        const index = z * this.resolutionX + x;
        if (Math.max(Math.abs(this.heightCurrent[index]), Math.abs(this.verticalVelocity[index]) * 0.02) < threshold) {
          continue;
        }
        const localX = -this.length * 0.5 + x * this.cellSizeX;
        radius = Math.max(radius, Math.hypot(localX - localOriginX, localZ - localOriginZ));
      }
    }
    return radius;
  }

  reset(diagnostic: RectangularWaterHeightFieldDiagnostic = "none"): void {
    this.heightCurrent.fill(0);
    this._heightNext.fill(0);
    this.verticalVelocity.fill(0);
    this._queueCount = 0;
    this._maximumAbsHeight = 0;
    this._maximumAbsVelocity = 0;
    this._maximumBoundaryAbsHeight = 0;
    this._currentContactDepression = 0;
    this._maximumContactDepression = 0;
    this._currentContactRimHeight = 0;
    this._maximumContactRimHeight = 0;
    this._lastContactRadius = 0;
    this._contactAppliedThisStep = false;
    this._diagnostic = diagnostic;
    this._resetCount++;
    this._revision++;
  }

  private _reserveQueueSlot(priority: number): number {
    if (this._queueCount < this._queuePriority.length) return this._queueCount++;
    let weakestIndex = 0;
    let weakestMagnitude = this._queuePriority[0];
    for (let index = 1; index < this._queuePriority.length; index++) {
      const magnitude = this._queuePriority[index];
      if (magnitude < weakestMagnitude) {
        weakestMagnitude = magnitude;
        weakestIndex = index;
      }
    }
    this._droppedInteractionCount++;
    return priority > weakestMagnitude ? weakestIndex : -1;
  }

  private _applyQueuedInteractions(deltaTime: number): void {
    this._contactAppliedThisStep = false;
    for (let queueIndex = 0; queueIndex < this._queueCount; queueIndex++) {
      const centerX = this._queueLocalX[queueIndex];
      const centerZ = this._queueLocalZ[queueIndex];
      const radius = this._queueRadius[queueIndex];
      const impulse = this._queueImpulse[queueIndex];
      const targetHeight = this._queueTargetHeight[queueIndex];
      const rimRadius = radius * CONTACT_RIM_RADIUS_SCALE;
      const minimumX = Math.max(0, Math.floor((centerX - rimRadius + this.length * 0.5) / this.cellSizeX));
      const maximumX = Math.min(
        this.resolutionX - 1,
        Math.ceil((centerX + rimRadius + this.length * 0.5) / this.cellSizeX)
      );
      const minimumZ = Math.max(0, Math.floor((centerZ - rimRadius + this.width * 0.5) / this.cellSizeZ));
      const maximumZ = Math.min(
        this.resolutionZ - 1,
        Math.ceil((centerZ + rimRadius + this.width * 0.5) / this.cellSizeZ)
      );
      let innerWeightSum = 0;
      let rimWeightSum = 0;
      for (let z = minimumZ; z <= maximumZ; z++) {
        const localZ = -this.width * 0.5 + z * this.cellSizeZ;
        for (let x = minimumX; x <= maximumX; x++) {
          const localX = -this.length * 0.5 + x * this.cellSizeX;
          const distance = Math.hypot(localX - centerX, localZ - centerZ);
          if (distance >= rimRadius) continue;
          if (distance >= radius) {
            const normalizedRimDistance = (distance - radius) / (rimRadius - radius);
            rimWeightSum += Math.sin(Math.PI * normalizedRimDistance) ** 2;
            continue;
          }
          const normalizedDistance = distance / radius;
          const smoothKernel = 1 - normalizedDistance * normalizedDistance;
          innerWeightSum += smoothKernel * smoothKernel;
        }
      }
      const rimTargetScale =
        targetHeight < -ACTIVE_EPSILON && rimWeightSum > ACTIVE_EPSILON
          ? (-targetHeight * innerWeightSum) / rimWeightSum
          : 0;
      let appliedVelocitySum = 0;
      for (let z = minimumZ; z <= maximumZ; z++) {
        const localZ = -this.width * 0.5 + z * this.cellSizeZ;
        for (let x = minimumX; x <= maximumX; x++) {
          const localX = -this.length * 0.5 + x * this.cellSizeX;
          const distance = Math.hypot(localX - centerX, localZ - centerZ);
          if (distance >= rimRadius) continue;
          const index = z * this.resolutionX + x;
          if (distance >= radius) {
            if (rimTargetScale <= ACTIVE_EPSILON) continue;
            const normalizedRimDistance = (distance - radius) / (rimRadius - radius);
            const weight = Math.sin(Math.PI * normalizedRimDistance) ** 2;
            const contactAcceleration = clamp(
              (rimTargetScale * weight - this.heightCurrent[index]) * CONTACT_STIFFNESS -
                this.verticalVelocity[index] * CONTACT_DAMPING,
              -MAX_CONTACT_ACCELERATION,
              MAX_CONTACT_ACCELERATION
            );
            const velocityDelta = contactAcceleration * deltaTime * weight;
            this.verticalVelocity[index] += velocityDelta;
            appliedVelocitySum += velocityDelta;
            this._contactAppliedThisStep = true;
            continue;
          }
          const normalizedDistance = distance / radius;
          const smoothKernel = 1 - normalizedDistance * normalizedDistance;
          const weight = smoothKernel * smoothKernel;
          let velocityDelta = impulse * weight;
          if (targetHeight < -ACTIVE_EPSILON) {
            const profiledTargetHeight = targetHeight * weight;
            const contactAcceleration = clamp(
              (profiledTargetHeight - this.heightCurrent[index]) * CONTACT_STIFFNESS -
                this.verticalVelocity[index] * CONTACT_DAMPING,
              -MAX_CONTACT_ACCELERATION,
              MAX_CONTACT_ACCELERATION
            );
            velocityDelta += contactAcceleration * deltaTime * weight;
            this._contactAppliedThisStep = true;
          }
          this.verticalVelocity[index] += velocityDelta;
          appliedVelocitySum += velocityDelta;
        }
      }
      if (Math.abs(appliedVelocitySum) > ACTIVE_EPSILON && rimWeightSum > ACTIVE_EPSILON) {
        const compensationScale = -appliedVelocitySum / rimWeightSum;
        for (let z = minimumZ; z <= maximumZ; z++) {
          const localZ = -this.width * 0.5 + z * this.cellSizeZ;
          for (let x = minimumX; x <= maximumX; x++) {
            const localX = -this.length * 0.5 + x * this.cellSizeX;
            const distance = Math.hypot(localX - centerX, localZ - centerZ);
            if (distance < radius || distance >= rimRadius) continue;
            const normalizedRimDistance = (distance - radius) / (rimRadius - radius);
            const rimWeight = Math.sin(Math.PI * normalizedRimDistance) ** 2;
            this.verticalVelocity[z * this.resolutionX + x] += compensationScale * rimWeight;
          }
        }
      }
    }
    this._queueCount = 0;
  }

  private _measureContactShape(): void {
    const centerGridX = Math.round((this._lastInteractionLocalX + this.length * 0.5) / this.cellSizeX);
    const centerGridZ = Math.round((this._lastInteractionLocalZ + this.width * 0.5) / this.cellSizeZ);
    this._currentContactDepression = Math.max(0, -this.readHeight(centerGridX, centerGridZ));
    this._maximumContactDepression = Math.max(this._maximumContactDepression, this._currentContactDepression);

    const rimRadius = this._lastContactRadius * CONTACT_RIM_RADIUS_SCALE;
    let rimHeight = 0;
    const minimumX = Math.max(
      0,
      Math.floor((this._lastInteractionLocalX - rimRadius + this.length * 0.5) / this.cellSizeX)
    );
    const maximumX = Math.min(
      this.resolutionX - 1,
      Math.ceil((this._lastInteractionLocalX + rimRadius + this.length * 0.5) / this.cellSizeX)
    );
    const minimumZ = Math.max(
      0,
      Math.floor((this._lastInteractionLocalZ - rimRadius + this.width * 0.5) / this.cellSizeZ)
    );
    const maximumZ = Math.min(
      this.resolutionZ - 1,
      Math.ceil((this._lastInteractionLocalZ + rimRadius + this.width * 0.5) / this.cellSizeZ)
    );
    for (let z = minimumZ; z <= maximumZ; z++) {
      const localZ = -this.width * 0.5 + z * this.cellSizeZ;
      for (let x = minimumX; x <= maximumX; x++) {
        const localX = -this.length * 0.5 + x * this.cellSizeX;
        const distance = Math.hypot(localX - this._lastInteractionLocalX, localZ - this._lastInteractionLocalZ);
        if (distance < this._lastContactRadius || distance >= rimRadius) continue;
        rimHeight = Math.max(rimHeight, this.readHeight(x, z));
      }
    }
    this._currentContactRimHeight = rimHeight;
    this._maximumContactRimHeight = Math.max(this._maximumContactRimHeight, rimHeight);
  }
}
