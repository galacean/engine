import { EmissionState } from "./EmissionState";

/**
 * Stores the Birth emission timeline owned by one parent particle and sub-emitter slot.
 * @internal
 */
export class BirthSubEmitterState {
  readonly emissionState = new EmissionState();

  startDelay: number;

  reset(seed: number, startDelay: number, initialEmissionTime: number): void {
    this.startDelay = startDelay;
    const emissionState = this.emissionState;
    emissionState.resetRandomSeed(seed);
    emissionState.resyncTimeCursors(initialEmissionTime);
  }
}
