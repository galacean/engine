import { IJoint } from "@oasis-engine/design";
import { Vector3, Quaternion } from "@oasis-engine/math";
import { Collider } from "../Collider";
import { ConstraintFlag } from "../enums";

/**
 * A base class providing common functionality for joints.
 */
export class Joint {
  /** @internal */
  _nativeJoint: IJoint;

  private _force: number = 0;
  private _torque: number = 0;
  protected _jointActor0 = new JointActor();
  protected _jointActor1 = new JointActor();

  /**
   * The first actor.
   */
  get actor0(): Collider {
    return this._jointActor0._collider;
  }

  set actor0(newValue: Collider) {
    this._jointActor0._collider = newValue;
    this._nativeJoint.setActors(
      this._jointActor0._collider?._nativeCollider,
      this._jointActor1._collider?._nativeCollider
    );
  }

  /**
   * The second actor.
   */
  get actor1(): Collider {
    return this._jointActor1._collider;
  }

  set actor1(newValue: Collider) {
    this._jointActor1._collider = newValue;
    this._nativeJoint.setActors(
      this._jointActor0._collider?._nativeCollider,
      this._jointActor1._collider?._nativeCollider
    );
  }

  /**
   *  The local position for the first actor this joint.
   */
  get localPosition0(): Vector3 {
    return this._jointActor0._localPosition;
  }

  set localPosition0(newValue: Vector3) {
    if (newValue !== this._jointActor0._localPosition) {
      newValue.cloneTo(this._jointActor0._localPosition);
      this._nativeJoint.setLocalPose(0, this._jointActor0._localPosition, this._jointActor0._localRotation);
    }
  }

  /**
   *  The local rotation for the first actor this joint.
   */
  get localRotation0(): Quaternion {
    return this._jointActor0._localRotation;
  }

  set localRotation0(newValue: Quaternion) {
    if (newValue !== this._jointActor0._localRotation) {
      newValue.cloneTo(this._jointActor0._localRotation);
      this._nativeJoint.setLocalPose(0, this._jointActor0._localPosition, this._jointActor0._localRotation);
    }
  }

  /**
   *  The local position for the second actor this joint.
   */
  get localPosition1(): Vector3 {
    return this._jointActor1._localPosition;
  }

  set localPosition1(newValue: Vector3) {
    if (newValue !== this._jointActor1._localPosition) {
      newValue.cloneTo(this._jointActor1._localPosition);
      this._nativeJoint.setLocalPose(1, this._jointActor1._localPosition, this._jointActor1._localRotation);
    }
  }

  /**
   *  The local rotation for the second actor this joint.
   */
  get localRotation1(): Quaternion {
    return this._jointActor1._localRotation;
  }

  set localRotation1(newValue: Quaternion) {
    if (newValue !== this._jointActor1._localRotation) {
      newValue.cloneTo(this._jointActor1._localRotation);
      this._nativeJoint.setLocalPose(1, this._jointActor1._localPosition, this._jointActor1._localRotation);
    }
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
   *  The scale to apply to the inverse mass of actor 0 for resolving this constraint.
   */
  get invMassScale0(): number {
    return this._jointActor0._invMassScale;
  }

  set invMassScale0(newValue: number) {
    this._jointActor0._invMassScale = newValue;
    this._nativeJoint.setInvMassScale0(this._jointActor0._invMassScale);
  }

  /**
   * The scale to apply to the inverse inertia of actor0 for resolving this constraint.
   */
  get invInertiaScale0(): number {
    return this._jointActor0._invInertiaScale;
  }

  set invInertiaScale0(newValue: number) {
    this._jointActor0._invInertiaScale = newValue;
    this._nativeJoint.setInvInertiaScale0(this._jointActor0._invInertiaScale);
  }

  /**
   * The scale to apply to the inverse mass of actor 1 for resolving this constraint.
   */
  get invMassScale1(): number {
    return this._jointActor1._invMassScale;
  }

  set invMassScale1(newValue: number) {
    this._jointActor1._invMassScale = newValue;
    this._nativeJoint.setInvMassScale1(this._jointActor1._invMassScale);
  }

  /**
   * The scale to apply to the inverse inertia of actor1 for resolving this constraint.
   */
  get invInertiaScale1(): number {
    return this._jointActor1._invInertiaScale;
  }

  set invInertiaScale1(newValue: number) {
    this._jointActor1._invInertiaScale = newValue;
    this._nativeJoint.setInvInertiaScale1(this._jointActor1._invInertiaScale);
  }

  /**
   * Set a constraint flags for this joint to a specified value.
   * @param flags the constraint flag
   * @param value the value to which to set the flag
   */
  setConstraintFlag(flags: ConstraintFlag, value: boolean): void {
    this._nativeJoint.setConstraintFlag(flags, value);
  }
}

class JointActor {
  _collider: Collider;
  _localPosition = new Vector3();
  _localRotation = new Quaternion();
  _invMassScale: number = 0;
  _invInertiaScale: number = 0;
}
