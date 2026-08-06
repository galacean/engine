import { MathUtil, Vector3 } from "@galacean/engine-math";
import type { ParticleGenerator } from "../ParticleGenerator";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { BirthSubEmitterState } from "./BirthSubEmitterState";

interface EmissionRequest {
  time: number;
  count: number;
  position: Vector3 | null;
  hasPosition: boolean;
  order: number;
}

/**
 * Stores one deferred Birth emission command.
 * @internal
 */
export class BirthSubEmitterCommand {
  readonly type = ParticleSubEmitterType.Birth;
  source: ParticleGenerator;
  target: ParticleGenerator;
  state: BirthSubEmitterState;
  readonly emissionEndPosition = new Vector3();
  readonly parentWorldPosition = new Vector3();
  readonly parentWorldVelocity = new Vector3();
  readonly requests: EmissionRequest[] = [];

  inheritProperties = ParticleSubEmitterInheritProperty.None;
  requestCount = 0;
  ringIndex = 0;
  lastEmissionTime = 0;
  emissionTime = 0;
  distanceRate = 0;
  resetDistanceState = false;
  parentParticleSnapshot: Float32Array | null = null;
  bornTime = 0;
  lifetime = 0;
  frameLastPlayTime = 0;
  framePlayTime = 0;
  frameLastEngineTime = 0;
  frameEngineTime = 0;
  isQueuedForTarget = false;

  private _targetListIndex = -1;

  constructor(private readonly _pool: BirthSubEmitterCommand[]) {}

  reset(
    state: BirthSubEmitterState,
    source: ParticleGenerator,
    target: ParticleGenerator,
    inheritProperties: ParticleSubEmitterInheritProperty,
    ringIndex: number,
    lastEmissionTime: number,
    emissionTime: number,
    bornTime: number,
    lifetime: number,
    frameLastPlayTime: number,
    framePlayTime: number,
    frameLastEngineTime: number,
    frameEngineTime: number
  ): void {
    this.source = source;
    this.target = target;
    this.state = state;
    state.retain();
    const targetCommands = (target._pendingBirthSubEmitterCommands ||= []);
    this._targetListIndex = targetCommands.length;
    targetCommands.push(this);
    this.isQueuedForTarget = false;
    this.inheritProperties = inheritProperties;
    this.ringIndex = ringIndex;
    this.lastEmissionTime = lastEmissionTime;
    this.emissionTime = emissionTime;
    this.bornTime = bornTime;
    this.lifetime = lifetime;
    this.frameLastPlayTime = frameLastPlayTime;
    this.framePlayTime = framePlayTime;
    this.frameLastEngineTime = frameLastEngineTime;
    this.frameEngineTime = frameEngineTime;
  }

  addRequest(time: number, count: number, position: Vector3 | undefined, order: number): void {
    const request = (this.requests[this.requestCount] ??= {
      time,
      count,
      position: null,
      hasPosition: false,
      order
    });
    request.time = time;
    request.count = count;
    request.order = order;
    request.hasPosition = !!position;
    if (position) {
      (request.position ||= new Vector3()).copyFrom(position);
    }
    this.requestCount++;
  }

  resolveTrajectory(endPosition: Vector3, averageVelocity: Vector3): void {
    const endOffset = this._getTrajectoryTimeOffset(this.emissionTime);
    this.emissionEndPosition.set(
      endPosition.x - averageVelocity.x * endOffset,
      endPosition.y - averageVelocity.y * endOffset,
      endPosition.z - averageVelocity.z * endOffset
    );

    this.parentWorldPosition.copyFrom(endPosition);
    this.parentWorldVelocity.copyFrom(averageVelocity);
  }

  finalizeRequests(availableCapacity: number): void {
    const { emissionState } = this.state;
    const distanceRate = this.distanceRate;
    if (distanceRate > 0) {
      if (this.resetDistanceState) {
        emissionState.distanceAccumulator = 0;
        emissionState.setLastEmitPosition(this.emissionEndPosition);
      } else {
        if (!emissionState.hasLastEmitPosition) {
          // A missing baseline here can only be the first Distance command
          const startOffset = this._getTrajectoryTimeOffset(this.lastEmissionTime);
          const endPosition = this.parentWorldPosition;
          const averageVelocity = this.parentWorldVelocity;
          emissionState.lastEmitPosition.set(
            endPosition.x - averageVelocity.x * startOffset,
            endPosition.y - averageVelocity.y * startOffset,
            endPosition.z - averageVelocity.z * startOffset
          );
          emissionState.hasLastEmitPosition = true;
        }

        this.target.emission._emitByRateOverDistance(
          this.lastEmissionTime,
          this.emissionTime,
          emissionState,
          this.emissionEndPosition,
          true,
          distanceRate,
          availableCapacity,
          this
        );
      }
    }

    this._sortRequests();
  }

  cancel(): void {
    if (!this.target._renderer.destroyed) {
      this.finalizeRequests(0);
    }
    this.release();
  }

  release(): void {
    const targetCommands = this.target._pendingBirthSubEmitterCommands!;
    const lastIndex = targetCommands.length - 1;
    const replacement = targetCommands[lastIndex];
    targetCommands[this._targetListIndex] = replacement;
    targetCommands.length = lastIndex;
    if (replacement !== this) {
      replacement._targetListIndex = this._targetListIndex;
    }
    this.state.release();
    this.source = null;
    this.target = null;
    this.state = null;
    this._pool.push(this);
  }

  private _getTrajectoryTimeOffset(emissionTime: number): number {
    const sampleAge = MathUtil.clamp(this.framePlayTime - this.bornTime, 0, this.lifetime);
    const frameStartAge = MathUtil.clamp(this.frameLastPlayTime - this.bornTime, 0, this.lifetime);
    return sampleAge - frameStartAge > MathUtil.zeroTolerance
      ? sampleAge - MathUtil.clamp(emissionTime + this.state.startDelay, frameStartAge, sampleAge)
      : 0;
  }

  private _sortRequests(): void {
    const requests = this.requests;
    requests.length = this.requestCount;
    if (requests.length > 1) {
      requests.sort((left, right) => left.time - right.time || left.order - right.order);
    }
  }
}
