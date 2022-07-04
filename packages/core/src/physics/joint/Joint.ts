import { IJoint } from "@oasis-engine/design";
import { Vector3, Quaternion } from "@oasis-engine/math";
import { Collider } from "../Collider";
import { ConstraintFlag } from "../enums";
import { Component } from "../../Component";
import { DynamicCollider } from "../DynamicCollider";

/**
 * A base class providing common functionality for joints.
 */
export class Joint extends Component {
  private _force: number = 0;
  private _torque: number = 0;
  protected _nativeJoint: IJoint;
  protected _jointCollider0 = new JointCollider();
  protected _jointCollider1 = new JointCollider();

  /**
   *  The scale to apply to the inverse mass of collider 0 for resolving this constraint.
   */
  get invMassScale0(): number {
    return this._jointCollider0.invMassScale;
  }

  set invMassScale0(newValue: number) {
    this._jointCollider0.invMassScale = newValue;
    this._nativeJoint.setInvMassScale0(this._jointCollider0.invMassScale);
  }

  /**
   * The scale to apply to the inverse inertia of collider0 for resolving this constraint.
   */
  get invInertiaScale0(): number {
    return this._jointCollider0.invInertiaScale;
  }

  set invInertiaScale0(newValue: number) {
    this._jointCollider0.invInertiaScale = newValue;
    this._nativeJoint.setInvInertiaScale0(this._jointCollider0.invInertiaScale);
  }

  /**
   * The scale to apply to the inverse mass of collider 1 for resolving this constraint.
   */
  get invMassScale1(): number {
    return this._jointCollider1.invMassScale;
  }

  set invMassScale1(newValue: number) {
    this._jointCollider1.invMassScale = newValue;
    this._nativeJoint.setInvMassScale1(this._jointCollider1.invMassScale);
  }

  /**
   * The scale to apply to the inverse inertia of collider1 for resolving this constraint.
   */
  get invInertiaScale1(): number {
    return this._jointCollider1.invInertiaScale;
  }

  set invInertiaScale1(newValue: number) {
    this._jointCollider1.invInertiaScale = newValue;
    this._nativeJoint.setInvInertiaScale1(this._jointCollider1.invInertiaScale);
  }

  /**
   * The maximum force the joint can apply before breaking.
   */
  get BreakForce(): number {
    return this._force;
  }

  set BreakForce(newValue: number) {
    this._force = newValue;
    this._nativeJoint.setBreakForce(this._force, this._torque);
  }

  /**
   * The maximum torque the joint can apply before breaking.
   */
  get BreakTorque(): number {
    return this._torque;
  }

  set BreakTorque(newValue: number) {
    this._torque = newValue;
    this._nativeJoint.setBreakForce(this._force, this._torque);
  }

  /**
   * Set a constraint flags for this joint to a specified value.
   * @param flags the constraint flag
   * @param value the value to which to set the flag
   */
  setConstraintFlag(flags: ConstraintFlag, value: boolean): void {
    this._nativeJoint.setConstraintFlag(flags, value);
  }

  /**
   * The first collider.
   */
  protected get collider0(): DynamicCollider {
    return this._jointCollider0.collider;
  }

  protected set collider0(newValue: DynamicCollider) {
    this._jointCollider0.collider = newValue;
    this._nativeJoint.setActors(
      this._jointCollider0.collider?._nativeCollider,
      this._jointCollider1.collider?._nativeCollider
    );
  }

  /**
   * The second collider.
   */
  protected get collider1(): DynamicCollider {
    return this._jointCollider1.collider;
  }

  protected set collider1(newValue: DynamicCollider) {
    this._jointCollider1.collider = newValue;
    this._nativeJoint.setActors(
      this._jointCollider0.collider?._nativeCollider,
      this._jointCollider1.collider?._nativeCollider
    );
  }

  /**
   *  The local position for the first collider this joint.
   */
  protected get localPosition0(): Vector3 {
    return this._jointCollider0.localPosition;
  }

  protected set localPosition0(newValue: Vector3) {
    if (newValue !== this._jointCollider0.localPosition) {
      newValue.cloneTo(this._jointCollider0.localPosition);
      this._nativeJoint.setLocalPose(0, this._jointCollider0.localPosition, this._jointCollider0.localRotation);
    }
  }

  /**
   *  The local rotation for the first collider this joint.
   */
  protected get localRotation0(): Quaternion {
    return this._jointCollider0.localRotation;
  }

  protected set localRotation0(newValue: Quaternion) {
    if (newValue !== this._jointCollider0.localRotation) {
      newValue.cloneTo(this._jointCollider0.localRotation);
      this._nativeJoint.setLocalPose(0, this._jointCollider0.localPosition, this._jointCollider0.localRotation);
    }
  }

  /**
   *  The local position for the second collider this joint.
   */
  protected get localPosition1(): Vector3 {
    return this._jointCollider1.localPosition;
  }

  protected set localPosition1(newValue: Vector3) {
    if (newValue !== this._jointCollider1.localPosition) {
      newValue.cloneTo(this._jointCollider1.localPosition);
      this._nativeJoint.setLocalPose(1, this._jointCollider1.localPosition, this._jointCollider1.localRotation);
    }
  }

  /**
   *  The local rotation for the second collider this joint.
   */
  protected get localRotation1(): Quaternion {
    return this._jointCollider1.localRotation;
  }

  protected set localRotation1(newValue: Quaternion) {
    if (newValue !== this._jointCollider1.localRotation) {
      newValue.cloneTo(this._jointCollider1.localRotation);
      this._nativeJoint.setLocalPose(1, this._jointCollider1.localPosition, this._jointCollider1.localRotation);
    }
  }
}

class JointCollider {
  collider: DynamicCollider;
  localPosition = new Vector3();
  localRotation = new Quaternion();
  invMassScale: number = 0;
  invInertiaScale: number = 0;
}
