import { Vector3 } from "@galacean/engine-math";
import { ICollider } from "./ICollider";

/**
 * Base class for character controllers.
 */
export interface ICharacterController extends ICollider {
  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp Displacement vector
   * @param minDist The minimum travelled distance to consider.
   * @param elapsedTime Time elapsed since last call
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number;

  /**
   * Sets controller's world position.
   * @param position The new (center) position for the controller.
   */
  setWorldPosition(position: Vector3): void;

  /**
   * Retrieve the world position of the controller.
   * @param position The controller's center position
   */
  getWorldPosition(position: Vector3): void;

  /**
   * The step height.
   * @param offset The new step offset for the controller.
   */
  setStepOffset(offset: number): void;

  /**
   * Sets the non-walkable mode for the CCT.
   * @param flag The new value of the non-walkable mode.
   */
  setNonWalkableMode(flag: number): void;

  /**
   * Sets the 'up' direction.
   * @param up The up direction for the controller.
   */
  setUpDirection(up: Vector3): void;

  /**
   * Sets the slope limit.
   * @param slopeLimit The slope limit for the controller.
   */
  setSlopeLimit(slopeLimit: number): void;
}
