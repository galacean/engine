/**
 * Used to specify which axes of a Configurable joint are driven.
 */
export enum ConfigurableJointDrive {
  /** drive along the X-axis */
  X = 0,
  /** drive along the Y-axis */
  Y = 1,
  /** drive along the Z-axis */
  Z = 2,
  /** drive of displacement from the X-axis */
  SWING = 3,
  /** drive of the displacement around the X-axis */
  TWIST = 4,
  /** drive of all three angular degrees along a SLERP-path */
  SLERP = 5
}