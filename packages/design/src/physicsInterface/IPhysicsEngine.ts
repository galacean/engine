import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IPlaneCollider } from "./IPlaneCollider";
import { IPhysicsManager } from "./IPhysicsManager";
import { IPhysicsBox } from "./IPhysicsBox";
import { IPhysicsSphere } from "./IPhysicsSphere";
import { IPhysicsCapsule } from "./IPhysicsCapsule";
import { IDynamicCollider } from "./IDynamicCollider";
import { IStaticCollider } from "./IStaticCollider";

/**
 * Physics Engine Interface
 */
export interface IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial;

  createPhysicsBox(): IPhysicsBox;

  createPhysicsSphere(): IPhysicsSphere;

  createPhysicsCapsule(): IPhysicsCapsule;

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
