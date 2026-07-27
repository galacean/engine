import { EmissionState } from "./EmissionState";

/**
 * Stores the Birth emission timeline owned by one parent particle and sub-emitter slot.
 * @internal
 */
export class BirthSubEmitterState {
  readonly emissionState = new EmissionState();

  startDelay = 0;
  previousEmissionParentAge = 0;
  shouldEmit = true;
}
