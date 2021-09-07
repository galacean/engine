import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IBoxCollider } from "./IBoxCollider";
import { ISphereCollider } from "./ISphereCollider";
import { ICapsuleCollider } from "./ICapsuleCollider";
import { IPlaneCollider } from "./IPlaneCollider";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial;

  createBoxCollider(): IBoxCollider;

  createSphereCollider(): ISphereCollider;

  createCapsuleCollider(): ICapsuleCollider;

  createPlaneCollider(): IPlaneCollider;
}
