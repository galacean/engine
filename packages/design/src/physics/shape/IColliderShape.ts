import { Quaternion, Vector3 } from "@galacean/engine-math";
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
   * @param position - The position in world space
   * @param rotation - The rotation in world space
   * @param point - The point
   * @returns The distance information
   */
  pointDistance(position: Vector3, rotation: Quaternion, point: Vector3): IPointDistanceInfo;
  /**
   * Decrements the reference count of a shape and releases it if the new reference count is zero.
   */
  destroy(): void;
}

/**
 * Distance information of a point to the shape.
 */
export interface IPointDistanceInfo {
  /**
   * The distance between the point and the shape.
   */
  distance: number;

  /**
   * The closest point on the shape.
   */
  closestPoint: Vector3;
}
