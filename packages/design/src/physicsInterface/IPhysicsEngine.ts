// @ts-ignore
import { IBoxCollider } from "./IBoxCollider";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createBoxCollider(): IBoxCollider;
}
