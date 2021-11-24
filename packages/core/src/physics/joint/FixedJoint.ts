import { Joint } from "./Joint";
import { IFixedJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";

/*
 * A fixed joint permits no relative movement between two bodies. ie the bodies are glued together.
 */
export class FixedJoint extends Joint {
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  /**
   * The linear tolerance threshold.
   */
  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<IFixedJoint>this._nativeJoint).setProjectionLinearTolerance(this._projectionLinearTolerance);
  }

  /**
   * The angular tolerance threshold in radians.
   */
  get projectionAngularTolerance(): number {
    return this._projectionAngularTolerance;
  }

  set projectionAngularTolerance(newValue: number) {
    this._projectionAngularTolerance = newValue;
    (<IFixedJoint>this._nativeJoint).setProjectionAngularTolerance(this._projectionAngularTolerance);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    const jointActor0 = this._jointActor0;
    const jointActor1 = this._jointActor1;
    jointActor0._collider = collider0;
    jointActor1._collider = collider1;
    this._nativeJoint = PhysicsManager._nativePhysics.createFixedJoint(
      collider0?._nativeCollider,
      jointActor0._localPosition,
      jointActor0._localRotation,
      collider1?._nativeCollider,
      jointActor1._localPosition,
      jointActor1._localRotation
    );
  }
}
