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
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      collider._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
  }
}
