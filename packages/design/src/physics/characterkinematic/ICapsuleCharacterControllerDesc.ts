import { ICharacterControllerDesc } from "./ICharacterControllerDesc";

/**
 * A descriptor for a capsule character controller.
 */
export interface ICapsuleCharacterControllerDesc extends ICharacterControllerDesc {
  /**
   * (re)sets the structure to the default.
   */
  setToDefault(): void;

  /**
   * The radius of the capsule
   * @param radius The radius of the capsule
   */
  setRadius(radius: number): void;

  /**
   * The height of the controller
   * @param height The height of the controller
   */
  setHeight(height: number): void;

  /**
   * The climbing mode
   * @param climbingMode The climbing mode
   */
  setClimbingMode(climbingMode: number): void;
}
