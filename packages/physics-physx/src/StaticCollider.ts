import { PhysXManager } from "./PhysXManager";
import { IStaticCollider } from "@oasis-engine/design";
import { Collider } from "./Collider";

export class StaticCollider extends Collider implements IStaticCollider {
  /** alloc RigidActor */
  allocActor() {
    this._pxActor = PhysXManager.physics.createRigidStatic(this._transform);
  }
}
