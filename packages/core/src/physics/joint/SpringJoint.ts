import { Joint } from "./Joint";
import { ISpringJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { SpringJointFlag } from "../enums";

/**
 * A joint that maintains an upper or lower bound (or both) on the distance between two points on different objects.
 */
export class SpringJoint extends Joint {
  private _minDistance: number = 0;
  private _maxDistance: number = 0;
  private _tolerance: number = 0;
  private _stiffness: number = 0;
  private _damping: number = 0;

  /**
   * The minimum distance.
   */
  get minDistance(): number {
    return this._minDistance;
  }

  set minDistance(newValue: number) {
    this._minDistance = newValue;
    (<ISpringJoint>this._nativeJoint).setMinDistance(newValue);
  }

  /**
   * The maximum distance.
   */
  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(newValue: number) {
    this._maxDistance = newValue;
    (<ISpringJoint>this._nativeJoint).setMaxDistance(newValue);
  }

  /**
   * The distance beyond the allowed range at which the joint becomes active.
   */
  get tolerance(): number {
    return this._tolerance;
  }

  set tolerance(newValue: number) {
    this._tolerance = newValue;
    (<ISpringJoint>this._nativeJoint).setTolerance(newValue);
  }

  /**
   * The spring strength of the joint.
   */
  get stiffness(): number {
    return this._stiffness;
  }

  set stiffness(newValue: number) {
    this._stiffness = newValue;
    (<ISpringJoint>this._nativeJoint).setStiffness(newValue);
  }

  /**
   * The degree of damping of the joint spring of the joint.
   */
  get damping(): number {
    return this._damping;
  }

  set damping(newValue: number) {
    this._damping = newValue;
    (<ISpringJoint>this._nativeJoint).setDamping(newValue);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    const jointActor0 = this._jointActor0;
    const jointActor1 = this._jointActor1;
    jointActor0._collider = collider0;
    jointActor1._collider = collider1;
    this._nativeJoint = PhysicsManager._nativePhysics.createSpringJoint(
      collider0?._nativeCollider,
      jointActor0._localPosition,
      jointActor0._localRotation,
      collider1?._nativeCollider,
      jointActor1._localPosition,
      jointActor1._localRotation
    );
  }

  /**
   * Set a single flag specific to a Distance Joint to true or false.
   * @param flag The flag to set or clear.
   * @param value the value to which to set the flag
   */
  setDistanceJointFlag(flag: SpringJointFlag, value: boolean): void {
    (<ISpringJoint>this._nativeJoint).setDistanceJointFlag(flag, value);
  }
}
