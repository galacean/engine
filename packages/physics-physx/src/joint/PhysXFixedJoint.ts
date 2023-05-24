import { IFixedJoint } from "@galacean/engine-design";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";

/**
 * A fixed joint permits no relative movement between two colliders. ie the bodies are glued together.
 */
export class PhysXFixedJoint extends PhysXJoint implements IFixedJoint {
  constructor(physXPhysics: PhysXPhysics, collider: PhysXCollider) {
    super(physXPhysics);
    this._collider = collider;
    this._pxJoint = physXPhysics._pxPhysics.createFixedJoint(
      null,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      collider._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
  }
}
