import { Joint } from "./Joint";
import { ISphericalJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export class SphericalJoint extends Joint {
  private _enableLimit: boolean = false;
  private _projectionLinearTolerance: number = 0;

  /**
   * Is limit enable.
   */
  get enableLimit(): boolean {
    return this._enableLimit;
  }

  set enableLimit(newValue: boolean) {
    this._enableLimit = newValue;
    (<ISphericalJoint>this._nativeJoint).setSphericalJointFlag(1 << 1, newValue);
  }

  /**
   * The linear tolerance threshold.
   */
  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<ISphericalJoint>this._nativeJoint).setProjectionLinearTolerance(this._projectionLinearTolerance);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    const jointActor0 = this._jointActor0;
    const jointActor1 = this._jointActor1;
    jointActor0._collider = collider0;
    jointActor1._collider = collider1;
    this._nativeJoint = PhysicsManager._nativePhysics.createSphericalJoint(
      collider0?._nativeCollider,
      jointActor0._localPosition,
      jointActor0._localRotation,
      collider1?._nativeCollider,
      jointActor1._localPosition,
      jointActor1._localRotation
    );
    (<ISphericalJoint>this._nativeJoint).setSphericalJointFlag(1 << 1, false);
  }

  /**
   * Set a cone hard limit.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number = -1.0): void {
    (<ISphericalJoint>this._nativeJoint).setHardLimitCone(yLimitAngle, zLimitAngle, contactDist);
  }

  /**
   * Set a cone soft limit.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void {
    (<ISphericalJoint>this._nativeJoint).setSoftLimitCone(yLimitAngle, zLimitAngle, stiffness, damping);
  }
}
