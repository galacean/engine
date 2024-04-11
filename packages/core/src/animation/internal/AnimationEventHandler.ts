import { IPoolElement } from "../../utils/Pool";
import { AnimationEvent } from "../AnimationEvent";
/**
 * @internal
 */
export class AnimationEventHandler implements IPoolElement {
  event: AnimationEvent;
  handlers: Function[] = [];

  dispose() {}
}
