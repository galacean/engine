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
   * @override
   * @internal
   */
  _onAwake() {
    const collider = this._collider;
    collider.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsManager._nativePhysics.createFixedJoint(collider.collider._nativeCollider);
  }
}
