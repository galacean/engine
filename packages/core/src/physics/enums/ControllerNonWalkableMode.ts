/**
 * The up axis of the collider shape.
 */
export enum ControllerNonWalkableMode {
  /** Stops character from climbing up non-walkable slopes, but doesn't move it otherwise. */
  PreventClimbing,
  /** Stops character from climbing up non-walkable slopes, and forces it to slide down those slopes. */
  PreventClimbingAndForceSliding
}
