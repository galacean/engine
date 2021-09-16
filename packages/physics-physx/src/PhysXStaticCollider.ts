import { PhysXPhysics } from "./PhysXPhysics";
import { IStaticCollider } from "@oasis-engine/design";
import { PhysXCollider } from "./PhysXCollider";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * A static collider component that will not move.
 * @remarks Mostly used for object which always stays at the same place and never moves around.
 */
export class PhysXStaticCollider extends PhysXCollider implements IStaticCollider {
  /** alloc PhysX object */
  constructor(position: Vector3, rotation: Quaternion) {
    super();
    const transform = this._transform(position, rotation);
    this._pxActor = PhysXPhysics.physics.createRigidStatic(transform);
  }
}
