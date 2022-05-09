import { Vector3 } from "@oasis-engine/math";
import { ICharacterControllerDesc } from "./ICharacterControllerDesc";
import { ICharacterController } from "./ICharacterController";

/**
 * Manages an array of character controllers.
 */
export interface ICharacterControllerManager {
  /**
   * Releases all the controllers that are being managed.
   */
  purgeControllers(): void;

  /**
   * Creates a new character controller.
   * @param desc The controllers descriptor
   */
  createController(desc: ICharacterControllerDesc): ICharacterController;

  /**
   * Computes character-character interactions.
   * @param elapsedTime Elapsed time since last call
   */
  computeInteractions(elapsedTime: number): void;

  /**
   * Enables or disables runtime tessellation.
   * @param flag True/false to enable/disable runtime tessellation.
   * @param maxEdgeLength Max edge length allowed before tessellation kicks in.
   */
  setTessellation(flag: boolean, maxEdgeLength: number): void;

  /**
   * Enables or disables the overlap recovery module.
   * @param flag True/false to enable/disable overlap recovery module.
   */
  setOverlapRecoveryModule(flag: boolean): void;

  /**
   * Enables or disables the precise sweeps.
   * @param flag True/false to enable/disable precise sweeps.
   */
  setPreciseSweeps(flag: boolean): void;

  /**
   * Enables or disables vertical sliding against ceilings.
   * @param flag True/false to enable/disable sliding.
   */
  setPreventVerticalSlidingAgainstCeiling(flag: boolean): void;

  /**
   * Shift the origin of the character controllers and obstacle objects by the specified vector.
   * @param shift Translation vector to shift the origin by.
   */
  shiftOrigin(shift: Vector3): void;
}
