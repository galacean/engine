import { Joint } from "./Joint";
import { ISphericalJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export class SphericalJoint extends Joint {
  /**
   * Set a cone hard limit.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number = -1.0): void {
    (<ISphericalJoint>this._nativeJoint).setHardLimitCone(yLimitAngle, zLimitAngle, contactDist);
  }

  /**
   * Set a cone soft limit.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void {
    (<ISphericalJoint>this._nativeJoint).setSoftLimitCone(yLimitAngle, zLimitAngle, stiffness, damping);
  }

  /**
   * @override
   * @internal
   */
  _onAwake() {
    const collider = this._collider;
    collider.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsManager._nativePhysics.createSphericalJoint(collider.collider._nativeCollider);
  }
}
