import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IPlaneCollider } from "./IPlaneCollider";
import { IPhysicsManager } from "./IPhysicsManager";
import { IBoxColliderShape, ISphereColliderShape, ICapsuleColliderShape } from "./shape";
import { IDynamicCollider } from "./IDynamicCollider";
import { IStaticCollider } from "./IStaticCollider";

/**
 * PhysXPhysics Engine Interface
 */
export interface IPhysics {
  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager;

  createDynamicCollider(): IDynamicCollider;

  createStaticCollider(): IStaticCollider;

  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial;

  createBoxColliderShape(): IBoxColliderShape;

  createSphereColliderShape(): ISphereColliderShape;

  createCapsuleColliderShape(): ICapsuleColliderShape;

  createPlaneCollider(): IPlaneCollider;
}
