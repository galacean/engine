import { IStaticActor } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXActor } from "./PhysXActor";
import { PhysXPhysics } from "./PhysXPhysics";

/**
 * Static PhysX rigid actor for immovable geometry.
 */
export class PhysXStaticActor extends PhysXActor implements IStaticActor {
  constructor(physXPhysics: PhysXPhysics, position: Vector3, rotation: Quaternion) {
    super(physXPhysics);
    this._pxActor = physXPhysics._pxPhysics.createRigidStatic(this._transform(position, rotation));
  }
}
