import {
  IPhysics,
  IPhysicsMaterial,
  IPlaneCollider,
  IPhysicsManager,
  IBoxColliderShape,
  ISphereColliderShape,
  ICapsuleColliderShape,
  IDynamicCollider,
  IStaticCollider
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
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IPhysics>()
export class PhysXPhysics {
  static init(): Promise<void> {
    return new Promise((resolve) => {
      PhysXManager.init().then(() => {
        resolve();
      });
    });
  }

  static createPhysicsManager(
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

  static createStaticCollider(): IStaticCollider {
    return new StaticCollider();
  }

  static createDynamicCollider(): IDynamicCollider {
    return new DynamicCollider();
  }

  static createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial {
    return new PhysicsMaterial(staticFriction, dynamicFriction, bounciness);
  }

  static createBoxColliderShape(): IBoxColliderShape {
    return new BoxColliderShape();
  }

  static createSphereColliderShape(): ISphereColliderShape {
    return new SphereColliderShape();
  }

  static createCapsuleColliderShape(): ICapsuleColliderShape {
    return new CapsuleColliderShape();
  }

  static createPlaneCollider(): IPlaneCollider {
    return new PlaneCollider();
  }
}
