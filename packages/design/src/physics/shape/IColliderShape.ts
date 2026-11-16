import { Quaternion, Vector3, Vector4 } from "@galacean/engine-math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/**
 * Interface for physics collider shape.
 */
export interface IColliderShape {
  /**
   * Set the pose of the shape relative to its actor.
   * @param position - The relative position, already scaled
   * @param rotation - The relative rotation
   */
  setLocalPose(position: Vector3, rotation: Quaternion): void;

  /**
   * Set the world scale applied to the shape geometry.
   * @param scale - The scale
   */
  setWorldScale(scale: Vector3): void;

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
   * Set the collision layer of this shape without detaching it, so active contact and trigger pairs persist.
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
   * Get the distance between a point and the shape.
   * @param point - Location in world space you want to find the closest point to
   * @returns The x, y, and z components of the Vector4 represent the closest point on the shape in world space,
   * and the w component represents the distance between the point and the shape
   */
  pointDistance(point: Vector3): Vector4;
  /**
   * Decrements the reference count of a shape and releases it if the new reference count is zero.
   */
  destroy(): void;
}
