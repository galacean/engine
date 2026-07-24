import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import {
  WaterInteractionEventKind,
  type WaterInteractionEventInput,
  type WaterInteractionEventQueue
} from "../interaction/WaterInteractionEventQueue";
import {
  WaterFoamBlendMode,
  WaterFoamSourceKind
} from "../interaction/WaterFoamTypes";
import { createWaterWaveSampleOutput } from "../wave/GerstnerWaveEvaluator";
import {
  createOceanNearshoreFieldSample,
  OceanNearshoreSampleRegion,
  type OceanNearshoreFieldProvider
} from "./OceanNearshoreFieldProvider";
import {
  createOceanNearshoreStateSample,
  type OceanNearshoreStateField
} from "./OceanNearshoreStateField";
import {
  createOceanNearshoreWaveDerivatives,
  createOceanNearshoreWaveDirection,
  createOceanNearshoreWaveModifier,
  evaluateOceanNearshoreWaveSet
} from "./OceanNearshoreWaveEvaluator";
import type { OceanFoamSourceSystem } from "./OceanFoamSourceSystem";
import {
  createOceanObstacleBoundarySample,
  type OceanObstacleFieldResource
} from "./OceanObstacleFieldResource";

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};

export interface OceanObstacleContactSystemOptions {
  readonly fixedStepRateHz?: number;
  readonly samplesPerObstacle?: number;
  readonly foamEnergyThreshold?: number;
  readonly impactEnergyThreshold?: number;
  readonly impactCooldownSeconds?: number;
  readonly getElapsedTime: () => number;
  readonly enabled?: boolean;
}

export interface OceanObstacleContactSystemMetrics {
  readonly enabled: boolean;
  readonly obstacleCount: number;
  readonly samplesPerObstacle: number;
  readonly fixedSamplingBudget: number;
  readonly fixedStepRateHz: number;
  readonly updateCount: number;
  readonly idleSkipCount: number;
  readonly evaluatedSampleCount: number;
  readonly activeContactCount: number;
  readonly obstacleFoamSourceCount: number;
  readonly impactFoamSourceCount: number;
  readonly impactAttemptCount: number;
  readonly impactAcceptedCount: number;
  readonly impactCooldownSuppressedCount: number;
  readonly aggregatedImpactCount: number;
  readonly peakContactEnergy: number;
  readonly lastImpactWorldX: number;
  readonly lastImpactWorldY: number;
  readonly lastImpactWorldZ: number;
  readonly lastImpactNormalX: number;
  readonly lastImpactNormalZ: number;
  readonly lastImpactStrength: number;
  readonly currentSurfaceQueryCount: 0;
  readonly resourceBytes: number;
}

interface MutableOceanObstacleContactSystemMetrics {
  enabled: boolean;
  obstacleCount: number;
  samplesPerObstacle: number;
  fixedSamplingBudget: number;
  fixedStepRateHz: number;
  updateCount: number;
  idleSkipCount: number;
  evaluatedSampleCount: number;
  activeContactCount: number;
  obstacleFoamSourceCount: number;
  impactFoamSourceCount: number;
  impactAttemptCount: number;
  impactAcceptedCount: number;
  impactCooldownSuppressedCount: number;
  aggregatedImpactCount: number;
  peakContactEnergy: number;
  lastImpactWorldX: number;
  lastImpactWorldY: number;
  lastImpactWorldZ: number;
  lastImpactNormalX: number;
  lastImpactNormalZ: number;
  lastImpactStrength: number;
  currentSurfaceQueryCount: 0;
  resourceBytes: number;
}

const MAXIMUM_FIXED_STEP_RATE_HZ = 30;
const DEFAULT_FIXED_STEP_RATE_HZ = 20;
const DEFAULT_SAMPLES_PER_OBSTACLE = 4;
const MAXIMUM_SAMPLES_PER_OBSTACLE = 16;
const DEFAULT_FOAM_ENERGY_THRESHOLD = 0.08;
const DEFAULT_IMPACT_ENERGY_THRESHOLD = 0.34;
const DEFAULT_IMPACT_COOLDOWN_SECONDS = 0.75;
const MINIMUM_CONTACT_FOAM_RADIUS = 1.6;
const CONTACT_FOAM_OBSTACLE_RADIUS_SCALE = 0.82;
const CONTACT_FOAM_OUTWARD_OFFSET_SCALE = 0.42;
const UPDATE_EPSILON_SECONDS = 1e-8;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function validateNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative.`);
  }
}

/**
 * Fixed-budget wave/obstacle contact evaluator.
 *
 * It samples only the compiled nearshore field and shared WaveSet. It never
 * calls the full Surface Query provider, so dense foam remains isolated.
 */
export class OceanObstacleContactSystem {
  readonly metrics: OceanObstacleContactSystemMetrics;
  private readonly _fixedStepSeconds: number;
  private readonly _samplesPerObstacle: number;
  private readonly _foamEnergyThreshold: number;
  private readonly _impactEnergyThreshold: number;
  private readonly _impactCooldownSeconds: number;
  private readonly _getElapsedTime: () => number;
  private readonly _mutableMetrics: MutableOceanObstacleContactSystemMetrics;
  private readonly _boundarySample = createOceanObstacleBoundarySample();
  private readonly _fieldSample = createOceanNearshoreFieldSample();
  private readonly _stateSample = createOceanNearshoreStateSample();
  private readonly _waveSample = createWaterWaveSampleOutput();
  private readonly _waveModifier = createOceanNearshoreWaveModifier();
  private readonly _waveDirection = createOceanNearshoreWaveDirection();
  private readonly _waveDerivatives = createOceanNearshoreWaveDerivatives();
  private readonly _waveFacts = {
    waterDepth: Number.POSITIVE_INFINITY,
    shoreDistance: 0,
    shoreNormalX: 0,
    shoreNormalZ: 0
  };
  private readonly _event: Mutable<WaterInteractionEventInput> = {
    emitterId: 0,
    kind: WaterInteractionEventKind.Impact,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    radius: 1,
    strength: 0,
    time: 0,
    priority: 0
  };
  private _lastImpactTime?: Float64Array;
  private _pendingImpactEnergy?: Float32Array;
  private _waveSet: CompiledWaterWaveSet;
  private _waterLevel: number;
  private _timeScale: number;
  private _accumulatedDeltaSeconds = 0;
  private _lastFixedElapsedTime?: number;
  private _enabled: boolean;
  private _destroyed = false;

  constructor(
    private readonly _obstacles: OceanObstacleFieldResource,
    private readonly _nearshoreField: OceanNearshoreFieldProvider,
    private readonly _nearshoreState: OceanNearshoreStateField,
    private readonly _foamSources: OceanFoamSourceSystem,
    private readonly _eventQueue: WaterInteractionEventQueue,
    waveSet: CompiledWaterWaveSet,
    waterLevel: number,
    timeScale: number,
    options: Readonly<OceanObstacleContactSystemOptions>
  ) {
    const fixedStepRateHz =
      options.fixedStepRateHz ?? DEFAULT_FIXED_STEP_RATE_HZ;
    const samplesPerObstacle =
      options.samplesPerObstacle ?? DEFAULT_SAMPLES_PER_OBSTACLE;
    const foamEnergyThreshold =
      options.foamEnergyThreshold ?? DEFAULT_FOAM_ENERGY_THRESHOLD;
    const impactEnergyThreshold =
      options.impactEnergyThreshold ?? DEFAULT_IMPACT_ENERGY_THRESHOLD;
    const impactCooldownSeconds =
      options.impactCooldownSeconds ??
      DEFAULT_IMPACT_COOLDOWN_SECONDS;
    if (
      !Number.isFinite(fixedStepRateHz) ||
      fixedStepRateHz <= 0 ||
      fixedStepRateHz > MAXIMUM_FIXED_STEP_RATE_HZ ||
      !Number.isSafeInteger(samplesPerObstacle) ||
      samplesPerObstacle < 1 ||
      samplesPerObstacle > MAXIMUM_SAMPLES_PER_OBSTACLE
    ) {
      throw new Error("Ocean obstacle contact sampling options are invalid.");
    }
    validateNonNegative("Ocean obstacle foam energy threshold", foamEnergyThreshold);
    validateNonNegative("Ocean obstacle impact energy threshold", impactEnergyThreshold);
    validateNonNegative("Ocean obstacle impact cooldown", impactCooldownSeconds);
    this._fixedStepSeconds = 1 / fixedStepRateHz;
    this._samplesPerObstacle = samplesPerObstacle;
    this._foamEnergyThreshold = foamEnergyThreshold;
    this._impactEnergyThreshold = impactEnergyThreshold;
    this._impactCooldownSeconds = impactCooldownSeconds;
    this._getElapsedTime = options.getElapsedTime;
    this._waveSet = waveSet;
    this._waterLevel = waterLevel;
    this._timeScale = timeScale;
    this._enabled = options.enabled ?? true;
    const obstacleCount = _obstacles.count;
    this._lastImpactTime = new Float64Array(obstacleCount);
    this._lastImpactTime.fill(Number.NEGATIVE_INFINITY);
    this._pendingImpactEnergy = new Float32Array(obstacleCount);
    const resourceBytes =
      this._lastImpactTime.byteLength +
      this._pendingImpactEnergy.byteLength;
    this._mutableMetrics = {
      enabled: this._enabled,
      obstacleCount,
      samplesPerObstacle,
      fixedSamplingBudget: obstacleCount * samplesPerObstacle,
      fixedStepRateHz,
      updateCount: 0,
      idleSkipCount: 0,
      evaluatedSampleCount: 0,
      activeContactCount: 0,
      obstacleFoamSourceCount: 0,
      impactFoamSourceCount: 0,
      impactAttemptCount: 0,
      impactAcceptedCount: 0,
      impactCooldownSuppressedCount: 0,
      aggregatedImpactCount: 0,
      peakContactEnergy: 0,
      lastImpactWorldX: 0,
      lastImpactWorldY: 0,
      lastImpactWorldZ: 0,
      lastImpactNormalX: 0,
      lastImpactNormalZ: 0,
      lastImpactStrength: 0,
      currentSurfaceQueryCount: 0,
      resourceBytes
    };
    this.metrics = this._mutableMetrics;
  }

  setWaveConfig(
    waveSet: CompiledWaterWaveSet,
    waterLevel: number,
    timeScale: number
  ): void {
    this._assertAlive();
    this._waveSet = waveSet;
    this._waterLevel = waterLevel;
    this._timeScale = timeScale;
  }

  update(deltaTime: number, fixedElapsedTime?: number): boolean {
    this._assertAlive();
    if (!this._enabled) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    if (fixedElapsedTime !== undefined) {
      if (!Number.isFinite(fixedElapsedTime) || fixedElapsedTime < 0) {
        throw new Error(
          "Ocean obstacle contact fixed time must be finite and non-negative."
        );
      }
      if (fixedElapsedTime === this._lastFixedElapsedTime) {
        this._mutableMetrics.idleSkipCount++;
        return false;
      }
      if (
        this._lastFixedElapsedTime !== undefined &&
        fixedElapsedTime < this._lastFixedElapsedTime
      ) {
        this._resetCooldown();
      }
      this._lastFixedElapsedTime = fixedElapsedTime;
      this._accumulatedDeltaSeconds = 0;
      return this._evaluate(fixedElapsedTime);
    }
    this._lastFixedElapsedTime = undefined;
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    this._accumulatedDeltaSeconds += deltaTime;
    if (
      this._accumulatedDeltaSeconds + UPDATE_EPSILON_SECONDS <
      this._fixedStepSeconds
    ) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    this._accumulatedDeltaSeconds = 0;
    const elapsedTime = this._getElapsedTime();
    if (!Number.isFinite(elapsedTime) || elapsedTime < 0) {
      this._mutableMetrics.idleSkipCount++;
      return false;
    }
    return this._evaluate(elapsedTime);
  }

  setEnabled(enabled: boolean): void {
    this._assertAlive();
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    this._mutableMetrics.enabled = enabled;
    this._eventQueue.clearEvents();
    this._accumulatedDeltaSeconds = 0;
    this._lastFixedElapsedTime = undefined;
    this._resetCooldown();
    if (!enabled) this._resetLiveMetrics();
  }

  reset(): void {
    this._assertAlive();
    this._foamSources.reset();
    this.resetContactState();
  }

  /** Clears only contact/event state for the independent rock-contact case. */
  resetContactState(): void {
    this._assertAlive();
    this._eventQueue.reset();
    this._accumulatedDeltaSeconds = 0;
    this._lastFixedElapsedTime = undefined;
    this._resetCooldown();
    this._resetLiveMetrics();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._eventQueue.clearEvents();
    this._lastImpactTime = undefined;
    this._pendingImpactEnergy = undefined;
    this._mutableMetrics.enabled = false;
    this._mutableMetrics.activeContactCount = 0;
    this._mutableMetrics.resourceBytes = 0;
  }

  private _evaluate(elapsedTime: number): boolean {
    const lastImpactTime = this._requireArray(this._lastImpactTime);
    const pendingImpactEnergy = this._requireArray(
      this._pendingImpactEnergy
    );
    let activeContactCount = 0;
    let evaluatedSampleCount = 0;
    let peakContactEnergy = 0;
    let emitted = false;
    for (
      let obstacleIndex = 0;
      obstacleIndex < this._obstacles.count;
      obstacleIndex++
    ) {
      let maximumEnergy = 0;
      let maximumWorldX = 0;
      let maximumWorldY = this._waterLevel;
      let maximumWorldZ = 0;
      let maximumNormalX = 0;
      let maximumNormalZ = 0;
      let maximumVelocityX = 0;
      let maximumVelocityY = 0;
      let maximumVelocityZ = 0;
      let maximumRadius = 1;
      let hasWetSample = false;
      for (
        let sampleIndex = 0;
        sampleIndex < this._samplesPerObstacle;
        sampleIndex++
      ) {
        if (
          !this._obstacles.sampleBoundary(
            obstacleIndex,
            sampleIndex / this._samplesPerObstacle,
            this._boundarySample
          )
        ) {
          continue;
        }
        evaluatedSampleCount++;
        const region = this._nearshoreField.sample(
          this._boundarySample.worldX,
          this._boundarySample.worldZ,
          this._fieldSample
        );
        if (region !== OceanNearshoreSampleRegion.InsideWet) continue;
        hasWetSample = true;
        const facts = this._waveFacts;
        facts.waterDepth = this._fieldSample.waterDepth;
        facts.shoreDistance = this._fieldSample.shoreDistance;
        facts.shoreNormalX = this._fieldSample.shoreNormalX;
        facts.shoreNormalZ = this._fieldSample.shoreNormalZ;
        evaluateOceanNearshoreWaveSet(
          this._waveSet,
          this._boundarySample.worldX,
          this._waterLevel,
          this._boundarySample.worldZ,
          elapsedTime,
          this._timeScale,
          WaterQueryAccuracy.Fast,
          facts,
          this._waveSample,
          this._waveModifier,
          this._waveDirection,
          this._waveDerivatives
        );
        const hasState = this._nearshoreState.sample(
          this._boundarySample.worldX,
          this._boundarySample.worldZ,
          this._stateSample
        );
        const currentX = hasState
          ? this._stateSample.currentX
          : this._fieldSample.baseCurrentX;
        const currentZ = hasState
          ? this._stateSample.currentZ
          : this._fieldSample.baseCurrentZ;
        const velocityX =
          this._waveSample.horizontalVelocityX + currentX;
        const velocityY = this._waveSample.verticalVelocity;
        const velocityZ =
          this._waveSample.horizontalVelocityZ + currentZ;
        const incomingSpeed = Math.max(
          0,
          -(
            velocityX * this._boundarySample.normalX +
            velocityZ * this._boundarySample.normalZ
          )
        );
        const energy =
          incomingSpeed * 0.55 +
          Math.abs(velocityY) * 0.32 +
          this._waveModifier.breakerTendency * 0.75;
        const contactRadius = Math.max(
          MINIMUM_CONTACT_FOAM_RADIUS,
          this._boundarySample.localRadius *
            CONTACT_FOAM_OBSTACLE_RADIUS_SCALE
        );
        if (energy > this._foamEnergyThreshold) {
          const foamIntensity = clamp01(
            (energy - this._foamEnergyThreshold) /
              Math.max(1 - this._foamEnergyThreshold, 1e-6)
          );
          if (
            this._foamSources.enqueueBounded(
              WaterFoamSourceKind.Obstacle,
              this._boundarySample.worldX +
                this._boundarySample.normalX *
                  contactRadius *
                  CONTACT_FOAM_OUTWARD_OFFSET_SCALE,
              this._boundarySample.worldZ +
                this._boundarySample.normalZ *
                  contactRadius *
                  CONTACT_FOAM_OUTWARD_OFFSET_SCALE,
              contactRadius,
              foamIntensity,
              1.4,
              2,
              WaterFoamBlendMode.Maximum
            )
          ) {
            this._mutableMetrics.obstacleFoamSourceCount++;
            emitted = true;
          }
        }
        if (energy <= maximumEnergy) continue;
        maximumEnergy = energy;
        maximumWorldX = this._boundarySample.worldX;
        maximumWorldY = this._waveSample.displacedY;
        maximumWorldZ = this._boundarySample.worldZ;
        maximumNormalX = this._boundarySample.normalX;
        maximumNormalZ = this._boundarySample.normalZ;
        maximumVelocityX = velocityX;
        maximumVelocityY = velocityY;
        maximumVelocityZ = velocityZ;
        maximumRadius = contactRadius;
      }
      peakContactEnergy = Math.max(peakContactEnergy, maximumEnergy);
      if (!hasWetSample || maximumEnergy <= this._foamEnergyThreshold) {
        continue;
      }
      activeContactCount++;
      if (maximumEnergy < this._impactEnergyThreshold) continue;
      if (
        elapsedTime - lastImpactTime[obstacleIndex] +
          UPDATE_EPSILON_SECONDS <
        this._impactCooldownSeconds
      ) {
        pendingImpactEnergy[obstacleIndex] = Math.max(
          pendingImpactEnergy[obstacleIndex],
          maximumEnergy
        );
        this._mutableMetrics.impactCooldownSuppressedCount++;
        this._mutableMetrics.aggregatedImpactCount++;
        continue;
      }
      const impactEnergy = Math.max(
        maximumEnergy,
        pendingImpactEnergy[obstacleIndex]
      );
      pendingImpactEnergy[obstacleIndex] = 0;
      lastImpactTime[obstacleIndex] = elapsedTime;
      const strength = clamp01(
        impactEnergy / Math.max(this._impactEnergyThreshold * 2, 1e-6)
      );
      const event = this._event;
      event.emitterId = 0x10000 + obstacleIndex;
      event.worldX = maximumWorldX;
      event.worldY = maximumWorldY;
      event.worldZ = maximumWorldZ;
      event.velocityX = maximumVelocityX;
      event.velocityY = maximumVelocityY;
      event.velocityZ = maximumVelocityZ;
      event.radius = maximumRadius;
      event.strength = strength;
      event.time = elapsedTime;
      event.priority = 3 + strength * 2;
      this._mutableMetrics.impactAttemptCount++;
      if (this._eventQueue.enqueue(event)) {
        this._mutableMetrics.impactAcceptedCount++;
        emitted = true;
      }
      if (
        this._foamSources.enqueueBounded(
          WaterFoamSourceKind.Impact,
          maximumWorldX +
            maximumNormalX *
              maximumRadius *
              CONTACT_FOAM_OUTWARD_OFFSET_SCALE,
          maximumWorldZ +
            maximumNormalZ *
              maximumRadius *
              CONTACT_FOAM_OUTWARD_OFFSET_SCALE,
          maximumRadius * 1.35,
          strength,
          2.4,
          event.priority,
          WaterFoamBlendMode.Add
        )
      ) {
        this._mutableMetrics.impactFoamSourceCount++;
        emitted = true;
      }
      this._mutableMetrics.lastImpactWorldX = maximumWorldX;
      this._mutableMetrics.lastImpactWorldY = maximumWorldY;
      this._mutableMetrics.lastImpactWorldZ = maximumWorldZ;
      this._mutableMetrics.lastImpactNormalX = maximumNormalX;
      this._mutableMetrics.lastImpactNormalZ = maximumNormalZ;
      this._mutableMetrics.lastImpactStrength = strength;
    }
    this._mutableMetrics.updateCount++;
    this._mutableMetrics.evaluatedSampleCount += evaluatedSampleCount;
    this._mutableMetrics.activeContactCount = activeContactCount;
    this._mutableMetrics.peakContactEnergy = peakContactEnergy;
    return emitted;
  }

  private _resetCooldown(): void {
    this._requireArray(this._lastImpactTime).fill(
      Number.NEGATIVE_INFINITY
    );
    this._requireArray(this._pendingImpactEnergy).fill(0);
  }

  private _resetLiveMetrics(): void {
    this._mutableMetrics.activeContactCount = 0;
    this._mutableMetrics.peakContactEnergy = 0;
    this._mutableMetrics.lastImpactWorldX = 0;
    this._mutableMetrics.lastImpactWorldY = 0;
    this._mutableMetrics.lastImpactWorldZ = 0;
    this._mutableMetrics.lastImpactNormalX = 0;
    this._mutableMetrics.lastImpactNormalZ = 0;
    this._mutableMetrics.lastImpactStrength = 0;
  }

  private _requireArray<T extends Float32Array | Float64Array>(
    value: T | undefined
  ): T {
    if (!value) {
      throw new Error("Ocean obstacle contact system has been destroyed.");
    }
    return value;
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("Ocean obstacle contact system has been destroyed.");
    }
  }
}
