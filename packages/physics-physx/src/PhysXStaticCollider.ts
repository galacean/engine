import { PhysXPhysics } from "./PhysXPhysics";
import { IStaticCollider } from "@oasis-engine/design";
import { PhysXCollider } from "./PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";

/**
 * A static collider component that will not move.
 * @remarks Mostly used for object which always stays at the same place and never moves around.
 */
export class PhysXStaticCollider extends PhysXCollider implements IStaticCollider {
  /**
   * Initialize PhysX static actor.
   * @param position - The global position
   * @param rotation - The global rotation
   */
  constructor(position: Vector3, rotation: Quaternion) {
    super();
    this._pxActor = PhysXPhysics._pxPhysics.createRigidStatic(this._transform(position, rotation));
  }
}
