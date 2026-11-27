import { IJoint } from "./IJoint";

/**
 * A spring joint that constrains the distance between two anchors.
 */
export interface ISpringJoint extends IJoint {
  /**
   * Set the allowed minimum distance for the joint.
   * @param distance the minimum distance
   */
  setMinDistance(distance: number): void;

  /**
   * Set the allowed maximum distance for the joint.
   * @param distance the maximum distance
   */
  setMaxDistance(distance: number): void;

  /**
   * Set the error tolerance of the joint.
   * @param tolerance the distance beyond the allowed range at which the joint becomes active
   */
  setTolerance(tolerance: number): void;

  /**
   * Set the strength of the joint spring.
   * @param stiffness the spring strength of the joint
   */
  setStiffness(stiffness: number): void;

  /**
   * Set the damping of the joint spring.
   * @param damping the degree of damping of the joint spring of the joint
   */
  setDamping(damping: number): void;
}
