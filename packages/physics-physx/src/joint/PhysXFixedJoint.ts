import { PhysXJoint } from "./PhysXJoint";
import { IFixedJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A fixed joint permits no relative movement between two colliders. ie the bodies are glued together.
 */
export class PhysXFixedJoint extends PhysXJoint implements IFixedJoint {
  constructor(collider: PhysXCollider) {
    super();
    this._collider = collider;
    this._pxJoint = PhysXPhysics._pxPhysics.createFixedJoint(
      null,
      PhysXJoint._tempVector,
      PhysXJoint._tempQuat,
      collider._pxActor,
      PhysXJoint._tempVector,
      PhysXJoint._tempQuat
    );
    const tempVector = PhysXFixedJoint._tempVector;
    tempVector.set(0, 0, 0);
    this._setLocalPose(1, tempVector, PhysXFixedJoint._tempQuat);
    tempVector.set(1, 0, 0);
  }
}
