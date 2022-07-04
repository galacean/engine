import { Joint } from "./Joint";
import { IFixedJoint } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";
import { dependentComponents } from "../../ComponentsDependencies";
import { DynamicCollider } from "../DynamicCollider";

/*
 * A fixed joint permits no relative movement between two bodies. ie the bodies are glued together.
 * @decorator `@dependentComponents(DynamicCollider)`
 */
@dependentComponents(DynamicCollider)
export class FixedJoint extends Joint {
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  /**
   * The linear tolerance threshold.
   */
  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(value: number) {
    this._projectionLinearTolerance = value;
    (<IFixedJoint>this._nativeJoint).setProjectionLinearTolerance(this._projectionLinearTolerance);
  }

  /**
   * The angular tolerance threshold in radians.
   */
  get projectionAngularTolerance(): number {
    return this._projectionAngularTolerance;
  }

  set projectionAngularTolerance(value: number) {
    this._projectionAngularTolerance = value;
    (<IFixedJoint>this._nativeJoint).setProjectionAngularTolerance(this._projectionAngularTolerance);
  }

  /**
   * The anchor collider.
   */
  get anchorCollider(): DynamicCollider {
    return this.collider0;
  }

  set anchorCollider(value: DynamicCollider) {
    this.collider0 = value;
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
    this._nativeJoint = PhysicsManager._nativePhysics.createFixedJoint(
      null,
      jointCollider0.localPosition,
      jointCollider0.localRotation,
      jointCollider1.collider._nativeCollider,
      jointCollider1.localPosition,
      jointCollider1.localRotation
    );
  }
}
