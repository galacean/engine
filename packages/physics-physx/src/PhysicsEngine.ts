import {
  IPhysicsEngine,
  IBoxCollider,
  IPhysicsMaterial,
  ISphereCollider,
  ICapsuleCollider,
  IPlaneCollider,
  IPhysicsScene
} from "@oasis-engine/design";
import { BoxCollider } from "./BoxCollider";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { SphereCollider } from "./SphereCollider";
import { CapsuleCollider } from "./CapsuleCollider";
import { PlaneCollider } from "./PlaneCollider";
import { PhysicsScene } from "./PhysicsScene";

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

  createPhysicsScene(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function
  ): IPhysicsScene {
    return new PhysicsScene(onContactBegin, onContactEnd, onContactPersist, onTriggerBegin, onTriggerEnd);
  }
}
