import { Engine } from "../../Engine";
import { Collider } from "../Collider";
import { Joint } from "./Joint";

/*
 * A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export class FixedJoint extends Joint {
  protected _createJoint(): void {
    const colliderInfo = this._colliderInfo;
    colliderInfo.collider = this.entity.getComponent(Collider);
    this._nativeJoint = Engine._nativePhysics.createFixedJoint(colliderInfo.collider._nativeCollider);
  }
}
