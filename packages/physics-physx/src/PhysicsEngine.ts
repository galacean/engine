import {
  IPhysicsEngine,
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
import { PhysicsManager } from "./PhysicsManager";
import { PhysXManager } from "./PhysXManager";
import { BoxColliderShape } from "./BoxColliderShape";
import { SphereColliderShape } from "./SphereColliderShape";
import { CapsuleColliderShape } from "./CapsuleColliderShape";
import { DynamicCollider } from "./DynamicCollider";
import { StaticCollider } from "./StaticCollider";

export class PhysicsEngine implements IPhysicsEngine {
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

  createDynamicCollider(): IDynamicCollider {
    return new DynamicCollider();
  }

  createStaticCollider(): IStaticCollider {
    return new StaticCollider();
  }

  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager {
    return new PhysicsManager(
      onContactBegin,
      onContactEnd,
      onContactPersist,
      onTriggerBegin,
      onTriggerEnd,
      onTriggerPersist
    );
  }

  static init(): Promise<void> {
    return new Promise((resolve) => {
      PhysXManager.init().then(() => {
        resolve();
      });
    });
  }
}
