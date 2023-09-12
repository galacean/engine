import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Joint } from "./Joint";

/*
 * A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export class FixedJoint extends Joint {
  /**
   * @internal
   */
  override _onAwake() {
    const collider = this._collider;
    collider.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsManager._nativePhysics.createFixedJoint(collider.collider._nativeCollider);
  }
}
