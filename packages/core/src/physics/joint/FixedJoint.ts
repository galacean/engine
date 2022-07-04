import { Joint } from "./Joint";
import { IFixedJoint } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";
import { dependentComponents } from "../../ComponentsDependencies";
import { Collider } from "../Collider";
import { Vector3 } from "@oasis-engine/math";

/*
 * A fixed joint permits no relative movement between two bodies. ie the bodies are glued together.
 * @decorator `@dependentComponents(Collider)`
 */
@dependentComponents(Collider)
export class FixedJoint extends Joint {
  private static _offsetVector = new Vector3(1, 0, 0);

  /**
   * The connected collider.
   */
  get connectedCollider(): Collider {
    return this.collider0;
  }

  set connectedCollider(value: Collider) {
    const offsetVector = FixedJoint._offsetVector;
    Vector3.subtract(this.entity.transform.worldPosition, value.entity.transform.worldPosition, offsetVector);
    this.localPosition0 = offsetVector;
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
    jointCollider1.collider = this.entity.getComponent(Collider);
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
