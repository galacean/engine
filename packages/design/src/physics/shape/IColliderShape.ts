import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/**
 * Interface for physics collider shape.
 */
export interface IColliderShape {
  /**
   * Set unique id of the collider shape.
   * @param id - The unique index
   */
  setUniqueID(id: number): void;

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
   * Set scene query or not.
   * @param value - True for Query, false for not Query
   */
  setIsSceneQuery(value: boolean): void;

  /**
   * Decrements the reference count of a shape and releases it if the new reference count is zero.
   */
  destroy(): void;
}
