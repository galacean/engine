import { IJoint } from "@oasis-engine/design";
import { Vector3, Quaternion } from "@oasis-engine/math";
import { ConstraintFlag } from "../enums";
import { Component } from "../../Component";
import { Collider } from "../Collider";

/**
 * A base class providing common functionality for joints.
 */
export class Joint extends Component {
  private _force: number = 0;
  private _torque: number = 0;
  private _flags: number = 0;
  protected _connectedCollider = new JointCollider();
  protected _collider = new JointCollider();
  protected _nativeJoint: IJoint;

  /**
   * The connected collider.
   */
  get connectedCollider(): Collider {
    return this._connectedCollider.collider;
  }

  set connectedCollider(value: Collider) {
    this._connectedCollider.collider = value;
    this._nativeJoint.setConnectedCollider(value._nativeCollider);
  }

  /**
   *  The scale to apply to the inverse mass of collider 0 for resolving this constraint.
   */
  get connectedMassScale(): number {
    return this._connectedCollider.massScale;
  }

  set connectedMassScale(value: number) {
    this._connectedCollider.massScale = value;
    this._nativeJoint.setConnectedMassScale(value);
  }

  /**
   * The scale to apply to the inverse inertia of collider0 for resolving this constraint.
   */
  get connectedInertiaScale(): number {
    return this._connectedCollider.inertiaScale;
  }

  set connectedInertiaScale(value: number) {
    this._connectedCollider.inertiaScale = value;
    this._nativeJoint.setConnectedInertiaScale(value);
  }

  /**
   * The scale to apply to the inverse mass of collider 1 for resolving this constraint.
   */
  get massScale(): number {
    return this._collider.massScale;
  }

  set massScale(value: number) {
    this._collider.massScale = value;
    this._nativeJoint.setMassScale(value);
  }

  /**
   * The scale to apply to the inverse inertia of collider1 for resolving this constraint.
   */
  get inertiaScale(): number {
    return this._collider.inertiaScale;
  }

  set inertiaScale(value: number) {
    this._collider.inertiaScale = value;
    this._nativeJoint.setInertiaScale(value);
  }

  /**
   * The maximum force the joint can apply before breaking.
   */
  get breakForce(): number {
    return this._force;
  }

  set breakForce(value: number) {
    this._force = value;
    this._nativeJoint.setBreakForce(value);
  }

  /**
   * The maximum torque the joint can apply before breaking.
   */
  get breakTorque(): number {
    return this._torque;
  }

  set breakTorque(value: number) {
    this._torque = value;
    this._nativeJoint.setBreakTorque(value);
  }

  /**
   * Constraint flags for this joint.
   */
  get constraints(): number {
    return this._flags;
  }

  set constraints(value: number) {
    this._flags = value;
    this._nativeJoint.setConstraintFlags(value);
  }
}

class JointCollider {
  collider: Collider = null;
  localPosition = new Vector3();
  localRotation = new Quaternion();
  massScale: number = 0;
  inertiaScale: number = 0;
}
