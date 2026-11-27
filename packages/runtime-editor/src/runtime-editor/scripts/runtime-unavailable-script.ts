import { Script } from "@galacean/engine";

/** Serialization carrier only. Authoring data remains in the project, not this instance. */
export class UnavailableProjectScript extends Script {
  readonly runtimeAvailable = false;
}
