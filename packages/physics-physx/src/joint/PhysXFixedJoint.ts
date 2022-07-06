import { PhysXJoint } from "./PhysXJoint";
import { IFixedJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";
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
  }

  /**
   * {@inheritDoc IFixedJoint.setOffset }
   */
  setOffset(value: Vector3): void {
    this._setLocalPose(0, value, PhysXFixedJoint._tempQuat);
  }
}
