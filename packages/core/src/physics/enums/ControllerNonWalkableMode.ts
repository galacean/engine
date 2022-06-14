/**
 * The up axis of the collider shape.
 */
export enum ControllerNonWalkableMode {
  /// Stops character from climbing up non-walkable slopes, but doesn't move it otherwise
  Prevent_Climbing,
  /// Stops character from climbing up non-walkable slopes, and forces it to slide down those slopes
  Prevent_Climbing_and_Force_Sliding
}
