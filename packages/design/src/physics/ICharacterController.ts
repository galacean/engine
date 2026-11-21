import { Vector3 } from "@galacean/engine-math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

/**
 * Interface of a native character controller with inline geometry.
 * @remarks All sizes and offsets are in world units with the entity scale already applied.
 */
export interface ICharacterController {
  /**
   * Use a capsule along the up direction.
   * @param radius - The capsule radius
   * @param height - The height of the cylindrical part, excluding both caps
   */
  setCapsule(radius: number, height: number): void;

  /**
   * Use an axis-aligned box.
   * @param halfExtents - Half the size of the box in each dimension
   */
  setBox(halfExtents: Vector3): void;

  /**
   * Set the contact offset.
   * @param offset - A positive contact offset
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
   * Enables the controller for raycasts, shape casts, and overlap queries.
   * @param value - Whether the controller participates in scene queries
   */
  setIsSceneQuery(value: boolean): void;

  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp - Displacement vector
   * @param minDist - The minimum travelled distance to consider
   * @param elapsedTime - Time elapsed since last call
   * @returns The collision flags
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number;

  /**
   * Set the controller's world position and its geometry offset in one update.
   * @param position - The world position before applying the offset
   * @param center - The world-space geometry offset
   */
  setWorldPosition(position: Vector3, center: Vector3): void;

  /**
   * Get the controller's world position, excluding the center offset.
   * @param position - The world position
   */
  getWorldPosition(position: Vector3): void;

  /**
   * Set the step height.
   * @param offset - The step offset
   */
  setStepOffset(offset: number): void;

  /**
   * Set the non-walkable mode.
   * @param flag - The non-walkable mode
   */
  setNonWalkableMode(flag: number): void;

  /**
   * Set the up direction.
   * @param up - The up direction
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
