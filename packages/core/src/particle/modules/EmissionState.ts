import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";

/**
 * @internal
 */
export class EmissionState {
  frameRateTime = 0;
  readonly rateRand = new Rand(0, ParticleRandomSubSeeds.EmissionRate);

  distanceAccumulator = 0;
  readonly lastEmitPosition = new Vector3();
  hasLastEmitPosition = false;

  currentBurstIndex = 0;
  readonly burstRand = new Rand(0, ParticleRandomSubSeeds.Burst);

  resetRandomSeed(seed: number): void {
    this.rateRand.reset(seed, ParticleRandomSubSeeds.EmissionRate);
    this.burstRand.reset(seed, ParticleRandomSubSeeds.Burst);
  }

  setLastEmitPosition(position: Vector3): void {
    this.lastEmitPosition.copyFrom(position);
    this.hasLastEmitPosition = true;
  }
}
