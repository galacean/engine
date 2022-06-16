/**
 * Used to specify one of the degrees of freedom of a Configurable joint.
 */
export enum ConfigurableJointMotion {
  /** The DOF is locked, it does not allow relative motion. */
  Locked = 0,
  /** The DOF is limited, it only allows motion within a specific range. */
  Limited = 1,
  /** The DOF is free and has its full range of motion. */
  Free = 2
}
