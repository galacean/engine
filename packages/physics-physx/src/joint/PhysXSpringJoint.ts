import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";
import { ISpringJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";

/**
 * a joint that maintains an upper or lower bound (or both) on the distance between two points on different objects
 */
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

  /**
   * {@inheritDoc ISpringJoint.setMinDistance }
   */
  setMinDistance(distance: number) {
    this._pxJoint.setMinDistance(distance);
  }

  /**
   * {@inheritDoc ISpringJoint.setMaxDistance }
   */
  setMaxDistance(distance: number) {
    this._pxJoint.setMaxDistance(distance);
  }

  /**
   * {@inheritDoc ISpringJoint.setTolerance }
   */
  setTolerance(tolerance: number) {
    this._pxJoint.setTolerance(tolerance);
  }

  /**
   * {@inheritDoc ISpringJoint.setStiffness }
   */
  setStiffness(stiffness: number) {
    this._pxJoint.setStiffness(stiffness);
  }

  /**
   * {@inheritDoc ISpringJoint.setDamping }
   */
  setDamping(damping: number) {
    this._pxJoint.setDamping(damping);
  }

  /**
   * {@inheritDoc ISpringJoint.setDistanceJointFlag }
   */
  setDistanceJointFlag(flag: number, value: boolean) {
    this._pxJoint.setDistanceJointFlag(flag, value);
  }
}
