/**
 * Used to specify one of the degrees of freedom of  a Configurable joint.
 */
export enum ConfigurableJointAxis {
  /** motion along the X axis */
  X = 0,
  /** motion along the Y axis */
  Y = 1,
  /** motion along the Z axis */
  Z = 2,
  /** motion around the X axis */
  Twist = 3,
  /** motion around the Y axis */
  SwingY = 4,
  /** motion around the Z axis */
  SwingZ = 5
}
