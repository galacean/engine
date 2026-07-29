import { EmissionState } from "./EmissionState";

/**
 * Stores the Birth emission timeline owned by one parent particle and sub-emitter slot.
 * @internal
 */
export class BirthSubEmitterState {
  readonly emissionState = new EmissionState();

  startDelay = 0;
  lastProcessedParentAge = 0;
  shouldEmit = true;
  resetDistanceOnNextFeedback = false;

  // An attached ring slot holds one reference and each deferred Plan holds another
  private _referenceCount = 0;

  constructor(private readonly _pool: BirthSubEmitterState[]) {}

  reset(
    seed: number,
    startDelay: number,
    initialParentAge: number,
    initialEmissionTime: number,
    shouldEmit: boolean
  ): void {
    this.startDelay = startDelay;
    this.lastProcessedParentAge = initialParentAge;
    this.shouldEmit = shouldEmit;
    this.resetDistanceOnNextFeedback = false;
    const emissionState = this.emissionState;
    emissionState.resetRandomSeed(seed);
    emissionState.resyncTimeCursors(initialEmissionTime);
    emissionState.distanceAccumulator = 0;
    emissionState.hasLastEmitPosition = false;
  }

  retain(): void {
    this._referenceCount++;
  }

  release(): void {
    if (--this._referenceCount === 0) {
      this._pool.push(this);
    }
  }
}
