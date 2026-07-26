import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";

/**
 * @internal
 */
export interface EmissionRequest {
  time: number;
  count: number;
  position: Vector3 | null;
  order: number;
}

/**
 * @internal
 */
export class EmissionState {
  frameRateTime = 0;
  readonly rateRand = new Rand(0, ParticleRandomSubSeeds.EmissionRate);

  distanceRate = 0;
  distanceAccumulator = 0;
  readonly lastEmitPosition = new Vector3();
  hasLastEmitPosition = false;

  currentBurstIndex = 0;
  readonly burstRand = new Rand(0, ParticleRandomSubSeeds.Burst);

  readonly requests: EmissionRequest[] = [];
  requestCount = 0;

  resetRandomSeed(seed: number): void {
    this.rateRand.reset(seed, ParticleRandomSubSeeds.EmissionRate);
    this.burstRand.reset(seed, ParticleRandomSubSeeds.Burst);
  }

  resyncCursors(playTime: number): void {
    this.frameRateTime = playTime;
    this.distanceAccumulator = 0;
    this.distanceRate = 0;
    this.hasLastEmitPosition = false;
    this.currentBurstIndex = 0;
    this.requestCount = 0;
  }

  beginRequests(): void {
    this.requestCount = 0;
    this.distanceRate = 0;
  }

  addRequest(time: number, count: number, position: Vector3 | null, order: number): void {
    const request = (this.requests[this.requestCount] ??= { time, count, position: null, order });
    request.time = time;
    request.count = count;
    request.order = order;
    if (position) {
      (request.position ||= new Vector3()).copyFrom(position);
    } else {
      request.position = null;
    }
    this.requestCount++;
  }

  setLastEmitPosition(position: Vector3): void {
    this.lastEmitPosition.copyFrom(position);
    this.hasLastEmitPosition = true;
  }
}
