import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";
import { ISpringJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";

export class PhysXSpringJoint extends PhysXJoint implements ISpringJoint {
  constructor(
    actor0: PhysXCollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: PhysXCollider,
    position1: Vector3,
    rotation1: Quaternion
  ) {
    super();
    this._pxJoint = PhysXPhysics._pxPhysics.createDistanceJoint(
      actor0?._pxActor,
      position0,
      rotation0,
      actor1?._pxActor,
      position1,
      rotation1
    );
  }

  setMinDistance(distance: number) {
    this._pxJoint.setMinDistance(distance);
  }

  setMaxDistance(distance: number) {
    this._pxJoint.setMaxDistance(distance);
  }

  setTolerance(tolerance: number) {
    this._pxJoint.setTolerance(tolerance);
  }

  setStiffness(stiffness: number) {
    this._pxJoint.setStiffness(stiffness);
  }

  setDamping(damping: number) {
    this._pxJoint.setDamping(damping);
  }

  setDistanceJointFlag(flag: number, value: boolean) {
    // this._pxJoint.setDistanceJointFlag(CPxDistanceJointFlag(UInt32(flag)), value)
  }
}
