import { Vector3 } from "@galacean/engine-math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

/**
 * Native capsule character controller.
 * @remarks The caller applies entity scale to geometry dimensions and the center offset before passing them in.
 */
export interface ICharacterController {
  /**
   * Use a capsule along the up direction.
   * @param radius - The capsule radius
   * @param height - The height of the cylindrical part, excluding both caps
   * @param stepOffset - The requested step height in world units
   */
  setCapsule(radius: number, height: number, stepOffset: number): void;

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
   * Control whether scene queries can hit the controller.
   * @param value - Whether the controller participates in scene queries
   */
  setIsSceneQuery(value: boolean): void;

  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp - World-space displacement
   * @param minDist - The remaining distance threshold for stopping the move
   * @param elapsedTime - Time in seconds since the last call
   * @returns The collision flags, or zero if the native controller is unavailable
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number;

  /**
   * Place the controller's geometry at the sum of the world position and the center offset.
   * @param position - The world position before applying the offset
   * @param center - The world-space geometry offset
   */
  setWorldPosition(position: Vector3, center: Vector3): void;

  /**
   * Write the world position with the center offset subtracted.
   * @param position - Receives the world position
   */
  getWorldPosition(position: Vector3): void;

  /**
   * Set the non-walkable mode.
   * @param flag - The non-walkable mode
   */
  setNonWalkableMode(flag: number): void;

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
