import { MathUtil } from "@galacean/engine-math";
import type { ParticleGenerator } from "../ParticleGenerator";
import type { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";

interface EmissionRequest {
  time: number;
  count: number;
}

/**
 * Stores one same-frame Birth emission command.
 * @internal
 */
export class BirthSubEmitterCommand {
  readonly isBirth = true as const;
  readonly requests: EmissionRequest[] = [];

  requestCount = 0;
  ringIndex: number;
  inheritProperties: ParticleSubEmitterInheritProperty;
  startDelay: number;
  lifetime: number;

  private _frameStartParentAge: number;
  private _frameDuration: number;
  private _frameSimulationStart: number;

  constructor(
    readonly source: ParticleGenerator,
    private readonly _pool: BirthSubEmitterCommand[]
  ) {}

  reset(
    startDelay: number,
    inheritProperties: ParticleSubEmitterInheritProperty,
    ringIndex: number,
    bornTime: number,
    lifetime: number,
    frameLastPlayTime: number,
    framePlayTime: number,
    frameSimulationStart: number
  ): void {
    this.inheritProperties = inheritProperties;
    this.ringIndex = ringIndex;
    this.startDelay = startDelay;
    this.lifetime = lifetime;
    this._frameStartParentAge = frameLastPlayTime - bornTime;
    this._frameDuration = framePlayTime - frameLastPlayTime;
    this._frameSimulationStart = frameSimulationStart;
  }

  addRequest(time: number, count: number): void {
    const request = (this.requests[this.requestCount] ??= { time, count });
    request.time = time;
    request.count = count;
    this.requestCount++;
  }

  sortRequests(): void {
    const requests = this.requests;
    for (let i = 1, n = this.requestCount; i < n; i++) {
      const request = requests[i];
      let insertIndex = i;
      while (insertIndex > 0 && requests[insertIndex - 1].time > request.time) {
        requests[insertIndex] = requests[insertIndex - 1];
        insertIndex--;
      }
      requests[insertIndex] = request;
    }
  }

  getTrajectoryTimeOffset(emissionTime: number): number {
    const frameStartParentAge = this._frameStartParentAge;
    const sampleAge = MathUtil.clamp(frameStartParentAge + this._frameDuration, 0, this.lifetime);
    const frameStartAge = MathUtil.clamp(frameStartParentAge, 0, this.lifetime);
    return sampleAge - frameStartAge > MathUtil.zeroTolerance
      ? sampleAge - MathUtil.clamp(emissionTime + this.startDelay, frameStartAge, sampleAge)
      : 0;
  }

  getFrameTime(emissionTime: number): number {
    const frameDuration = this._frameDuration;
    const activeFrameTime =
      frameDuration > MathUtil.zeroTolerance
        ? MathUtil.clamp((emissionTime + this.startDelay - this._frameStartParentAge) / frameDuration, 0, 1)
        : 1;
    const frameSimulationStart = this._frameSimulationStart;
    return frameSimulationStart + activeFrameTime * (1 - frameSimulationStart);
  }

  getTrajectoryDuration(): number {
    const frameStartParentAge = this._frameStartParentAge;
    return (
      MathUtil.clamp(frameStartParentAge + this._frameDuration, 0, this.lifetime) -
      MathUtil.clamp(frameStartParentAge, 0, this.lifetime)
    );
  }

  release(): void {
    this.requestCount = 0;
    this._pool.push(this);
  }
}
