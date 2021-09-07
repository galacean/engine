import {
  IPhysicsEngine,
  IBoxCollider,
  IPhysicsMaterial,
  ISphereCollider,
  ICapsuleCollider,
  IPlaneCollider
} from "@oasis-engine/design";
import { BoxCollider } from "./BoxCollider";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { SphereCollider } from "./SphereCollider";
import { CapsuleCollider } from "./CapsuleCollider";
import { PlaneCollider } from "./PlaneCollider";

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
}
