import { IJoint } from "./IJoint";

/*
 A fixed joint permits no relative movement between two bodies. ie the bodies are glued together.
 */
export interface IFixedJoint extends IJoint {
  /**
   * Set the linear tolerance threshold for projection.
   * @param tolerance the linear tolerance threshold
   */
  setProjectionLinearTolerance(tolerance: number): void;

  /**
   * Set the angular tolerance threshold for projection.
   * @param tolerance the angular tolerance threshold in radians
   */
  setProjectionAngularTolerance(tolerance: number): void;
}
