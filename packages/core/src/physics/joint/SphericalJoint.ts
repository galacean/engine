import { Joint } from "./Joint";
import { ISphericalJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Vector3, Quaternion } from "@oasis-engine/math";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export class SphericalJoint extends Joint {
  private _enableLimit: boolean = false;
  private _projectionLinearTolerance: number = 0;

  /**
   * is limit enable
   */
  get enableLimit(): boolean {
    return this._enableLimit;
  }

  set enableLimit(newValue: boolean) {
    this._enableLimit = newValue;
    (<ISphericalJoint>this._nativeJoint).setSphericalJointFlag(1 << 1, newValue);
  }

  /**
   * the linear tolerance threshold
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
    this._nativeJoint = PhysicsManager._nativePhysics.createSphericalJoint(
      collider0?._nativeCollider,
      new Vector3(),
      new Quaternion(),
      collider1?._nativeCollider,
      new Vector3(),
      new Quaternion()
    );
    (<ISphericalJoint>this._nativeJoint).setSphericalJointFlag(1 << 1, false);
  }

  /**
   * Set a cone hard limit.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param contactDist The distance from the limit at which it becomes active. Default is the lesser of 0.1 radians, and 0.49 * the lower of the limit angles
   */
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number): void {
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
