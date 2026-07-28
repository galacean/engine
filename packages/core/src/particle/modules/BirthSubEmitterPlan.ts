import { MathUtil, Vector3 } from "@galacean/engine-math";
import type { ParticleGenerator } from "../ParticleGenerator";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { BirthSubEmitterState } from "./BirthSubEmitterState";
import type { SubEmitter } from "./SubEmitter";

interface EmissionRequest {
  time: number;
  count: number;
  position: Vector3 | null;
  hasPosition: boolean;
  order: number;
}

/**
 * Stores one deferred Birth emission batch.
 * @internal
 */
export class BirthSubEmitterPlan {
  readonly type = ParticleSubEmitterType.Birth;
  subEmitter: SubEmitter;
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

  constructor(private readonly _pool: BirthSubEmitterPlan[]) {}

  reset(
    state: BirthSubEmitterState,
    subEmitter: SubEmitter,
    target: ParticleGenerator,
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
    this.subEmitter = subEmitter;
    this.target = target;
    this.state = state;
    state.retain();
    this.inheritProperties = subEmitter.inheritProperties;
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

  /**
   * Resolves the parent trajectory from GPU feedback.
   * @param endPosition - The parent world position at the end of the feedback interval
   * @param averageVelocity - The average parent world-space velocity over the feedback interval
   */
  resolveTrajectory(endPosition: Vector3, averageVelocity: Vector3): void {
    const sampleAge = MathUtil.clamp(this.framePlayTime - this.bornTime, 0, this.lifetime);
    const frameStartAge = MathUtil.clamp(this.frameLastPlayTime - this.bornTime, 0, this.lifetime);
    const canBacktrack = sampleAge - frameStartAge > MathUtil.zeroTolerance;
    const planEndAge = this.emissionTime + this.state.startDelay;
    const endOffset = canBacktrack ? sampleAge - MathUtil.clamp(planEndAge, frameStartAge, sampleAge) : 0;
    this.emissionEndPosition.set(
      endPosition.x - averageVelocity.x * endOffset,
      endPosition.y - averageVelocity.y * endOffset,
      endPosition.z - averageVelocity.z * endOffset
    );

    this.parentWorldPosition.copyFrom(endPosition);
    this.parentWorldVelocity.copyFrom(averageVelocity);
  }

  /**
   * Completes position-dependent requests after the target's available capacity is known.
   */
  completeDistanceRequests(availableCapacity: number): void {
    const { emissionState, startDelay } = this.state;
    const distanceRate = this.distanceRate;
    if (distanceRate > 0) {
      if (this.resetDistanceState) {
        emissionState.distanceAccumulator = 0;
        emissionState.setLastEmitPosition(this.emissionEndPosition);
      } else {
        if (!emissionState.hasLastEmitPosition) {
          // A missing baseline here can only be the first Distance plan
          const sampleAge = MathUtil.clamp(this.framePlayTime - this.bornTime, 0, this.lifetime);
          const frameStartAge = MathUtil.clamp(this.frameLastPlayTime - this.bornTime, 0, this.lifetime);
          const planStartAge = this.lastEmissionTime + startDelay;
          const startOffset =
            sampleAge - frameStartAge > MathUtil.zeroTolerance
              ? sampleAge - MathUtil.clamp(planStartAge, frameStartAge, sampleAge)
              : 0;
          const endPosition = this.parentWorldPosition;
          const averageVelocity = this.parentWorldVelocity;
          emissionState.lastEmitPosition.set(
            endPosition.x - averageVelocity.x * startOffset,
            endPosition.y - averageVelocity.y * startOffset,
            endPosition.z - averageVelocity.z * startOffset
          );
          emissionState.hasLastEmitPosition = true;
        }

        this.target.emission._collectBirthDistanceRequests(
          this.lastEmissionTime,
          this.emissionTime,
          emissionState,
          this.emissionEndPosition,
          distanceRate,
          availableCapacity,
          this
        );
      }
    }

    this.sortRequests();
  }

  release(): void {
    this.state.release();
    this.subEmitter = null;
    this.target = null;
    this.state = null;
    this._pool.push(this);
  }

  private sortRequests(): void {
    const requests = this.requests;
    requests.length = this.requestCount;
    if (requests.length > 1) {
      requests.sort((left, right) => left.time - right.time || left.order - right.order);
    }
  }
}
