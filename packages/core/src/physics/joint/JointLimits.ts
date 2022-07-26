/**
 * JointLimits is used to limit the joints angle.
 */
export class JointLimits {
  /** The upper angular limit (in degrees) of the joint. */
  max: number = 0;
  /** The lower angular limit (in degrees) of the joint. */
  min: number = 0;
  /** Distance inside the limit value at which the limit will be considered to be active by the solver. */
  contactDistance: number = -1;

  /** The spring forces used to reach the target position. */
  stiffness: number = 0;
  /** The damper force uses to dampen the spring. */
  damping: number = 0;
}
