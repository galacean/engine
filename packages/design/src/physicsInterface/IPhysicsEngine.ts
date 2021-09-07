import { IBoxCollider } from "./IBoxCollider";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial;

  createBoxCollider(): IBoxCollider;
}
