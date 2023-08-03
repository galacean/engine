import { IClone } from "@galacean/engine-design";
import { Burst } from "./Burst";
import { ParticleCurve } from "./ParticleCurve";

/**
 * The EmissionModule of a Particle System.
 */
export class EmissionModule implements IClone {
  /** Specifies whether the EmissionModule is enabled or disabled. */
  enable: boolean = true;
  /**  The rate of particle emission. */
  rateOverTime: ParticleCurve = new ParticleCurve();
  /**  The rate at which the emitter spawns new particles over distance. */
  rateOverDistance: ParticleCurve = new ParticleCurve();

  private _bursts: Burst[] = [];

  /**
   * Gets the burst array.
   */
  get bursts(): ReadonlyArray<Burst> {
    return this._bursts;
  }

  constructor() {
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
   * @override
   */
  cloneTo(destEmission: EmissionModule): void {
    destEmission.enable = this.enable;
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
   * @override
   */
  clone(): EmissionModule {
    const destEmission = new EmissionModule();
    this.cloneTo(destEmission);
    return destEmission;
  }
}
