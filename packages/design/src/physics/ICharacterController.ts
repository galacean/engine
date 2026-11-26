import { Vector3 } from "@galacean/engine-math";
import { ControllerCollisionFlag, ControllerNonWalkableMode } from "./enums/index";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

/**
 * Native capsule character controller attached to a scene.
 * @remarks The caller applies entity scale to geometry dimensions before passing them in.
 */
export interface ICharacterController {
  /**
   * Use a capsule along the up direction.
   * @param radius - Strictly positive capsule radius
   * @param halfHeight - Non-negative half cylindrical height, excluding both caps (0 degenerates to a sphere)
   * @param stepOffset - The step height in world units, at most the capsule's total height
   */
  setCapsule(radius: number, halfHeight: number, stepOffset: number): void;

  /**
   * Set the contact offset.
   * @param offset - A positive contact offset in world units
   */
  setContactOffset(offset: number): void;

  /**
   * Set the physics material.
   * @param material - The physics material
   */
  setMaterial(material: IPhysicsMaterial): void;

  /**
   * Set the collision layer.
   * @param layer - The collision layer index, from 0 to 31
   */
  setCollisionLayer(layer: number): void;

  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp - World-space displacement
   * @param minDist - The remaining distance threshold for stopping the move
   * @param elapsedTime - Time in seconds since the last call
   * @returns A bit mask of {@link ControllerCollisionFlag} values, or {@link ControllerCollisionFlag.None} if clear
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): ControllerCollisionFlag;

  /**
   * Place the capsule center at a world-space position.
   * @param position - The capsule center
   */
  setPosition(position: Vector3): void;

  /**
   * Write the world-space capsule center.
   * @param position - Receives the capsule center
   */
  getPosition(position: Vector3): void;

  /**
   * Set the non-walkable mode.
   * @param flag - The non-walkable mode
   */
  setNonWalkableMode(flag: ControllerNonWalkableMode): void;

  /**
   * Set the up direction.
   * @param up - The normalized up direction
   */
  setUpDirection(up: Vector3): void;

  /**
   * Set the slope limit.
   * @param slopeLimit - The slope limit in degrees
   */
  setSlopeLimit(slopeLimit: number): void;

  /**
   * Release the controller.
   */
  destroy(): void;
}

/** Initial settings for a scene-owned capsule character controller. */
export interface CharacterControllerOptions {
  readonly uniqueID: number;
  readonly material: IPhysicsMaterial;
  /** World-space center of the capsule. */
  readonly position: Vector3;
  readonly radius: number;
  /** Half the cylindrical height in world units, excluding both caps. */
  readonly halfHeight: number;
  readonly stepOffset: number;
  readonly contactOffset: number;
  readonly collisionLayer: number;
  readonly nonWalkableMode: ControllerNonWalkableMode;
  readonly upDirection: Vector3;
  readonly slopeLimit: number;
}
