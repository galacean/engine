import {
  IPhysics,
  IPhysicsMaterial,
  IPlaneCollider,
  IPhysicsManager,
  IBoxColliderShape,
  ISphereColliderShape,
  ICapsuleColliderShape,
  IDynamicCollider,
  IStaticCollider,
  StaticInterfaceImplement
} from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { PlaneCollider } from "./PlaneCollider";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";
import { PhysXManager } from "./PhysXManager";
import { BoxColliderShape } from "./shape/BoxColliderShape";
import { SphereColliderShape } from "./shape/SphereColliderShape";
import { CapsuleColliderShape } from "./shape/CapsuleColliderShape";
import { DynamicCollider } from "./DynamicCollider";
import { StaticCollider } from "./StaticCollider";

// @StaticInterfaceImplement<IPhysics>()
export class PhysXPhysics implements IPhysics {
  static init(): Promise<void> {
    return new Promise((resolve) => {
      PhysXManager.init().then(() => {
        resolve();
      });
    });
  }

  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager {
    return new PhysXPhysicsManager(
      onContactBegin,
      onContactEnd,
      onContactPersist,
      onTriggerBegin,
      onTriggerEnd,
      onTriggerPersist
    );
  }

  createStaticCollider(): IStaticCollider {
    return new StaticCollider();
  }

  createDynamicCollider(): IDynamicCollider {
    return new DynamicCollider();
  }

  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial {
    return new PhysicsMaterial(staticFriction, dynamicFriction, bounciness);
  }

  createBoxColliderShape(): IBoxColliderShape {
    return new BoxColliderShape();
  }

  createSphereColliderShape(): ISphereColliderShape {
    return new SphereColliderShape();
  }

  createCapsuleColliderShape(): ICapsuleColliderShape {
    return new CapsuleColliderShape();
  }

  createPlaneCollider(): IPlaneCollider {
    return new PlaneCollider();
  }
}
