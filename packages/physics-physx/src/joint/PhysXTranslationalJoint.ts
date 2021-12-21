import { PhysXJoint } from "./PhysXJoint";
import { ITranslationalJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A translational joint permits relative translational movement between two bodies along
 * an axis, but no relative rotational movement.
 */
export class PhysXTranslationalJoint extends PhysXJoint implements ITranslationalJoint {
  constructor(
    actor0: PhysXCollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: PhysXCollider,
    position1: Vector3,
    rotation1: Quaternion
  ) {
    super();
    this._pxJoint = PhysXPhysics._pxPhysics.createPrismaticJoint(
      actor0?._pxActor,
      position0,
      rotation0,
      actor1?._pxActor,
      position1,
      rotation1
    );
  }

  /**
   * {@inheritDoc ITranslationalJoint.setHardLimit }
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    this._pxJoint.setHardLimit(PhysXPhysics._pxPhysics.getTolerancesScale(), lowerLimit, upperLimit, contactDist);
  }

  /**
   * {@inheritDoc ITranslationalJoint.setSoftLimit }
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    this._pxJoint.setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * {@inheritDoc ITranslationalJoint.setPrismaticJointFlag }
   */
  setPrismaticJointFlag(flag: number, value: boolean) {
    this._pxJoint.setPrismaticJointFlag(flag, value);
  }

  /**
   * {@inheritDoc ITranslationalJoint.setProjectionLinearTolerance }
   */
  setProjectionLinearTolerance(tolerance: number) {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }

  /**
   * {@inheritDoc ITranslationalJoint.setProjectionAngularTolerance }
   */
  setProjectionAngularTolerance(tolerance: number) {
    this._pxJoint.setProjectionAngularTolerance(tolerance);
  }
}
