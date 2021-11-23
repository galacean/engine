import { Joint } from "./Joint";
import { ISpringJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Quaternion, Vector3 } from "@oasis-engine/math";

enum SpringJointFlag {
  MAX_DISTANCE_ENABLED = 2,
  MIN_DISTANCE_ENABLED = 4,
  SPRING_ENABLED = 8
}

export class SpringJoint extends Joint {
  private _minDistance: number = 0;
  private _maxDistance: number = 0;
  private _tolerance: number = 0;
  private _stiffness: number = 0;
  private _damping: number = 0;

  get minDistance(): number {
    return this._minDistance;
  }

  set minDistance(newValue: number) {
    this._minDistance = newValue;
    (<ISpringJoint>this._nativeJoint).setMinDistance(newValue);
  }

  get maxDistance(): number {
    return this._maxDistance;
  }

  set maxDistance(newValue: number) {
    this._maxDistance = newValue;
    (<ISpringJoint>this._nativeJoint).setMaxDistance(newValue);
  }

  get tolerance(): number {
    return this._tolerance;
  }

  set tolerance(newValue: number) {
    this._tolerance = newValue;
    (<ISpringJoint>this._nativeJoint).setTolerance(newValue);
  }

  get stiffness(): number {
    return this._stiffness;
  }

  set stiffness(newValue: number) {
    this._stiffness = newValue;
    (<ISpringJoint>this._nativeJoint).setStiffness(newValue);
  }

  get damping(): number {
    return this._damping;
  }

  set damping(newValue: number) {
    this._damping = newValue;
    (<ISpringJoint>this._nativeJoint).setDamping(newValue);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    this._nativeJoint = PhysicsManager._nativePhysics.createSpringJoint(
      collider0?._nativeCollider,
      new Vector3(),
      new Quaternion(),
      collider1?._nativeCollider,
      new Vector3(),
      new Quaternion()
    );
  }

  setDistanceJointFlag(flag: SpringJointFlag, value: boolean) {
    (<ISpringJoint>this._nativeJoint).setDistanceJointFlag(flag, value);
  }
}
