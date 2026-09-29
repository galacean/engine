import { Rand } from "@galacean/engine-math";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";

/**
 * @internal
 */
export class EmissionState {
  frameRateTime = 0;
  currentBurstIndex = 0;

  private _seed = 0;
  private _rateRand: Rand;
  private _burstRand: Rand;

  resetRandomSeed(seed: number): void {
    this._seed = seed;
    this._rateRand?.reset(seed, ParticleRandomSubSeeds.EmissionRate);
    this._burstRand?.reset(seed, ParticleRandomSubSeeds.Burst);
  }

  randomRate(): number {
    return (this._rateRand ||= new Rand(this._seed, ParticleRandomSubSeeds.EmissionRate)).random();
  }

  randomBurst(): number {
    return (this._burstRand ||= new Rand(this._seed, ParticleRandomSubSeeds.Burst)).random();
  }

  resyncTimeCursors(playTime: number): void {
    this.frameRateTime = playTime;
    this.currentBurstIndex = 0;
  }
}
