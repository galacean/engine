import {
  IPhysicsEngine,
  IBoxCollider,
  IPhysicsMaterial,
  ISphereCollider,
  ICapsuleCollider,
  IPlaneCollider,
  IPhysicsManager,
  IRigidbody
} from "@oasis-engine/design";
import { BoxCollider } from "./BoxCollider";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { SphereCollider } from "./SphereCollider";
import { CapsuleCollider } from "./CapsuleCollider";
import { PlaneCollider } from "./PlaneCollider";
import { PhysicsManager } from "./PhysicsManager";
import { PhysXManager } from "./PhysXManager";
import { Rigidbody } from "./Rigidbody";

export class PhysicsEngine implements IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial {
    return new PhysicsMaterial(staticFriction, dynamicFriction, bounciness);
  }

  createBoxCollider(): IBoxCollider {
    return new BoxCollider();
  }

  createSphereCollider(): ISphereCollider {
    return new SphereCollider();
  }

  createCapsuleCollider(): ICapsuleCollider {
    return new CapsuleCollider();
  }

  createPlaneCollider(): IPlaneCollider {
    return new PlaneCollider();
  }

  createRigidbody(): IRigidbody {
    return new Rigidbody();
  }

  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager {
    return new PhysicsManager(onContactBegin, onContactEnd, onContactPersist, onTriggerBegin, onTriggerEnd, onTriggerPersist);
  }

  static init(): Promise<void> {
    return new Promise((resolve) => {
      PhysXManager.init().then(() => {
        resolve();
      });
    });
  }
}
