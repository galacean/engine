/**
 * The up axis of the collider shape.
 */
export enum ControllerCollisionFlag {
  /// Character is colliding to the sides.
  Collision_Sides = 1,
  /// Character has collision above.
  Collision_Up = 2,
  /// Character has collision below.
  Collision_Down = 4
}