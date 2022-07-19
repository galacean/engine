import { Joint } from "./Joint";
import { PhysicsManager } from "../PhysicsManager";
import { Collider } from "../Collider";
import { Vector3 } from "@oasis-engine/math";

/*
 * A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export class FixedJoint extends Joint {
  /**
   * @override
   * @internal
   */
  _onAwake() {
    const { _connectedCollider: connectedCollider, _collider: collider } = this;
    connectedCollider.localPosition = new Vector3();
    collider.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsManager._nativePhysics.createFixedJoint(collider.collider._nativeCollider);
  }
}
