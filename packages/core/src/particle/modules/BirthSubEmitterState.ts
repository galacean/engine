import { EmissionState } from "./EmissionState";

/**
 * Stores the Birth emission timeline owned by one parent particle and sub-emitter slot.
 * @internal
 */
export class BirthSubEmitterState extends EmissionState {
  startDelay: number;

  reset(seed: number, startDelay: number, initialEmissionTime: number): void {
    this.startDelay = startDelay;
    this.resetRandomSeed(seed);
    this.resyncTimeCursors(initialEmissionTime);
  }
}
