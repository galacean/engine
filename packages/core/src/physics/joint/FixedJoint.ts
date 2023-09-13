import { Collider } from "../Collider";
import { PhysicsScene } from "../PhysicsScene";
import { Joint } from "./Joint";

/*
 * A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export class FixedJoint extends Joint {
  /**
   * @internal
   */
  override _onAwake() {
    const collider = this._connectedColliderInfo;
    collider.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsScene._nativePhysics.createFixedJoint(collider.collider._nativeCollider);
  }
}
