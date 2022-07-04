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
    this._pxJoint.setDistanceJointFlag(1, true); // enable max distance;
    this._pxJoint.setDistanceJointFlag(2, true); // enable min distance;
    this._pxJoint.setDistanceJointFlag(4, true); // enable spring;
  }

  /**
   * {@inheritDoc ISpringJoint.setMinDistance }
   */
  setMinDistance(distance: number): void {
    this._pxJoint.setMinDistance(distance);
  }

  /**
   * {@inheritDoc ISpringJoint.setMaxDistance }
   */
  setMaxDistance(distance: number): void {
    this._pxJoint.setMaxDistance(distance);
  }

  /**
   * {@inheritDoc ISpringJoint.setTolerance }
   */
  setTolerance(tolerance: number): void {
    this._pxJoint.setTolerance(tolerance);
  }

  /**
   * {@inheritDoc ISpringJoint.setStiffness }
   */
  setStiffness(stiffness: number): void {
    this._pxJoint.setStiffness(stiffness);
  }

  /**
   * {@inheritDoc ISpringJoint.setDamping }
   */
  setDamping(damping: number): void {
    this._pxJoint.setDamping(damping);
  }
}
