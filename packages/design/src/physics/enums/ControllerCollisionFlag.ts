/**
 * Collision sides reported by a character controller move.
 */
export enum ControllerCollisionFlag {
  /** No collision was reported. */
  None = 0,
  /** Character is colliding to the sides. */
  Sides = 1,
  /** Character has collision above. */
  Up = 2,
  /** Character has collision below. */
  Down = 4
}
