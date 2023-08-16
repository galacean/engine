import { Rand } from "@galacean/engine-math";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { Burst } from "./Burst";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * The EmissionModule of a Particle System.
 */
export class EmissionModule extends ParticleGeneratorModule {
  /**  The rate of particle emission. */
  rateOverTime: ParticleCompositeCurve = new ParticleCompositeCurve(10);
  /**  The rate at which the emitter spawns new particles over distance. */
  rateOverDistance: ParticleCompositeCurve = new ParticleCompositeCurve(0);

  private _bursts: Burst[] = [];

  private _frameRateTime: number = 0;
  private _currentBurstIndex: number = 0;
  private _burstRand: Rand = new Rand(0, ParticleRandomSubSeeds.Burst);

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
    while (--burstIndex >= 0 && burst.time < bursts[burstIndex].time) {
      bursts.splice(burstIndex + 1, 0, burst);
    }
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
   * @override
   */
  cloneTo(destEmission: EmissionModule): void {
    destEmission.enabled = this.enabled;
    destEmission.rateOverTime = this.rateOverTime;
    destEmission.rateOverDistance = this.rateOverDistance;

    const srcBursts = this._bursts;
    const destBursts = destEmission._bursts;
    const burstCount = srcBursts.length;
    destBursts.length = burstCount;
    for (let i = 0; i < burstCount; i++) {
      const destBurst = destBursts[i];
      if (destBurst) {
        srcBursts[i].cloneTo(destBurst);
      } else {
        destBursts[i] = srcBursts[i].clone();
      }
    }
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
  }

  private _emitByRateOverTime(playTime: number): void {
    const ratePerSeconds = this.rateOverTime.evaluate(undefined, undefined);
    if (ratePerSeconds > 0) {
      const particleSystem = this._generator;
      const emitInterval = 1.0 / ratePerSeconds;

      let cumulativeTime = playTime - this._frameRateTime;
      while (cumulativeTime >= emitInterval) {
        cumulativeTime -= emitInterval;
        this._frameRateTime += emitInterval;
        particleSystem._emit(this._frameRateTime, 1);
      }
    }
  }

  private _emitByBurst(lastPlayTime: number, playTime: number): void {
    const main = this._generator.main;
    const duration = main.duration;
    const cycleCount = Math.floor(playTime - lastPlayTime / duration);

    // Across one cycle
    if (main.loop && (cycleCount > 0 || playTime < lastPlayTime)) {
      let middleTime = Math.ceil(lastPlayTime / duration) * duration;
      this._emitBySubBurst(lastPlayTime, middleTime);
      this._currentBurstIndex = 0;

      for (let i = 0; i < cycleCount; i++) {
        const lastMiddleTime = middleTime;
        middleTime += duration;
        this._emitBySubBurst(lastMiddleTime, middleTime);
        this._currentBurstIndex = 0;
      }

      this._emitBySubBurst(middleTime, playTime);
    } else {
      this._emitBySubBurst(lastPlayTime, playTime);
    }
  }

  private _emitBySubBurst(lastPlayTime: number, playTime: number): void {
    const particleSystem = this._generator;
    const rand = this._burstRand;
    const bursts = this.bursts;

    // Calculate the relative time of the burst
    const burstDuration = playTime - lastPlayTime;
    const burstStart = lastPlayTime % particleSystem.main.duration;
    const burstEnd = burstStart + burstDuration;

    let index = this._currentBurstIndex;
    for (let n = bursts.length; index < n; index++) {
      const burst = bursts[index];
      const burstTime = burst.time;

      if (burstTime > burstEnd) {
        break;
      }

      if (burstTime >= burstStart) {
        const count = burst.count.evaluate(undefined, rand.random());
        particleSystem._emit(lastPlayTime + burstTime, count);
      }
    }
    this._currentBurstIndex = index;
  }
}
