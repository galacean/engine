import { Engine } from "../../Engine";
import { DynamicCollider } from "../DynamicCollider";
import { Joint } from "./Joint";

/*
 * A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export class FixedJoint extends Joint {
  protected _createJoint(collider: DynamicCollider): void {
    this._nativeJoint = Engine._nativePhysics.createFixedJoint(collider._nativeCollider);
  }
}
