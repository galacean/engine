import { Joint } from "./Joint";
import { ISphericalJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Vector3, Quaternion } from "@oasis-engine/math";

export class SphericalJoint extends Joint {
  private _enableLimit: boolean = false;
  private _projectionLinearTolerance: number = 0;

  get enableLimit(): boolean {
    return this._enableLimit;
  }

  set enableLimit(newValue: boolean) {
    this._enableLimit = newValue;
    (<ISphericalJoint>this._nativeJoint).setSphericalJointFlag(1 << 1, newValue);
  }

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
}
