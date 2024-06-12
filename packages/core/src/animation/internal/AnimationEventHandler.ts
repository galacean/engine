import { IPoolElement } from "../../utils/ReturnableObjectPool";
import { AnimationEvent } from "../AnimationEvent";
/**
 * @internal
 */
export class AnimationEventHandler implements IPoolElement {
  event: AnimationEvent;
  handlers: Function[] = [];

  dispose() {}
}
