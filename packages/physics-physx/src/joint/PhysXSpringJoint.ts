import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";
import { ISpringJoint } from "@galacean/engine-design";
import { PhysXActor } from "../PhysXActor";

/**
 * PhysX distance joint with a spring response.
 */
export class PhysXSpringJoint extends PhysXJoint implements ISpringJoint {
  constructor(physXPhysics: PhysXPhysics, actor: PhysXActor) {
    super(physXPhysics);
    this._actor = actor;
    this._pxJoint = physXPhysics._pxPhysics.createDistanceJoint(
      actor._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      null,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
    this._pxJoint.setDistanceJointFlag(2, true); // eMAX_DISTANCE_ENABLED
    this._pxJoint.setDistanceJointFlag(4, true); // eMIN_DISTANCE_ENABLED
    this._pxJoint.setDistanceJointFlag(8, true); // eSPRING_ENABLED
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
