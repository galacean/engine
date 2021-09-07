// @ts-ignore
import { IBoxCollider } from "./IBoxCollider";
import { Vector3 } from "@oasis-engine/math";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createBoxCollider(size: Vector3): IBoxCollider;
}
