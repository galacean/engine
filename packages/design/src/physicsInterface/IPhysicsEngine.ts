import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IBoxCollider } from "./IBoxCollider";
import { ISphereCollider } from "./ISphereCollider";
import { ICapsuleCollider } from "./ICapsuleCollider";
import { IPlaneCollider } from "./IPlaneCollider";
import { IPhysicsScene } from "./IPhysicsScene";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial;

  createBoxCollider(): IBoxCollider;

  createSphereCollider(): ISphereCollider;

  createCapsuleCollider(): ICapsuleCollider;

  createPlaneCollider(): IPlaneCollider;

  createPhysicsScene(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function
  ): IPhysicsScene;
}
