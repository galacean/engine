import { Quaternion, Vector3, Vector4 } from "@galacean/engine-math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/**
 * Interface for physics collider shape.
 */
export interface IColliderShape {
  /**
   * Set local rotation.
   * @param rotation - The local rotation
   */
  setRotation(rotation: Vector3): void;

  /**
   * Set local position.
   * @param position - The local position
   */
  setPosition(position: Vector3): void;

  /**
   * Set world scale of shape.
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
   * Set trigger or not.
   * @param value - True for TriggerShape, false for SimulationShape
   */
  setIsTrigger(value: boolean): void;

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
