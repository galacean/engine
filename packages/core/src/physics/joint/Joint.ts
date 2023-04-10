import { IJoint } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { Component } from "../../Component";
import { dependentComponents, DependentMode } from "../../ComponentsDependencies";
import { Entity } from "../../Entity";
import { Collider } from "../Collider";

/**
 * A base class providing common functionality for joints.
 * @decorator `@dependentComponents(Collider, DependentMode.CheckOnly)`
 */
@dependentComponents(Collider, DependentMode.CheckOnly)
export class Joint extends Component {
  protected _connectedCollider = new JointCollider();
  protected _collider = new JointCollider();
  protected _nativeJoint: IJoint;
  private _force: number = 0;
  private _torque: number = 0;

  /**
   * The connected collider.
   */
  get connectedCollider(): Collider {
    return this._connectedCollider.collider;
  }

  set connectedCollider(value: Collider) {
    if (this._connectedCollider.collider !== value) {
      this._connectedCollider.collider = value;
      this._nativeJoint.setConnectedCollider(value._nativeCollider);
    }
  }

  /**
   * The connected anchor position.
   * @remarks If connectedCollider is set, this anchor is relative offset, or the anchor is world position.
   */
  get connectedAnchor(): Vector3 {
    return this._connectedCollider.localPosition;
  }

  set connectedAnchor(value: Vector3) {
    const connectedAnchor = this._connectedCollider.localPosition;
    if (value !== connectedAnchor) {
      connectedAnchor.copyFrom(value);
    }
    this._nativeJoint.setConnectedAnchor(value);
  }

  /**
   *  The scale to apply to the inverse mass of collider 0 for resolving this constraint.
   */
  get connectedMassScale(): number {
    return this._connectedCollider.massScale;
  }

  set connectedMassScale(value: number) {
    if (value !== this._connectedCollider.massScale) {
      this._connectedCollider.massScale = value;
      this._nativeJoint.setConnectedMassScale(value);
    }
  }

  /**
   * The scale to apply to the inverse inertia of collider0 for resolving this constraint.
   */
  get connectedInertiaScale(): number {
    return this._connectedCollider.inertiaScale;
  }

  set connectedInertiaScale(value: number) {
    if (value !== this._connectedCollider.inertiaScale) {
      this._connectedCollider.inertiaScale = value;
      this._nativeJoint.setConnectedInertiaScale(value);
    }
  }

  /**
   * The scale to apply to the inverse mass of collider 1 for resolving this constraint.
   */
  get massScale(): number {
    return this._collider.massScale;
  }

  set massScale(value: number) {
    if (value !== this._collider.massScale) {
      this._collider.massScale = value;
      this._nativeJoint.setMassScale(value);
    }
  }

  /**
   * The scale to apply to the inverse inertia of collider1 for resolving this constraint.
   */
  get inertiaScale(): number {
    return this._collider.inertiaScale;
  }

  set inertiaScale(value: number) {
    if (value !== this._collider.inertiaScale) {
      this._collider.inertiaScale = value;
      this._nativeJoint.setInertiaScale(value);
    }
  }

  /**
   * The maximum force the joint can apply before breaking.
   */
  get breakForce(): number {
    return this._force;
  }

  set breakForce(value: number) {
    if (value !== this._force) {
      this._force = value;
      this._nativeJoint.setBreakForce(value);
    }
  }

  /**
   * The maximum torque the joint can apply before breaking.
   */
  get breakTorque(): number {
    return this._torque;
  }

  set breakTorque(value: number) {
    if (value !== this._torque) {
      this._torque = value;
      this._nativeJoint.setBreakTorque(value);
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._connectedCollider.localPosition = new Vector3();
  }
}

/**
 * @internal
 */
class JointCollider {
  collider: Collider = null;
  localPosition: Vector3;
  localRotation: Quaternion;
  massScale: number = 0;
  inertiaScale: number = 0;
}
