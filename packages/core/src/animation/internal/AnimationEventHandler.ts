import { Script } from "../../Script";
import { AnimationEvent } from "../AnimationEvent";

/**
 * @internal
 */
export class AnimationEventHandler {
  event: AnimationEvent;
  handlers: { script: Script; fn: Function }[] = [];
}
