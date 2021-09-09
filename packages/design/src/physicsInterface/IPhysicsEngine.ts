import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IBoxCollider } from "./IBoxCollider";
import { ISphereCollider } from "./ISphereCollider";
import { ICapsuleCollider } from "./ICapsuleCollider";
import { IPlaneCollider } from "./IPlaneCollider";
import { IRigidbody } from "./IRigidbody";
import { IPhysicsManager } from "./IPhysicsManager";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial;

  createBoxCollider(): IBoxCollider;

  createSphereCollider(): ISphereCollider;

  createCapsuleCollider(): ICapsuleCollider;

  createPlaneCollider(): IPlaneCollider;

  createRigidbody(): IRigidbody;

  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager;
}
