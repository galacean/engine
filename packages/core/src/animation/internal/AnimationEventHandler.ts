import { AnimationEvent } from "../AnimationEvent";
/**
 * @internal
 */
export class AnimationEventHandler {
  event: AnimationEvent;
  handlers: Function[] = [];
}
