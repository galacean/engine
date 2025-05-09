import { IJoint } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * a base interface providing common functionality for PhysX joints
 */
export class PhysXJoint implements IJoint {
  protected static _defaultVec = new Vector3();
  protected static _defaultQuat = new Quaternion();

  protected _pxJoint: any;
  protected _anchor: Vector3;
  protected _connectedAnchor: Vector3;
  protected _rotation: Quaternion = new Quaternion();
  protected _collider: PhysXCollider;
  private _breakForce: number = Number.MAX_VALUE;
  private _breakTorque: number = Number.MAX_VALUE;

  protected _physXPhysics: PhysXPhysics;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc IJoint.setConnectedCollider }
   */
  setConnectedCollider(value: PhysXCollider): void {
    this._pxJoint.setActors(this._collider?._pxActor || null, value?._pxActor || null);
  }

  /**
   * {@inheritDoc IJoint.setConnectedAnchor }
   */
  setAnchor(value: Vector3): void {
    this._setLocalPose(0, value, PhysXJoint._defaultQuat);
    this._anchor = value;
  }

  /**
   * {@inheritDoc IJoint.setConnectedAnchor }
   */
  setConnectedAnchor(value: Vector3): void {
    this._setLocalPose(1, value, this._rotation);
    this._connectedAnchor = value;
  }

  setRotation(value: Quaternion): void {
    this._setLocalPose(1, this._connectedAnchor, value);
    this._rotation.copyFrom(value);
  }

  /**
   * {@inheritDoc IJoint.setMassScale }
   */
  setMassScale(value: number): void {
    this._pxJoint.setInvMassScale0(1 / value);
  }

  /**
   * {@inheritDoc IJoint.setConnectedMassScale }
   */
  setConnectedMassScale(value: number): void {
    this._pxJoint.setInvMassScale1(1 / value);
  }

  /**
   * {@inheritDoc IJoint.setInertiaScale }
   */
  setInertiaScale(value: number): void {
    this._pxJoint.setInvInertiaScale0(value);
  }

  /**
   * {@inheritDoc IJoint.setConnectedInertiaScale }
   */
  setConnectedInertiaScale(value: number): void {
    this._pxJoint.setInvInertiaScale1(value);
  }

  /**
   * {@inheritDoc IJoint.setBreakForce }
   */
  setBreakForce(value: number): void {
    this._breakForce = value;
    this._pxJoint.setBreakForce(this._breakForce, this._breakTorque);
  }

  /**
   * {@inheritDoc IJoint.setBreakTorque }
   */
  setBreakTorque(value: number): void {
    this._breakTorque = value;
    this._pxJoint.setBreakForce(this._breakForce, this._breakTorque);
  }

  /**
   * {@inheritDoc IJoint.destroy }
   */
  destroy(): void {
    if (!this._pxJoint) return;
    this._pxJoint.release();
    this._collider = null;
  }
  /**
   * Set the joint local pose for an actor.
   * @param actor 0 for the first actor, 1 for the second actor.
   * @param position the local position for the actor this joint
   * @param rotation the local rotation for the actor this joint
   */
  protected _setLocalPose(actor: number, position: Vector3, rotation: Quaternion): void {
    this._pxJoint.setLocalPose(actor, position, rotation);
  }
}
