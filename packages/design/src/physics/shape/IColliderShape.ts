import { Quaternion, Vector3, Vector4 } from "@galacean/engine-math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/**
 * Interface for physics collider shape.
 * @remarks Set a new shape's local pose before attaching it. New shapes participate in simulation and scene queries by default.
 */
export interface IColliderShape {
  /**
   * Set the pose of the shape relative to its actor.
   * @param position - The relative position, already scaled
   * @param rotation - The relative rotation
   */
  setLocalPose(position: Vector3, rotation: Quaternion): void;

  /**
   * Sets the contact offset.
   * @param offset - contact offset
   */
  setContactOffset(offset: number): void;

  /**
   * Set physics material on shape.
   * @param material - The physics material
   */
  setMaterial(material: IPhysicsMaterial): void;

  /**
   * Change the collision layer in place, preserving active pairs still allowed by the collision matrix.
   * @param layer - The collision layer index, from 0 to 31
   */
  setCollisionLayer(layer: number): void;

  /**
   * Set trigger or not.
   * @param value - True for TriggerShape, false for SimulationShape
   */
  setIsTrigger(value: boolean): void;

  /**
   * Enables this shape for raycasts, shape casts, and overlap queries without changing collision response.
   * @param value - Whether the shape participates in scene queries
   */
  setIsSceneQuery(value: boolean): void;

  /**
   * Query the closest point on the shape.
   * @param point - The point in world space
   * @returns A vector whose `w` is the squared distance, or -1 when unavailable.
   * For a positive distance, `x`, `y`, and `z` give the closest point in world space.
   */
  pointDistance(point: Vector3): Vector4;
  /**
   * Decrements the reference count of a shape and releases it if the new reference count is zero.
   */
  destroy(): void;
}
