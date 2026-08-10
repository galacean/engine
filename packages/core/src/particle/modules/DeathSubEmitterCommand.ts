import type { ParticleGenerator } from "../ParticleGenerator";
import type { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";

/**
 * Stores one same-frame Death emission event.
 * @internal
 */
export class DeathSubEmitterCommand {
  ringIndex: number;
  count: number;
  inheritProperties: ParticleSubEmitterInheritProperty;
  frameTime: number;
  trajectoryDuration: number;

  constructor(
    readonly source: ParticleGenerator,
    private readonly _pool: DeathSubEmitterCommand[]
  ) {}

  reset(
    ringIndex: number,
    count: number,
    inheritProperties: ParticleSubEmitterInheritProperty,
    frameTime: number,
    trajectoryDuration: number
  ): void {
    this.ringIndex = ringIndex;
    this.trajectoryDuration = trajectoryDuration;
    this.count = count;
    this.inheritProperties = inheritProperties;
    this.frameTime = frameTime;
  }

  release(): void {
    this._pool.push(this);
  }
}
