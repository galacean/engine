import { Vector3 } from "@oasis-engine/math";

/**
 * Base class for character controllers.
 */
export interface ICharacterController {
  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp Displacement vector
   * @param minDist The minimum travelled distance to consider.
   * @param elapsedTime Time elapsed since last call
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number;

  /**
   * Test whether flags contain certain flag
   * @param flags flags number
   * @param flag certain flag
   */
  isSetControllerCollisionFlag(flags: number, flag: number): boolean;

  /**
   * Sets controller's position.
   * @param position The new (center) position for the controller.
   */
  setPosition(position: Vector3): boolean;

  /**
   * Retrieve the raw position of the controller.
   * @param position The controller's center position
   */
  getPosition(position: Vector3): void;

  /**
   * Set controller's foot position.
   * @param position The new (bottom) position for the controller.
   */
  setFootPosition(position: Vector3): void;

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
   * Sets the contact offset.
   * @param offset The contact offset for the controller.
   */
  setContactOffset(offset: number): void;

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

  /**
   * Flushes internal geometry cache.
   */
  invalidateCache(): void;

  /**
   * Resizes the controller.
   * @param height
   */
  resize(height: number): void;

  /**
   * Update collider shape
   */
  updateShape(): void;

  /**
   * Deletes the collider.
   */
  destroy(): void;
}
