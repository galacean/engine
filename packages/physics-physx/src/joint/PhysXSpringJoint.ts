import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";
import { ISpringJoint } from "@galacean/engine-design";
import { PhysXCollider } from "../PhysXCollider";
import { Vector3 } from "@galacean/engine";

/**
 * a joint that maintains an upper or lower bound (or both) on the distance between two points on different objects
 */
export class PhysXSpringJoint extends PhysXJoint implements ISpringJoint {
  constructor(physXPhysics: PhysXPhysics, collider: PhysXCollider) {
    super(physXPhysics);
    this._collider = collider;
    this._pxJoint = physXPhysics._pxPhysics.createDistanceJoint(
      null,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      collider._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
    this._pxJoint.setDistanceJointFlag(2, true); // enable max distance;
    this._pxJoint.setDistanceJointFlag(4, true); // enable min distance;
    this._pxJoint.setDistanceJointFlag(8, true); // enable spring;
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
