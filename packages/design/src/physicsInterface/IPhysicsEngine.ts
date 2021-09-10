import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IPlaneCollider } from "./IPlaneCollider";
import { IPhysicsManager } from "./IPhysicsManager";
import { IBoxColliderShape } from "./IBoxColliderShape";
import { ISphereColliderShape } from "./ISphereColliderShape";
import { ICapsuleColliderShape } from "./ICapsuleColliderShape";
import { IDynamicCollider } from "./IDynamicCollider";
import { IStaticCollider } from "./IStaticCollider";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial;

  createBoxColliderShape(): IBoxColliderShape;

  createSphereColliderShape(): ISphereColliderShape;

  createCapsuleColliderShape(): ICapsuleColliderShape;

  createPlaneCollider(): IPlaneCollider;

  createDynamicCollider(): IDynamicCollider;

  createStaticCollider(): IStaticCollider;

  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager;
}
