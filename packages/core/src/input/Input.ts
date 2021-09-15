import { Entity } from "../Entity";

/**
 * Input.
 */
export class Input {
  x: number = 0;
  y: number = 0;
  /** Currently pressed entity. */
  pressedEntity: Entity = null;
  /** Currently entered entity. */
  enteredEntity: Entity = null;
}
