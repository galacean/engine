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
    const tempVector = PhysXFixedJoint._tempVector;
    const tempQuat = PhysXFixedJoint._tempQuat;
    tempVector.set(0, 0, 0);
    this._pxJoint = PhysXPhysics._pxPhysics.createFixedJoint(
      null,
      tempVector,
      tempQuat,
      collider._pxActor,
      tempVector,
      tempQuat
    );
    tempVector.set(1, 0, 0);
  }
}
