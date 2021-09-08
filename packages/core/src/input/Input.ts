import { Entity } from "../Entity";

/**
 * Input.
 */
export class Input {
  /** Current pageX. */
  pageX: number = 0;
  /** Current pageY. */
  pageY: number = 0;
  /** Currently pressed entity. */
  pressedEntity: Entity = null;
  /** Currently entered entity. */
  enteredEntity: Entity = null;
}
