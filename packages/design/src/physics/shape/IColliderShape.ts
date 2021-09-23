import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/**
 * Interface for physical shape.
 */
export interface IColliderShape {
  /**
   * Set local position.
   * @param position - The local position
   */
  setPosition(position: Vector3): void;

  /**
   * Set scale of shape.
   * @param scale - The scale
   */
  setWorldScale(scale: Vector3): void;

  /**
   * Set physics material on shape.
   * @param material - The physics material
   */
  setMaterial(material: IPhysicsMaterial): void;

  /**
   * Set physics shape marker.
   * @param id - The unique index
   */
  setID(id: number): void;

  /**
   * Set Trigger or not.
   * @param value - True for TriggerShape, false for SimulationShape
   */
  setIsTrigger(value: boolean);

  /**
   * Set Scene Query or not.
   * @param value - True for Query, false for not Query
   */
  setIsSceneQuery(value: boolean);
}
