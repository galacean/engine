import { Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/**
 * Descriptor class for a character controller.
 */
export interface ICharacterControllerDesc {
  /**
   * Returns the character controller type
   */
  getType(): number;

  /**
   * The position of the character
   * @param position The position of the character
   */
  setPosition(position: Vector3): void;

  /**
   * Specifies the 'up' direction
   * @param upDirection The 'up' direction
   */
  setUpDirection(upDirection: Vector3): void;

  /**
   * The maximum slope which the character can walk up.
   * @param slopeLimit The maximum slope which the character can walk up.
   */
  setSlopeLimit(slopeLimit: number): void;

  /**
   * Height of invisible walls created around non-walkable triangles
   * @param invisibleWallHeight Height of invisible walls created around non-walkable triangles
   */
  setInvisibleWallHeight(invisibleWallHeight: number): void;

  /**
   * Maximum height a jumping character can reach
   * @param maxJumpHeight Maximum height a jumping character can reach
   */
  setMaxJumpHeight(maxJumpHeight: number): void;

  /**
   * The contact offset used by the controller.
   * @param contactOffset The contact offset used by the controller.
   */
  setContactOffset(contactOffset: number): void;

  /**
   * Defines the maximum height of an obstacle which the character can climb.
   * @param stepOffset Defines the maximum height of an obstacle which the character can climb.
   */
  setStepOffset(stepOffset: number): void;

  /**
   * Density of underlying kinematic actor
   * @param density Density of underlying kinematic actor
   */
  setDensity(density: number): void;

  /**
   * Scale coefficient for underlying kinematic actor
   * @param scaleCoeff Scale coefficient for underlying kinematic actor
   */
  setScaleCoeff(scaleCoeff: number): void;

  /**
   * Cached volume growth
   * @param volumeGrowth Cached volume growth
   */
  setVolumeGrowth(volumeGrowth: number): void;

  /**
   * The non-walkable mode controls if a character controller slides or not on a non-walkable part.
   * @param nonWalkableMode The non-walkable mode controls if a character controller slides or not on a non-walkable part.
   */
  setNonWalkableMode(nonWalkableMode: number): void;

  /**
   * The material for the actor associated with the controller.
   * @param material The material for the actor associated with the controller.
   */
  setMaterial(material?: IPhysicsMaterial): void;

  /**
   * Use a deletion listener to get informed about released objects and clear internal caches if needed.
   * @param registerDeletionListener Use a deletion listener to get informed about released objects and clear internal caches if needed.
   */
  setRegisterDeletionListener(registerDeletionListener: boolean): void;
}
