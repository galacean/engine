import {
  createGridWaterCurrentFieldSnapshot,
  type GridWaterCurrentFieldSnapshot
} from "../interaction/WaterCurrentFieldSnapshot";
import type { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";
import {
  createOceanNearshoreWaveModifier,
  resolveOceanNearshoreWaveModifier
} from "./OceanNearshoreWaveEvaluator";

export interface OceanNearshoreStateFieldOptions {
  readonly fixedStepRateHz?: number;
  readonly swashPeriodSeconds?: number;
  readonly minimumRunupDistance?: number;
  readonly maximumRunupDistance?: number;
  readonly filmDepth?: number;
  readonly occupancyAcquireMargin?: number;
  readonly occupancyReleaseMargin?: number;
  readonly breakerAttackRate?: number;
  readonly breakerDecayRate?: number;
  readonly wetnessDryingRate?: number;
  readonly maximumSwashSpeed?: number;
  /**
   * World-space half-width used to soften the packed render occupancy around
   * the authoritative binary thin-film boundary. The complete transition band
   * is twice this value. Defaults to zero.
   */
  readonly thinFilmTransitionWidth?: number;
  readonly maximumSeekSeconds?: number;
  readonly enabled?: boolean;
}

export interface OceanNearshoreStateFieldMetrics {
  readonly enabled: boolean;
  readonly revision: number;
  readonly fixedStepRateHz: number;
  readonly fixedStepCount: number;
  readonly updateCount: number;
  readonly idleSkipCount: number;
  readonly resetCount: number;
  readonly simulationTime: number;
  readonly swashPhase: number;
  readonly activeThinFilmTexelCount: number;
  readonly activeBreakerTexelCount: number;
  readonly activeWetnessTexelCount: number;
  readonly breakerPeak: number;
  readonly wetnessPeak: number;
  readonly maximumBackwashSpeed: number;
  readonly stateByteLength: number;
  readonly currentSnapshotRevision: number;
}

interface MutableOceanNearshoreStateFieldMetrics {
  enabled: boolean;
  revision: number;
  fixedStepRateHz: number;
  fixedStepCount: number;
  updateCount: number;
  idleSkipCount: number;
  resetCount: number;
  simulationTime: number;
  swashPhase: number;
  activeThinFilmTexelCount: number;
  activeBreakerTexelCount: number;
  activeWetnessTexelCount: number;
  breakerPeak: number;
  wetnessPeak: number;
  maximumBackwashSpeed: number;
  stateByteLength: number;
  currentSnapshotRevision: number;
}

interface OceanNearshoreStateBuffers {
  readonly breaker: Float32Array;
  readonly occupancy: Uint8Array;
  readonly surfaceHeights: Float32Array;
  readonly swashVelocity: Float32Array;
  readonly currentsXZ: Float32Array;
  readonly wetness: Float32Array;
  readonly stateUpload: Uint8Array;
  readonly wetnessUpload: Uint8Array;
}

export interface OceanNearshoreStateSample {
  insideField: boolean;
  occupied: boolean;
  breaker: number;
  surfaceHeight: number;
  swashVelocity: number;
  currentX: number;
  currentZ: number;
  wetness: number;
}

export interface ResolvedOceanNearshoreStateFieldOptions {
  readonly fixedStepRateHz: number;
  readonly fixedStepSeconds: number;
  readonly swashPeriodSeconds: number;
  readonly minimumRunupDistance: number;
  readonly maximumRunupDistance: number;
  readonly filmDepth: number;
  readonly occupancyAcquireMargin: number;
  readonly occupancyReleaseMargin: number;
  readonly breakerAttackRate: number;
  readonly breakerDecayRate: number;
  readonly wetnessDryingRate: number;
  readonly maximumSwashSpeed: number;
  readonly thinFilmTransitionWidth: number;
  readonly maximumSeekSeconds: number;
}

const TWO_PI = Math.PI * 2;
const UPDATE_EPSILON_SECONDS = 1e-8;
const MINIMUM_VISIBLE_VALUE = 1 / 255;
const MAXIMUM_FIXED_STEP_RATE_HZ = 30;
const DEFAULT_OPTIONS: Readonly<ResolvedOceanNearshoreStateFieldOptions> =
  Object.freeze({
    fixedStepRateHz: 30,
    fixedStepSeconds: 1 / 30,
    swashPeriodSeconds: 6.4,
    minimumRunupDistance: 0.2,
    maximumRunupDistance: 4.2,
    filmDepth: 0.055,
    occupancyAcquireMargin: 0.08,
    occupancyReleaseMargin: 0.14,
    breakerAttackRate: 8,
    breakerDecayRate: 2.4,
    wetnessDryingRate: 0.32,
    maximumSwashSpeed: 1.35,
    thinFilmTransitionWidth: 0,
    maximumSeekSeconds: 120
  });

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const t = clamp01((value - minimum) / Math.max(maximum - minimum, 1e-8));
  return t * t * (3 - 2 * t);
}

function interpolate(
  value00: number,
  value10: number,
  value01: number,
  value11: number,
  fractionX: number,
  fractionZ: number
): number {
  const negativeZ = value00 + (value10 - value00) * fractionX;
  const positiveZ = value01 + (value11 - value01) * fractionX;
  return negativeZ + (positiveZ - negativeZ) * fractionZ;
}

function resolveOptions(
  options: Readonly<OceanNearshoreStateFieldOptions>
): Readonly<ResolvedOceanNearshoreStateFieldOptions> {
  const fixedStepRateHz =
    options.fixedStepRateHz ?? DEFAULT_OPTIONS.fixedStepRateHz;
  const swashPeriodSeconds =
    options.swashPeriodSeconds ?? DEFAULT_OPTIONS.swashPeriodSeconds;
  const minimumRunupDistance =
    options.minimumRunupDistance ?? DEFAULT_OPTIONS.minimumRunupDistance;
  const maximumRunupDistance =
    options.maximumRunupDistance ?? DEFAULT_OPTIONS.maximumRunupDistance;
  const filmDepth = options.filmDepth ?? DEFAULT_OPTIONS.filmDepth;
  const occupancyAcquireMargin =
    options.occupancyAcquireMargin ??
    DEFAULT_OPTIONS.occupancyAcquireMargin;
  const occupancyReleaseMargin =
    options.occupancyReleaseMargin ??
    DEFAULT_OPTIONS.occupancyReleaseMargin;
  const breakerAttackRate =
    options.breakerAttackRate ?? DEFAULT_OPTIONS.breakerAttackRate;
  const breakerDecayRate =
    options.breakerDecayRate ?? DEFAULT_OPTIONS.breakerDecayRate;
  const wetnessDryingRate =
    options.wetnessDryingRate ?? DEFAULT_OPTIONS.wetnessDryingRate;
  const maximumSwashSpeed =
    options.maximumSwashSpeed ?? DEFAULT_OPTIONS.maximumSwashSpeed;
  const thinFilmTransitionWidth =
    options.thinFilmTransitionWidth ??
    DEFAULT_OPTIONS.thinFilmTransitionWidth;
  const maximumSeekSeconds =
    options.maximumSeekSeconds ?? DEFAULT_OPTIONS.maximumSeekSeconds;
  if (
    !Number.isFinite(fixedStepRateHz) ||
    fixedStepRateHz <= 0 ||
    fixedStepRateHz > MAXIMUM_FIXED_STEP_RATE_HZ ||
    !Number.isFinite(swashPeriodSeconds) ||
    swashPeriodSeconds <= 0 ||
    !Number.isFinite(minimumRunupDistance) ||
    minimumRunupDistance < 0 ||
    !Number.isFinite(maximumRunupDistance) ||
    maximumRunupDistance < minimumRunupDistance ||
    !Number.isFinite(filmDepth) ||
    filmDepth <= 0 ||
    !Number.isFinite(occupancyAcquireMargin) ||
    occupancyAcquireMargin < 0 ||
    !Number.isFinite(occupancyReleaseMargin) ||
    occupancyReleaseMargin < occupancyAcquireMargin ||
    !Number.isFinite(breakerAttackRate) ||
    breakerAttackRate <= 0 ||
    !Number.isFinite(breakerDecayRate) ||
    breakerDecayRate <= 0 ||
    !Number.isFinite(wetnessDryingRate) ||
    wetnessDryingRate <= 0 ||
    !Number.isFinite(maximumSwashSpeed) ||
    maximumSwashSpeed <= 0 ||
    !Number.isFinite(thinFilmTransitionWidth) ||
    thinFilmTransitionWidth < 0 ||
    !Number.isFinite(maximumSeekSeconds) ||
    maximumSeekSeconds <= 0
  ) {
    throw new Error("Ocean nearshore state field options are invalid.");
  }
  return Object.freeze({
    fixedStepRateHz,
    fixedStepSeconds: 1 / fixedStepRateHz,
    swashPeriodSeconds,
    minimumRunupDistance,
    maximumRunupDistance,
    filmDepth,
    occupancyAcquireMargin,
    occupancyReleaseMargin,
    breakerAttackRate,
    breakerDecayRate,
    wetnessDryingRate,
    maximumSwashSpeed,
    thinFilmTransitionWidth,
    maximumSeekSeconds
  });
}

export function createOceanNearshoreStateSample(): OceanNearshoreStateSample {
  return {
    insideField: false,
    occupied: false,
    breaker: 0,
    surfaceHeight: 0,
    swashVelocity: 0,
    currentX: 0,
    currentZ: 0,
    wetness: 0
  };
}

function resetSample(sample: OceanNearshoreStateSample): void {
  sample.insideField = false;
  sample.occupied = false;
  sample.breaker = 0;
  sample.surfaceHeight = 0;
  sample.swashVelocity = 0;
  sample.currentX = 0;
  sample.currentZ = 0;
  sample.wetness = 0;
}

/** Fixed-step, bounded dynamic facts for one compiled nearshore field. */
export class OceanNearshoreStateField {
  readonly metrics: OceanNearshoreStateFieldMetrics;
  readonly surfaceHeightDecode: readonly [number, number];
  private readonly _options: Readonly<ResolvedOceanNearshoreStateFieldOptions>;
  private readonly _mutableMetrics: MutableOceanNearshoreStateFieldMetrics;
  private readonly _waveModifier = createOceanNearshoreWaveModifier();
  private _buffers?: OceanNearshoreStateBuffers;
  private _currentSnapshot?: GridWaterCurrentFieldSnapshot;
  private _accumulatedDeltaSeconds = 0;
  private _simulationTime = 0;
  private _enabled: boolean;
  private _destroyed = false;

  constructor(
    readonly resource: OceanNearshoreFieldResource,
    options: Readonly<OceanNearshoreStateFieldOptions> = {}
  ) {
    this._options = resolveOptions(options);
    this._enabled = options.enabled ?? true;
    resource.retain();
    const texelCount = resource.metadata.width * resource.metadata.height;
    this._buffers = {
      breaker: new Float32Array(texelCount),
      occupancy: new Uint8Array(texelCount),
      surfaceHeights: new Float32Array(texelCount),
      swashVelocity: new Float32Array(texelCount),
      currentsXZ: new Float32Array(texelCount * 2),
      wetness: new Float32Array(texelCount),
      stateUpload: new Uint8Array(texelCount * 4),
      wetnessUpload: new Uint8Array(texelCount)
    };
    let maximumSwashBedHeight = resource.data.waterLevel;
    for (let index = 0; index < texelCount; index++) {
      if (
        resource.shoreDistanceAt(index) >=
        -this._options.maximumRunupDistance -
          this._options.occupancyReleaseMargin -
          this._options.thinFilmTransitionWidth
      ) {
        maximumSwashBedHeight = Math.max(
          maximumSwashBedHeight,
          resource.bedHeightAt(index)
        );
      }
    }
    this.surfaceHeightDecode = Object.freeze([
      resource.data.waterLevel - 0.25,
      maximumSwashBedHeight + this._options.filmDepth * 1.5
    ] as const);
    const stateByteLength =
      this._buffers.breaker.byteLength +
      this._buffers.occupancy.byteLength +
      this._buffers.surfaceHeights.byteLength +
      this._buffers.swashVelocity.byteLength +
      this._buffers.currentsXZ.byteLength +
      this._buffers.wetness.byteLength +
      this._buffers.stateUpload.byteLength +
      this._buffers.wetnessUpload.byteLength;
    this._mutableMetrics = {
      enabled: this._enabled,
      revision: 0,
      fixedStepRateHz: this._options.fixedStepRateHz,
      fixedStepCount: 0,
      updateCount: 0,
      idleSkipCount: 0,
      resetCount: 0,
      simulationTime: 0,
      swashPhase: 0,
      activeThinFilmTexelCount: 0,
      activeBreakerTexelCount: 0,
      activeWetnessTexelCount: 0,
      breakerPeak: 0,
      wetnessPeak: 0,
      maximumBackwashSpeed: 0,
      stateByteLength,
      currentSnapshotRevision: 0
    };
    this.metrics = this._mutableMetrics;
    this._resetBuffers();
    this._publish();
  }

  get stateUploadBuffer(): Uint8Array {
    return this._requireBuffers().stateUpload;
  }

  /** Resolved immutable authoring values used by this fixed-step field. */
  get configuration(): Readonly<ResolvedOceanNearshoreStateFieldOptions> {
    return this._options;
  }

  get wetnessUploadBuffer(): Uint8Array {
    return this._requireBuffers().wetnessUpload;
  }

  get currentSnapshot(): GridWaterCurrentFieldSnapshot {
    if (!this._currentSnapshot) {
      throw new Error("Ocean nearshore state field has been destroyed.");
    }
    return this._currentSnapshot;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  get maximumSwashSpeed(): number {
    return this._options.maximumSwashSpeed;
  }

  setEnabled(enabled: boolean, clearDynamicState = true): void {
    this._assertAlive();
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    this._mutableMetrics.enabled = enabled;
    if (clearDynamicState) {
      this._resetBuffers();
      this._mutableMetrics.revision++;
      this._publish();
    }
  }

  update(deltaTime: number): boolean {
    this._assertAlive();
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    if (
      !this._enabled &&
      this._mutableMetrics.activeThinFilmTexelCount === 0 &&
      this._mutableMetrics.activeBreakerTexelCount === 0 &&
      this._mutableMetrics.activeWetnessTexelCount === 0
    ) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    this._accumulatedDeltaSeconds += deltaTime;
    let stepped = false;
    while (
      this._accumulatedDeltaSeconds + UPDATE_EPSILON_SECONDS >=
      this._options.fixedStepSeconds
    ) {
      this._step();
      this._accumulatedDeltaSeconds -= this._options.fixedStepSeconds;
      stepped = true;
    }
    if (!stepped) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    this._mutableMetrics.updateCount++;
    this._publish();
    return true;
  }

  /** Deterministic fixed-time seek used by capture and replay routes. */
  seek(elapsedTime: number): boolean {
    this._assertAlive();
    if (
      !Number.isFinite(elapsedTime) ||
      elapsedTime < 0 ||
      elapsedTime > this._options.maximumSeekSeconds
    ) {
      throw new RangeError(
        `Ocean nearshore seek time must be within [0, ${this._options.maximumSeekSeconds}].`
      );
    }
    if (elapsedTime + UPDATE_EPSILON_SECONDS < this._simulationTime) {
      this.reset();
    }
    let stepped = false;
    while (
      this._simulationTime +
        this._options.fixedStepSeconds +
        UPDATE_EPSILON_SECONDS <=
      elapsedTime
    ) {
      this._step();
      stepped = true;
    }
    this._accumulatedDeltaSeconds = Math.max(
      0,
      elapsedTime - this._simulationTime
    );
    if (stepped) {
      this._mutableMetrics.updateCount++;
      this._publish();
    } else {
      this._mutableMetrics.idleSkipCount++;
    }
    return stepped;
  }

  reset(): void {
    this._assertAlive();
    this._simulationTime = 0;
    this._accumulatedDeltaSeconds = 0;
    this._resetBuffers();
    this._mutableMetrics.resetCount++;
    this._mutableMetrics.revision++;
    this._mutableMetrics.simulationTime = 0;
    this._mutableMetrics.swashPhase = 0;
    this._publish();
  }

  sample(
    worldX: number,
    worldZ: number,
    outSample: OceanNearshoreStateSample
  ): boolean {
    resetSample(outSample);
    const buffers = this._requireBuffers();
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
    const { grid } = this.resource.data;
    const gridX = (worldX - grid.originXZ[0]) / grid.cellSizeXZ[0];
    const gridZ = (worldZ - grid.originXZ[1]) / grid.cellSizeXZ[1];
    if (
      gridX < -0.5 ||
      gridX > grid.width - 0.5 ||
      gridZ < -0.5 ||
      gridZ > grid.height - 0.5
    ) {
      return false;
    }
    const sampleX = Math.min(grid.width - 1, Math.max(0, gridX));
    const sampleZ = Math.min(grid.height - 1, Math.max(0, gridZ));
    const x0 = Math.floor(sampleX);
    const z0 = Math.floor(sampleZ);
    const x1 = Math.min(grid.width - 1, x0 + 1);
    const z1 = Math.min(grid.height - 1, z0 + 1);
    const fractionX = sampleX - x0;
    const fractionZ = sampleZ - z0;
    const index00 = z0 * grid.width + x0;
    const index10 = z0 * grid.width + x1;
    const index01 = z1 * grid.width + x0;
    const index11 = z1 * grid.width + x1;
    outSample.insideField = true;
    const occupancy = interpolate(
      buffers.occupancy[index00],
      buffers.occupancy[index10],
      buffers.occupancy[index01],
      buffers.occupancy[index11],
      fractionX,
      fractionZ
    );
    outSample.occupied = occupancy >= 0.5;
    outSample.breaker = interpolate(
      buffers.breaker[index00],
      buffers.breaker[index10],
      buffers.breaker[index01],
      buffers.breaker[index11],
      fractionX,
      fractionZ
    );
    outSample.surfaceHeight = interpolate(
      buffers.surfaceHeights[index00],
      buffers.surfaceHeights[index10],
      buffers.surfaceHeights[index01],
      buffers.surfaceHeights[index11],
      fractionX,
      fractionZ
    );
    outSample.swashVelocity = interpolate(
      buffers.swashVelocity[index00],
      buffers.swashVelocity[index10],
      buffers.swashVelocity[index01],
      buffers.swashVelocity[index11],
      fractionX,
      fractionZ
    );
    outSample.currentX = interpolate(
      buffers.currentsXZ[index00 * 2],
      buffers.currentsXZ[index10 * 2],
      buffers.currentsXZ[index01 * 2],
      buffers.currentsXZ[index11 * 2],
      fractionX,
      fractionZ
    );
    outSample.currentZ = interpolate(
      buffers.currentsXZ[index00 * 2 + 1],
      buffers.currentsXZ[index10 * 2 + 1],
      buffers.currentsXZ[index01 * 2 + 1],
      buffers.currentsXZ[index11 * 2 + 1],
      fractionX,
      fractionZ
    );
    outSample.wetness = interpolate(
      buffers.wetness[index00],
      buffers.wetness[index10],
      buffers.wetness[index01],
      buffers.wetness[index11],
      fractionX,
      fractionZ
    );
    return true;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._buffers = undefined;
    this._currentSnapshot = undefined;
    this._mutableMetrics.enabled = false;
    this._mutableMetrics.stateByteLength = 0;
    this._mutableMetrics.activeThinFilmTexelCount = 0;
    this._mutableMetrics.activeBreakerTexelCount = 0;
    this._mutableMetrics.activeWetnessTexelCount = 0;
    this._mutableMetrics.breakerPeak = 0;
    this._mutableMetrics.wetnessPeak = 0;
    this._mutableMetrics.maximumBackwashSpeed = 0;
    this.resource.release();
  }

  private _step(): void {
    const buffers = this._requireBuffers();
    const dt = this._options.fixedStepSeconds;
    this._simulationTime += dt;
    const phase =
      (this._simulationTime % this._options.swashPeriodSeconds) /
      this._options.swashPeriodSeconds;
    const phaseRadians = phase * TWO_PI - Math.PI * 0.5;
    const normalizedRunup = 0.5 + 0.5 * Math.sin(phaseRadians);
    const smoothedRunup = smoothstep(0, 1, normalizedRunup);
    const runupDistance =
      this._options.minimumRunupDistance +
      (this._options.maximumRunupDistance -
        this._options.minimumRunupDistance) *
        smoothedRunup;
    const rawSwashSpeed =
      Math.cos(phaseRadians) *
      ((this._options.maximumRunupDistance -
        this._options.minimumRunupDistance) *
        Math.PI) /
      this._options.swashPeriodSeconds;
    const swashSpeed = Math.min(
      this._options.maximumSwashSpeed,
      Math.max(-this._options.maximumSwashSpeed, rawSwashSpeed)
    );
    const breakerAttackBlend = 1 - Math.exp(-this._options.breakerAttackRate * dt);
    const breakerDecayBlend = 1 - Math.exp(-this._options.breakerDecayRate * dt);
    const wetnessDecay = Math.exp(-this._options.wetnessDryingRate * dt);
    const texelCount = this.resource.metadata.width * this.resource.metadata.height;
    for (let index = 0; index < texelCount; index++) {
      const staticWet = this.resource.wetMaskAt(index) === 1;
      const shoreDistance = this.resource.shoreDistanceAt(index);
      const bedHeight = this.resource.bedHeightAt(index);
      const shoreNormalX = this.resource.shoreNormalXAt(index);
      const shoreNormalZ = this.resource.shoreNormalZAt(index);
      let occupied = staticWet;
      let occupancyThreshold = -runupDistance;
      if (!staticWet && this._enabled) {
        const wasOccupied = buffers.occupancy[index] === 1;
        occupancyThreshold += wasOccupied
          ? -this._options.occupancyReleaseMargin
          : this._options.occupancyAcquireMargin;
        occupied = shoreDistance >= occupancyThreshold;
      }
      buffers.occupancy[index] = occupied ? 1 : 0;
      const renderOccupancy =
        staticWet
          ? 1
          : !this._enabled
            ? 0
            : this._options.thinFilmTransitionWidth > 0
              ? smoothstep(
                  occupancyThreshold - this._options.thinFilmTransitionWidth,
                  occupancyThreshold + this._options.thinFilmTransitionWidth,
                  shoreDistance
                )
              : occupied
                ? 1
                : 0;
      buffers.stateUpload[index * 4 + 1] =
        Math.round(renderOccupancy * 255);
      buffers.surfaceHeights[index] =
        !staticWet && renderOccupancy > 0
          ? bedHeight +
            this._options.filmDepth * (0.8 + smoothedRunup * 0.2)
          : this.resource.data.waterLevel;

      const waterDepth = this.resource.waterDepthAt(index);
      resolveOceanNearshoreWaveModifier(
        {
          waterDepth,
          shoreDistance,
          shoreNormalX,
          shoreNormalZ
        },
        this._waveModifier
      );
      const breakerPulse =
        0.68 +
        0.32 *
          Math.sin(
            phase * TWO_PI * 1.5 - shoreDistance * 0.31
          );
      const breakerTarget = this._enabled
        ? this._waveModifier.breakerTendency *
          Math.max(0, breakerPulse)
        : 0;
      const previousBreaker = buffers.breaker[index];
      const breakerBlend =
        breakerTarget > previousBreaker
          ? breakerAttackBlend
          : breakerDecayBlend;
      const breaker =
        previousBreaker +
        (breakerTarget - previousBreaker) * breakerBlend;
      buffers.breaker[index] =
        breaker < MINIMUM_VISIBLE_VALUE ? 0 : clamp01(breaker);

      const shoreBand =
        smoothstep(
          -this._options.maximumRunupDistance,
          2,
          shoreDistance
        ) *
        (1 - smoothstep(24, 42, shoreDistance));
      const localSwashVelocity = this._enabled
        ? swashSpeed * shoreBand
        : 0;
      buffers.swashVelocity[index] = localSwashVelocity;
      buffers.currentsXZ[index * 2] =
        this.resource.baseCurrentXAt(index) +
        shoreNormalX * localSwashVelocity;
      buffers.currentsXZ[index * 2 + 1] =
        this.resource.baseCurrentZAt(index) +
        shoreNormalZ * localSwashVelocity;

      let wetness = buffers.wetness[index];
      if (!staticWet && occupied && this._enabled) {
        wetness = 1;
      } else if (!staticWet) {
        wetness *= wetnessDecay;
        if (wetness < MINIMUM_VISIBLE_VALUE) wetness = 0;
      } else {
        wetness = 0;
      }
      buffers.wetness[index] = wetness;
    }
    this._mutableMetrics.fixedStepCount++;
    this._mutableMetrics.revision++;
    this._mutableMetrics.simulationTime = this._simulationTime;
    this._mutableMetrics.swashPhase = phase;
  }

  private _resetBuffers(): void {
    const buffers = this._requireBuffers();
    buffers.breaker.fill(0);
    buffers.swashVelocity.fill(0);
    buffers.wetness.fill(0);
    const texelCount = this.resource.metadata.width * this.resource.metadata.height;
    for (let index = 0; index < texelCount; index++) {
      const wet = this.resource.wetMaskAt(index) === 1;
      buffers.occupancy[index] = wet ? 1 : 0;
      buffers.stateUpload[index * 4 + 1] = wet ? 255 : 0;
      buffers.surfaceHeights[index] = this.resource.data.waterLevel;
      buffers.currentsXZ[index * 2] = this.resource.baseCurrentXAt(index);
      buffers.currentsXZ[index * 2 + 1] =
        this.resource.baseCurrentZAt(index);
    }
  }

  private _publish(): void {
    const buffers = this._requireBuffers();
    const minimumSurfaceHeight = this.surfaceHeightDecode[0];
    const surfaceHeightRange = Math.max(
      1e-8,
      this.surfaceHeightDecode[1] - minimumSurfaceHeight
    );
    let thinFilmCount = 0;
    let breakerCount = 0;
    let wetnessCount = 0;
    let breakerPeak = 0;
    let wetnessPeak = 0;
    let maximumBackwashSpeed = 0;
    const texelCount = this.resource.metadata.width * this.resource.metadata.height;
    for (let index = 0; index < texelCount; index++) {
      const stateOffset = index * 4;
      const breaker = clamp01(buffers.breaker[index]);
      const occupied = buffers.occupancy[index] === 1;
      const staticWet = this.resource.wetMaskAt(index) === 1;
      const surfaceHeightNormalized = clamp01(
        (buffers.surfaceHeights[index] - minimumSurfaceHeight) /
          surfaceHeightRange
      );
      const swashVelocityNormalized = clamp01(
        buffers.swashVelocity[index] /
          (this._options.maximumSwashSpeed * 2) +
          0.5
      );
      const wetness = clamp01(buffers.wetness[index]);
      buffers.stateUpload[stateOffset] = Math.round(breaker * 255);
      buffers.stateUpload[stateOffset + 2] = Math.round(
        surfaceHeightNormalized * 255
      );
      buffers.stateUpload[stateOffset + 3] = Math.round(
        swashVelocityNormalized * 255
      );
      buffers.wetnessUpload[index] = Math.round(wetness * 255);
      if (occupied && !staticWet) thinFilmCount++;
      if (breaker >= MINIMUM_VISIBLE_VALUE) breakerCount++;
      if (wetness >= MINIMUM_VISIBLE_VALUE) wetnessCount++;
      breakerPeak = Math.max(breakerPeak, breaker);
      wetnessPeak = Math.max(wetnessPeak, wetness);
      maximumBackwashSpeed = Math.max(
        maximumBackwashSpeed,
        Math.max(0, -buffers.swashVelocity[index])
      );
    }
    this._mutableMetrics.activeThinFilmTexelCount = thinFilmCount;
    this._mutableMetrics.activeBreakerTexelCount = breakerCount;
    this._mutableMetrics.activeWetnessTexelCount = wetnessCount;
    this._mutableMetrics.breakerPeak = breakerPeak;
    this._mutableMetrics.wetnessPeak = wetnessPeak;
    this._mutableMetrics.maximumBackwashSpeed = maximumBackwashSpeed;
    const { grid } = this.resource.data;
    const centerX =
      grid.originXZ[0] + ((grid.width - 1) * grid.cellSizeXZ[0]) / 2;
    const centerZ =
      grid.originXZ[1] + ((grid.height - 1) * grid.cellSizeXZ[1]) / 2;
    this._currentSnapshot = createGridWaterCurrentFieldSnapshot({
      revision: this._mutableMetrics.revision,
      centerX,
      centerZ,
      length: grid.width * grid.cellSizeXZ[0],
      width: grid.height * grid.cellSizeXZ[1],
      resolutionX: grid.width,
      resolutionZ: grid.height,
      currentVectorsXZ: buffers.currentsXZ
    });
    this._mutableMetrics.currentSnapshotRevision =
      this._currentSnapshot.revision;
  }

  private _requireBuffers(): OceanNearshoreStateBuffers {
    if (!this._buffers) {
      throw new Error("Ocean nearshore state field has been destroyed.");
    }
    return this._buffers;
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("Ocean nearshore state field has been destroyed.");
    }
  }
}
