import { Burst } from "./Burst";
import { IClone } from "@galacean/engine-design";

/**
 * The EmissionModule of a Particle System.
 */
export class EmissionModule implements IClone {
  private _emissionRate: number = 10;
  private _emissionRateOverDistance: number = 0;
  private _bursts: Burst[] = [];

  /** Specifies whether the EmissionModule is enabled or disabled. */
  enable: boolean = true;

  /**
   * The rate of particle emission.
   */
  get emissionRate(): number {
    return this._emissionRate;
  }

  set emissionRate(value: number) {
    if (value < 0) throw new Error("ParticleBaseShape:emissionRate value must large or equal than 0.");
    this._emissionRate = value;
  }

  /**
   * The rate at which the emitter spawns new particles over distance.
   */
  get emissionRateOverDistance(): number {
    return this._emissionRateOverDistance;
  }

  set emissionRateOverDistance(value: number) {
    value = Math.max(0, value);
    this._emissionRateOverDistance = value;
  }

  /**
   * Gets the burst array.
   */
  get bursts(): Burst[] {
    return this._bursts;
  }

  /**
   * The current number of bursts.
   */
  get burstCount(): number {
    return this._bursts.length;
  }

  /**
   * Gets a single burst from the array of bursts.
   * @param index - The index of the burst to retrieve.
   * @return The burst data at the given index.
   */
  getBurstByIndex(index: number): Burst {
    return this._bursts[index];
  }

  /**
   * Add a single burst from the array of bursts.
   * @param burst - The burst data
   */
  addBurst(burst: Burst): void {
    const burstsCount: number = this._bursts.length;
    if (burstsCount > 0)
      for (let i: number = 0; i < burstsCount; i++) {
        if (this._bursts[i].time > burst.time) this._bursts.splice(i, 0, burst);
      }
    this._bursts.push(burst);
  }

  /**
   * Remove a single burst from the array of bursts.
   * @param burst - The burst data
   */
  removeBurst(burst: Burst): void {
    const index: number = this._bursts.indexOf(burst);
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
    const destBursts: Burst[] = destEmission._bursts;
    destBursts.length = this._bursts.length;
    for (let i: number = 0, n: number = this._bursts.length; i < n; i++) {
      const destBurst: Burst = destBursts[i];
      if (destBurst) this._bursts[i].cloneTo(destBurst);
      else destBursts[i] = this._bursts[i].clone();
    }

    destEmission._emissionRate = this._emissionRate;
    destEmission._emissionRateOverDistance = this._emissionRateOverDistance;
    destEmission.enable = this.enable;
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