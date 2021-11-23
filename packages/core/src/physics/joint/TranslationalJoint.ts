import { Joint } from "./Joint";
import { ITranslationalJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Vector3, Quaternion } from "@oasis-engine/math";

export class TranslationalJoint extends Joint {
  private _enableLimit: boolean = false;
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  get enableLimit(): boolean {
    return this._enableLimit;
  }

  set enableLimit(newValue) {
    this._enableLimit = newValue;
    (<ITranslationalJoint>this._nativeJoint).setPrismaticJointFlag(1 << 1, newValue);
  }

  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<ITranslationalJoint>this._nativeJoint).setProjectionLinearTolerance(newValue);
  }

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

  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    (<ITranslationalJoint>this._nativeJoint).setHardLimit(lowerLimit, upperLimit, contactDist);
  }

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    (<ITranslationalJoint>this._nativeJoint).setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }
}
