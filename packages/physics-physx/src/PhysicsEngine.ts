// @ts-ignore
import { IPhysicsEngine, IBoxCollider, IPhysicsMaterial } from "@oasis-engine/design";
import { BoxCollider } from "./BoxCollider";
import { PhysicsMaterial } from "./PhysicsMaterial";

export class PhysicsEngine implements IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial {
    return new PhysicsMaterial(staticFriction, dynamicFriction, bounciness);
  }

  createBoxCollider(): IBoxCollider {
    return new BoxCollider();
  }
}
