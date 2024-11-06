import { Collider } from "../Collider";
import { PhysicsScene } from "../PhysicsScene";
import { Joint } from "./Joint";

/*
 * A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export class FixedJoint extends Joint {
  protected _createJoint(): void {
    const collider = this.entity.getComponent(Collider);
    if (!collider) {
      throw new Error("FixedJoint requires a Collider component on the entity.");
    }
    const colliderInfo = this._colliderInfo;
    colliderInfo.collider = collider;
    this._nativeJoint = PhysicsScene._nativePhysics.createFixedJoint(colliderInfo.collider._nativeCollider);
  }
}
