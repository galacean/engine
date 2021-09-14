import { PhysXManager } from "./PhysXManager";
import { IStaticCollider } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * A static collider component that will not move.
 * @remarks Mostly used for object which always stays at the same place and never moves around.
 */
export class StaticCollider extends Collider implements IStaticCollider {
  /** alloc PhysX object */
  constructor(position: Vector3, rotation: Quaternion) {
    super();
    const transform = this._transform(position, rotation);
    this._pxActor = PhysXManager.physics.createRigidStatic(transform);
  }
}
