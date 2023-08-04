import { ParticleSystem } from "../ParticleSystem";
import { Burst } from "./Burst";
import { ParticleCurve } from "./ParticleCurve";

/**
 * The EmissionModule of a Particle System.
 */
export class EmissionModule {
  /** Specifies whether the EmissionModule is enabled or disabled. */
  enabled: boolean = true;
  /**  The rate of particle emission. */
  rateOverTime: ParticleCurve = new ParticleCurve();
  /**  The rate at which the emitter spawns new particles over distance. */
  rateOverDistance: ParticleCurve = new ParticleCurve();

  private _bursts: Burst[] = [];

  private _frameRateTime: number = 0;
  private _currentBurstIndex: number = 0;
  private _particleSystem: ParticleSystem;

  /**
   * Gets the burst array.
   */
  get bursts(): ReadonlyArray<Burst> {
    return this._bursts;
  }

  constructor(particleSystem: ParticleSystem) {
    this._particleSystem = particleSystem;
    this.rateOverTime.constant = 10;
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
   * @internal
   */
  _emitByRateOverTime(fromTime: number, toTime: number): void {
    const ratePerSeconds = this.rateOverTime.evaluate(undefined, undefined);

    if (ratePerSeconds > 0) {
      const particleSystem = this._particleSystem;
      const emitInterval = 1.0 / ratePerSeconds;

      const emitStartTime = fromTime - emitInterval;
      let totalFrameRateTime = toTime - emitStartTime;
      while (totalFrameRateTime >= emitInterval) {
        particleSystem._emit(fromTime + emitInterval, 1);
        totalFrameRateTime -= emitInterval;
      }

      this._frameRateTime = totalFrameRateTime;
    }
  }

  /**
   * @internal
   */
  _emitByBurst(fromTime: number, toTime: number): void {
    if (toTime < fromTime) {
      this._emitBySubBurst(fromTime, this._particleSystem.main.duration);
      this._currentBurstIndex = 0;
      this._emitBySubBurst(0, toTime);
    } else {
      this._emitBySubBurst(fromTime, toTime);
    }
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

  private _emitBySubBurst(fromTime: number, toTime: number): void {
    const particleSystem = this._particleSystem;
    const rand = particleSystem._rand;
    const bursts = this.bursts;

    let currentBurstIndex = this._currentBurstIndex;
    for (let n = bursts.length; currentBurstIndex < n; currentBurstIndex++) {
      const burst = bursts[currentBurstIndex];
      const burstTime = burst.time;

      if (burstTime > toTime) {
        break;
      }

      if (burstTime >= fromTime) {
        const count = burst.count.evaluate(undefined, rand.random());
        particleSystem._emit(burstTime, count);
      }
    }
    this._currentBurstIndex = currentBurstIndex;
  }
}
