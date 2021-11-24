import { Joint } from "./Joint";
import { ITranslationalJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Vector3, Quaternion } from "@oasis-engine/math";

/**
 * A translational joint permits relative translational movement between two bodies along
 * an axis, but no relative rotational movement.
 */
export class TranslationalJoint extends Joint {
  private _enableLimit: boolean = false;
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  /**
   * is limit enable
   */
  get enableLimit(): boolean {
    return this._enableLimit;
  }

  set enableLimit(newValue) {
    this._enableLimit = newValue;
    (<ITranslationalJoint>this._nativeJoint).setPrismaticJointFlag(1 << 1, newValue);
  }

  /**
   * the linear tolerance threshold
   */
  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<ITranslationalJoint>this._nativeJoint).setProjectionLinearTolerance(newValue);
  }

  /**
   * the linear tolerance threshold
   */
  get projectionAngularTolerance(): number {
    return this._projectionAngularTolerance;
  }

  set projectionAngularTolerance(newValue: number) {
    this._projectionAngularTolerance = newValue;
    (<ITranslationalJoint>this._nativeJoint).setProjectionAngularTolerance(newValue);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    this._nativeJoint = PhysicsManager._nativePhysics.createTranslationalJoint(
      collider0?._nativeCollider,
      new Vector3(),
      new Quaternion(),
      collider1?._nativeCollider,
      new Vector3(),
      new Quaternion()
    );
  }

  /**
   * Set a cone hard limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param contactDist The distance from the limit at which it becomes active. Default is the lesser of 0.1 radians, and 0.49 * the lower of the limit angles
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    (<ITranslationalJoint>this._nativeJoint).setHardLimit(lowerLimit, upperLimit, contactDist);
  }

  /**
   * Set a cone soft limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    (<ITranslationalJoint>this._nativeJoint).setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }
}
