/**
 * The JointMotor is used to motorize a joint.
 */
export class JointMotor {
  /** The motor will apply a force up to force to achieve targetVelocity. */
  targetVelocity: number = 0;
  /** The force limit.*/
  forceLimit: number = Number.MAX_VALUE;
  /** Gear ration for the motor */
  gearRation: number = 1.0;
  /** If freeSpin is enabled the motor will only accelerate but never slow down. */
  freeSpin: boolean = false;
}
