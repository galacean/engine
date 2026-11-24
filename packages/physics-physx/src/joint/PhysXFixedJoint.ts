import { IFixedJoint } from "@galacean/engine-design";
import { PhysXActor } from "../PhysXActor";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";

/**
 * A fixed joint permits no relative movement between two actors. ie the bodies are glued together.
 */
export class PhysXFixedJoint extends PhysXJoint implements IFixedJoint {
  constructor(physXPhysics: PhysXPhysics, actor: PhysXActor) {
    super();
    this._actor = actor;
    this._pxJoint = physXPhysics._pxPhysics.createFixedJoint(
      actor._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      null,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
  }
}
