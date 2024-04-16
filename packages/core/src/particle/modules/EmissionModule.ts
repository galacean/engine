import { Rand } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { Burst } from "./Burst";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { BaseShape } from "./shape/BaseShape";

/**
 * The EmissionModule of a Particle Generator.
 */
export class EmissionModule extends ParticleGeneratorModule {
  /**  The rate of particle emission. */
  @deepClone
  rateOverTime: ParticleCompositeCurve = new ParticleCompositeCurve(10);
  /**  The rate at which the emitter spawns new particles over distance. */
  @deepClone
  rateOverDistance: ParticleCompositeCurve = new ParticleCompositeCurve(0);

  @deepClone
  _shape: BaseShape;
  /** @internal */
  @ignoreClone
  _shapeRand = new Rand(0, ParticleRandomSubSeeds.Shape);
  /** @internal */
  _frameRateTime: number = 0;

  @deepClone
  private _bursts: Burst[] = [];

  private _currentBurstIndex: number = 0;

  @ignoreClone
  private _burstRand: Rand = new Rand(0, ParticleRandomSubSeeds.Burst);

  /** The shape of the emitter. */
  get shape() {
    return this._shape;
  }

  set shape(value: BaseShape) {
    this._shape = value;
    this._shape._onValueChanged = this._generator._renderer._onBoundsChanged;
  }
  /**
   * Gets the burst array.
   */
  get bursts(): ReadonlyArray<Burst> {
    return this._bursts;
  }

  /**
   * Add a single burst.
   * @param burst - The burst
   */
  addBurst(burst: Burst): void {
    const bursts = this._bursts;
    let burstIndex = bursts.length;
    while (--burstIndex >= 0 && burst.time < bursts[burstIndex].time);
    bursts.splice(burstIndex + 1, 0, burst);
  }

  /**
   * Remove a single burst from the array of bursts.
   * @param burst - The burst data
   */
  removeBurst(burst: Burst): void {
    const index = this._bursts.indexOf(burst);
    if (index !== -1) {
      this._bursts.splice(index, 1);
    }
  }

  /**
   * Remove a single burst from the array of bursts.
   * @param index - The burst data index
   */
  removeBurstByIndex(index: number): void {
    this._bursts.splice(index, 1);
  }

  /**
   * Clear burst data.
   */
  clearBurst(): void {
    this._bursts.length = 0;
  }

  /**
   * @internal
   */
  _emit(lastPlayTime: number, playTime: number): void {
    this._emitByRateOverTime(playTime);
    this._emitByBurst(lastPlayTime, playTime);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._burstRand.reset(seed, ParticleRandomSubSeeds.Burst);
    this._shapeRand.reset(seed, ParticleRandomSubSeeds.Shape);
  }

  /**
   * @internal
   */
  _reset(): void {
    this._frameRateTime = 0;
    this._currentBurstIndex = 0;
  }

  private _emitByRateOverTime(playTime: number): void {
    const ratePerSeconds = this.rateOverTime.evaluate(undefined, undefined);
    if (ratePerSeconds > 0) {
      const generator = this._generator;
      const emitInterval = 1.0 / ratePerSeconds;

      let cumulativeTime = playTime - this._frameRateTime;
      while (cumulativeTime >= emitInterval) {
        cumulativeTime -= emitInterval;
        this._frameRateTime += emitInterval;
        generator._emit(this._frameRateTime, 1);
      }
    }
  }

  private _emitByBurst(lastPlayTime: number, playTime: number): void {
    const main = this._generator.main;
    const duration = main.duration;
    const cycleCount = Math.floor((playTime - lastPlayTime) / duration);

    // Across one cycle
    if (main.isLoop && (cycleCount > 0 || playTime % duration < lastPlayTime % duration)) {
      let middleTime = Math.ceil(lastPlayTime / duration) * duration;
      this._emitBySubBurst(lastPlayTime, middleTime, duration);
      this._currentBurstIndex = 0;

      for (let i = 0; i < cycleCount; i++) {
        const lastMiddleTime = middleTime;
        middleTime += duration;
        this._emitBySubBurst(lastMiddleTime, middleTime, duration);
        this._currentBurstIndex = 0;
      }

      this._emitBySubBurst(middleTime, playTime, duration);
    } else {
      this._emitBySubBurst(lastPlayTime, playTime, duration);
    }
  }

  private _emitBySubBurst(lastPlayTime: number, playTime: number, duration: number): void {
    const generator = this._generator;
    const rand = this._burstRand;
    const bursts = this.bursts;

    // Calculate the relative time of the burst
    const baseTime = Math.floor(lastPlayTime / duration) * duration;
    const startTime = lastPlayTime % duration;
    const endTime = startTime + (playTime - lastPlayTime);

    let index = this._currentBurstIndex;
    for (let n = bursts.length; index < n; index++) {
      const burst = bursts[index];
      const burstTime = burst.time;

      if (burstTime > endTime) {
        break;
      }

      if (burstTime >= startTime) {
        const count = burst.count.evaluate(undefined, rand.random());
        generator._emit(baseTime + burstTime, count);
      }
    }
    this._currentBurstIndex = index;
  }
}
