import { Joint } from "./Joint";
import { PhysicsManager } from "../PhysicsManager";
import { Collider } from "../Collider";
import { Vector3 } from "@oasis-engine/math";
import { IFixedJoint } from "@oasis-engine/design";

/*
 * A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export class FixedJoint extends Joint {
  /**
   * The connected anchor position.
   * @remarks If connectedCollider is set, this anchor is relative offset.
   * Or the anchor is world anchor position.
   */
  get connectedAnchor(): Vector3 {
    return this._connectedCollider.localPosition;
  }

  set connectedAnchor(value: Vector3) {
    const connectedAnchor = this._connectedCollider.localPosition;
    if (value !== connectedAnchor) {
      connectedAnchor.copyFrom(value);
    }
    (<IFixedJoint>this._nativeJoint).setConnectedAnchor(value);
  }

  /**
   * @override
   * @internal
   */
  _onAwake() {
    const collider = this._collider;
    collider.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsManager._nativePhysics.createFixedJoint(collider.collider._nativeCollider);
  }
}
