import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";

/** @internal */
export interface EmissionSample {
  time: number;
  count: number;
  position: Vector3 | null;
}

/**
 * Mutable cursors used while evaluating an {@link EmissionModule}.
 *
 * Emission configuration belongs to the module, while this object belongs to one
 * running emitter. A normal particle system owns one state; every Birth
 * sub-emitter owns one state for each parent-particle and sub-emitter slot.
 */
export class EmissionRuntimeState {
  frameRateTime = 0;
  distanceAccumulator = 0;
  readonly lastEmitPosition = new Vector3();
  hasLastEmitPosition = false;
  currentBurstIndex = 0;

  rateRandomSeed = 0;
  burstRandomSeed = 0;
  readonly rateRand = new Rand(0, ParticleRandomSubSeeds.EmissionRate);
  readonly burstRand = new Rand(0, ParticleRandomSubSeeds.Burst);

  /** @internal */
  readonly _samples: EmissionSample[] = [];
  /** @internal */
  _sampleCount = 0;

  /** @internal */
  reset(seed: number, playTime: number = 0): void {
    this.rateRandomSeed = seed >>> 0;
    this.burstRandomSeed = seed >>> 0;
    this.rateRand.reset(this.rateRandomSeed, ParticleRandomSubSeeds.EmissionRate);
    this.burstRand.reset(this.burstRandomSeed, ParticleRandomSubSeeds.Burst);
    this.resyncCursors(playTime);
  }

  /** @internal */
  resyncCursors(playTime: number): void {
    this.frameRateTime = playTime;
    this.distanceAccumulator = 0;
    this.hasLastEmitPosition = false;
    this.currentBurstIndex = 0;
    this._sampleCount = 0;
  }

  /** @internal */
  setLastEmitPosition(position: Vector3): void {
    this.lastEmitPosition.copyFrom(position);
    this.hasLastEmitPosition = true;
  }

  /** @internal */
  beginSamples(): void {
    this._sampleCount = 0;
  }

  /** @internal */
  addSample(time: number, count: number, position?: Vector3): void {
    let sample = this._samples[this._sampleCount];
    if (!sample) {
      sample = this._samples[this._sampleCount] = { time: 0, count: 0, position: null };
    }
    sample.time = time;
    sample.count = count;
    if (position) {
      (sample.position ||= new Vector3()).copyFrom(position);
    } else {
      sample.position = null;
    }
    this._sampleCount++;
  }
}
