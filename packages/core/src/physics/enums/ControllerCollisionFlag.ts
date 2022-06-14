/**
 * The up axis of the collider shape.
 */
export enum ControllerCollisionFlag {
  /** Character is colliding to the sides. */
  Sides = 1,
  /** Character has collision above. */
  Up = 2,
  /** Character has collision below. */
  Down = 4
}
