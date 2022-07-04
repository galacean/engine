import { Joint } from "./Joint";
import { IHingeJoint } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";
import { HingeJointFlag } from "../enums";
import { DynamicCollider } from "../DynamicCollider";
import { dependentComponents } from "../../ComponentsDependencies";
import { Vector3 } from "@oasis-engine/math";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 * @decorator `@dependentComponents(DynamicCollider)`
 */
@dependentComponents(DynamicCollider)
export class HingeJoint extends Joint {
  private _driveVelocity: number = 0;
  private _driveForceLimit: number = 0;
  private _driveGearRatio: number = 0;
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  /**
   * The drive target velocity.
   */
  get driveVelocity(): number {
    return this._driveVelocity;
  }

  set driveVelocity(value: number) {
    this._driveVelocity = value;
    (<IHingeJoint>this._nativeJoint).setDriveVelocity(value);
  }

  /**
   * The maximum torque.
   */
  get driveForceLimit(): number {
    return this._driveForceLimit;
  }

  set driveForceLimit(value: number) {
    this._driveForceLimit = value;
    (<IHingeJoint>this._nativeJoint).setDriveForceLimit(value);
  }

  /**
   * The gear ratio.
   */
  get driveGearRatio(): number {
    return this._driveGearRatio;
  }

  set driveGearRatio(value: number) {
    this._driveGearRatio = value;
    (<IHingeJoint>this._nativeJoint).setDriveGearRatio(value);
  }

  /**
   * The linear tolerance threshold.
   */
  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(value: number) {
    this._projectionLinearTolerance = value;
    (<IHingeJoint>this._nativeJoint).setProjectionLinearTolerance(value);
  }

  /**
   * The angular tolerance threshold in radians.
   */
  get projectionAngularTolerance(): number {
    return this._projectionAngularTolerance;
  }

  set projectionAngularTolerance(value: number) {
    this._projectionAngularTolerance = value;
    (<IHingeJoint>this._nativeJoint).setProjectionAngularTolerance(value);
  }

  /**
   * The anchor position.
   */
  get anchorPosition(): Vector3 {
    const position = new Vector3();
    if (this.collider0) {
      Vector3.add(this.collider0.entity.transform.worldPosition, this.localPosition0, position);
    } else {
      position.copyFrom(this.localPosition0);
    }
    return position;
  }

  /**
   * Set the anchor location.
   * @param position - The world position of anchor location.
   */
  setConnectedLocation(position: Vector3): void;

  /**
   * Set the anchor location.
   * @param relativePosition - The local position of anchor location.
   * @param collider - The collider.
   */
  setConnectedLocation(relativePosition: Vector3, collider: DynamicCollider): void;

  setConnectedLocation(relativePosition: Vector3, collider?: DynamicCollider): void {
    if (collider) {
      this.collider0 = collider;
    }
    this.localPosition0 = relativePosition;
  }

  /**
   * Set a cone hard limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param contactDist The distance from the limit at which it becomes active
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number = -1.0): void {
    (<IHingeJoint>this._nativeJoint).setHardLimit(lowerLimit, upperLimit, contactDist);
  }

  /**
   * Set a cone soft limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    (<IHingeJoint>this._nativeJoint).setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * sets a single flag specific to a Revolute Joint.
   * @param flag The flag to set or clear.
   * @param value the value to which to set the flag
   */
  setHingeJointFlag(flag: HingeJointFlag, value: boolean): void {
    (<IHingeJoint>this._nativeJoint).setRevoluteJointFlag(flag, value);
  }

  /**
   * @override
   * @internal
   */
  _onAwake() {
    const jointCollider0 = this._jointCollider0;
    const jointCollider1 = this._jointCollider1;
    jointCollider0.collider = null;
    jointCollider1.collider = this.entity.getComponent(DynamicCollider);
    this._nativeJoint = PhysicsManager._nativePhysics.createHingeJoint(
      null,
      jointCollider0.localPosition,
      jointCollider0.localRotation,
      jointCollider1.collider._nativeCollider,
      jointCollider1.localPosition,
      jointCollider1.localRotation
    );
  }
}
