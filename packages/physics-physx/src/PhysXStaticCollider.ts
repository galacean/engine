import { IStaticCollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXPhysics } from "./PhysXPhysics";

/**
 * A static collider component that will not move.
 * @remarks Mostly used for object which always stays at the same place and never moves around.
 */
export class PhysXStaticCollider extends PhysXCollider implements IStaticCollider {
  constructor(physXPhysics: PhysXPhysics, position: Vector3, rotation: Quaternion) {
    super(physXPhysics);
    this._pxActor = physXPhysics._pxPhysics.createRigidStatic(this._transform(position, rotation));
  }
}
