/**
 * JointLimits is used to limit the joints angle.
 */
export class JointLimits {
  /** The upper angular limit (in radians) of the joint. */
  max: number = 0;
  /** The lower angular limit (in radians) of the joint. */
  min: number = 0;
  /** Distance inside the limit value at which the limit will be considered to be active by the solver.
   * Default is the lesser of 0.1 radians, and 0.49 * (upperLimit - lowerLimit)
   */
  contactDistance: number = -1;

  /** The spring forces used to reach the target position. */
  stiffness: number = 0;
  /** The damper force uses to dampen the spring. */
  damping: number = 0;
}
