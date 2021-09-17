import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/**
 * Interface for physical shape
 */
export interface IColliderShape {
  /** local position */
  setPosition(position: Vector3): void;

  /** scale of shape */
  setWorldScale(scale: Vector3): void;

  /** physics material on shape */
  setMaterial(material: IPhysicsMaterial): void;

  /** physics shape marker */
  setID(id: number): void;

  /** Set Trigger or not */
  setIsTrigger(value: boolean);

  /** Set Scene Query or not */
  setIsSceneQuery(value: boolean);
}
