import { MathUtil, Vector3 } from "@galacean/engine-math";
import type { ParticleGenerator } from "../ParticleGenerator";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import type { BirthSubEmitterState } from "./BirthSubEmitterState";
import type { SubEmitter } from "./SubEmitter";

/**
 * Stores one deferred Birth emission time window.
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

  inheritProperties = ParticleSubEmitterInheritProperty.None;
  ringIndex = 0;
  lastEmissionTime = 0;
  emissionTime = 0;
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
  ): this {
    this.subEmitter = subEmitter;
    this.target = target;
    this.state = state;
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
    return this;
  }

  /**
   * Resolves the parent positions required to execute this plan from GPU trajectory feedback.
   * @param endPosition - The parent world position at the end of the feedback interval
   * @param averageVelocity - The average parent world-space velocity over the feedback interval
   */
  resolveTrajectory(endPosition: Vector3, averageVelocity: Vector3): void {
    const { emissionState, startDelay } = this.state;
    const sampleAge = MathUtil.clamp(this.framePlayTime - this.bornTime, 0, this.lifetime);
    const frameStartAge = MathUtil.clamp(this.frameLastPlayTime - this.bornTime, 0, this.lifetime);
    const canBacktrack = sampleAge - frameStartAge > MathUtil.zeroTolerance;
    const planEndAge = this.emissionTime + startDelay;
    const endOffset = canBacktrack ? sampleAge - MathUtil.clamp(planEndAge, frameStartAge, sampleAge) : 0;
    this.emissionEndPosition.set(
      endPosition.x - averageVelocity.x * endOffset,
      endPosition.y - averageVelocity.y * endOffset,
      endPosition.z - averageVelocity.z * endOffset
    );

    if (!emissionState.hasLastEmitPosition) {
      const planStartAge = this.lastEmissionTime + startDelay;
      const startOffset = canBacktrack ? sampleAge - MathUtil.clamp(planStartAge, frameStartAge, sampleAge) : 0;
      const startPosition = this.parentWorldPosition;
      startPosition.set(
        endPosition.x - averageVelocity.x * startOffset,
        endPosition.y - averageVelocity.y * startOffset,
        endPosition.z - averageVelocity.z * startOffset
      );
      emissionState.setLastEmitPosition(startPosition);
    }
    this.parentWorldPosition.copyFrom(endPosition);
    this.parentWorldVelocity.copyFrom(averageVelocity);
  }

  release(): void {
    this.subEmitter = null;
    this.target = null;
    this.state = null;
    this._pool.push(this);
  }
}
