import { PhysXJoint } from "./PhysXJoint";
import { IFixedJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A fixed joint permits no relative movement between two bodies. ie the bodies are glued together.
 */
export class PhysXFixedJoint extends PhysXJoint implements IFixedJoint {
  constructor(
    actor0: PhysXCollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: PhysXCollider,
    position1: Vector3,
    rotation1: Quaternion
  ) {
    super();
    this._pxJoint = PhysXPhysics._pxPhysics.createFixedJoint(
      actor0?._pxActor,
      position0,
      rotation0,
      actor1?._pxActor,
      position1,
      rotation1
    );
  }

  /**
   * {@inheritDoc IFixedJoint.setProjectionLinearTolerance }
   */
  setProjectionLinearTolerance(tolerance: number) {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }

  /**
   * {@inheritDoc IFixedJoint.setProjectionAngularTolerance }
   */
  setProjectionAngularTolerance(tolerance: number) {
    this._pxJoint.setProjectionAngularTolerance(tolerance);
  }
}
