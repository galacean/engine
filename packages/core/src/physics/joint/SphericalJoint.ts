import { Joint } from "./Joint";
import { ISphericalJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export class SphericalJoint extends Joint {
  private _yLimit = Math.PI / 2;
  private _zLimit = Math.PI / 2;
  private _contactDistance = -1;
  private _stiffness = 0;
  private _damping = 0;
  private _enableSpring = false;

  /** Whether enable spring limit */
  get enableSpring(): boolean {
    return this._enableSpring;
  }

  set enableSpring(value: boolean) {
    this._enableSpring = value;
    (<ISphericalJoint>this._nativeJoint).enableSpring(value);
  }

  /** The limit angle from the Y-axis of the constraint frame. */
  get yLimit(): number {
    return this._yLimit;
  }

  set yLimit(value: number) {
    this._yLimit = value;
    (<ISphericalJoint>this._nativeJoint).setYLimit(value);
  }

  /** The limit angle from the Z-axis of the constraint frame. */
  get zLimit(): number {
    return this._zLimit;
  }

  set zLimit(value: number) {
    this._zLimit = value;
    (<ISphericalJoint>this._nativeJoint).setZLimit(value);
  }

  /** Distance inside the limit value at which the limit will be considered to be active by the solver. */
  get contactDistance(): number {
    return this._contactDistance;
  }

  set contactDistance(value: number) {
    this._contactDistance = value;
    (<ISphericalJoint>this._nativeJoint).setContactDistance(value);
  }

  /** The spring forces used to reach the target position. */
  get stiffness(): number {
    return this._stiffness;
  }

  set stiffness(value: number) {
    this._stiffness = value;
    (<ISphericalJoint>this._nativeJoint).setStiffness(value);
  }

  /** The damper force uses to dampen the spring. */
  get damping(): number {
    return this._damping;
  }

  set damping(value: number) {
    this._damping = value;
    (<ISphericalJoint>this._nativeJoint).setDamping(value);
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
