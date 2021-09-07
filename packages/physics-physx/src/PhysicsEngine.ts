// @ts-ignore
import { IPhysicsEngine, IBoxCollider } from "@oasis-engine/design";
import { BoxCollider } from "./BoxCollider";

export class PhysicsEngine implements IPhysicsEngine {
  createBoxCollider(): IBoxCollider {
    return new BoxCollider();
  }
}
