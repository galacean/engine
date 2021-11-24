import { ICharacterController } from "./ICharacterController";

/**
 * A capsule character controller.
 */
export interface ICapsuleCharacterController extends ICharacterController {
  /**
   * Sets controller's radius.
   * @param radius The new radius for the controller.
   */
  setRadius(radius: number): boolean;

  /**
   * Resets controller's height.
   * @param height The new height for the controller.
   */
  setHeight(height: number): boolean;

  /**
   * Sets controller's climbing mode.
   * @param mode The capsule controller's climbing mode.
   */
  setClimbingMode(mode: number): boolean;
}
