import { IJoint } from "./IJoint";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export interface ISphericalJoint extends IJoint {
  /** Whether enable spring limit */
  enableSpring(value: boolean);

  /** The limit angle from the Y-axis of the constraint frame. */
  setYLimit(value: number);

  /** The limit angle from the Z-axis of the constraint frame. */
  setZLimit(value: number);

  /** Distance inside the limit value at which the limit will be considered to be active by the solver. */
  setContactDistance(value: number);

  /** The spring forces used to reach the target position. */
  setStiffness(value: number);

  /** The damper force uses to dampen the spring. */
  setDamping(value: number);
}
